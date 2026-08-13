import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  QuestionAdminConflictError,
  QuestionAdminValidationError,
  listQuestionCaptureRequests,
  loadAdminQuestionIndex,
  readCaptureSummary,
  replaceQuestionOriginal,
  saveQuestionCaptureRequest,
  saveQuestionRedactions,
  resolveCaptureCandidatePath,
  resolveCaptureOutputPath,
  resolveQuestionAssetPath,
  updateQuestionAnswer,
  type AdminQuestion,
  type CaptureSummary,
  type QuestionCaptureRequestSummary,
  type QuestionRedactionRenderer,
} from './question-admin.ts'
import {
  createCaptureRequest,
  formatTimestamp,
  parseCandidateNumber,
} from './video-frame-selection.ts'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const auditPath = resolve(repositoryRoot, 'QUESTION_REDACTION_AUDIT.html')
const framePickerPath = resolve(scriptDirectory, 'select-video-frame.ts')
const bindHost = '127.0.0.1'
const defaultPort = 4179
const maximumRequestBytes = 32 * 1024
const sessionCookieName = 'proscene_question_admin_session'

export interface ServerOptions {
  catalogSync?: (repositoryRoot: string) => Promise<CommandResult>
  framePicker?: (arguments_: readonly string[]) => Promise<CommandResult>
  openBrowser: boolean
  port: number
  redactionRenderer?: QuestionRedactionRenderer
  repositoryRoot?: string
}

interface CommandResult {
  stderr: string
  stdout: string
}

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

class FramePickerError extends HttpError {
  constructor(message: string) {
    super(422, message)
  }
}

function usage(): string {
  return `Usage:
  npm run questions:admin

Options:
  --port <number>  Bind a different loopback port (default: ${defaultPort})
  --no-open        Do not open the authenticated admin URL automatically
  --help           Show this help`
}

function argumentValue(arguments_: readonly string[], index: number, name: string): string {
  const value = arguments_[index + 1]

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function parseArguments(arguments_: readonly string[]): ServerOptions | null {
  const options: ServerOptions = { openBrowser: true, port: defaultPort }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === '--help') {
      return null
    }

    if (argument === '--no-open') {
      options.openBrowser = false
      continue
    }

    const equalsIndex = argument.indexOf('=')
    const name = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex)
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1)

    if (name !== '--port') {
      throw new Error(`Unknown argument: ${argument}`)
    }

    const value = inlineValue ?? argumentValue(arguments_, index, name)

    if (inlineValue === undefined) {
      index += 1
    }

    const port = Number(value)

    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('--port must be a whole number from 1 to 65535')
    }

    options.port = port
  }

  return options
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  )
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.end(body)
}

async function sendFile(response: ServerResponse, path: string, contentType: string): Promise<void> {
  const metadata = await stat(path)

  if (!metadata.isFile()) {
    throw new HttpError(404, 'File was not found')
  }

  response.statusCode = 200
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Length', metadata.size)

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path)
    stream.on('error', reject)
    response.on('close', resolvePromise)
    response.on('finish', resolvePromise)
    stream.pipe(response)
  })
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie

  if (header === undefined) {
    return null
  }

  for (const part of header.split(';')) {
    const equalsIndex = part.indexOf('=')

    if (equalsIndex === -1) {
      continue
    }

    if (part.slice(0, equalsIndex).trim() === name) {
      return decodeURIComponent(part.slice(equalsIndex + 1).trim())
    }
  }

  return null
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type'] ?? ''

  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Request body must use application/json')
  }

  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length

    if (size > maximumRequestBytes) {
      throw new HttpError(413, 'Request body is too large')
    }

    chunks.push(buffer)
  }

  let value: unknown

  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON')
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must contain a JSON object')
  }

  return value as Record<string, unknown>
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field]

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${field} must be a non-empty string`)
  }

  return value.trim()
}

function displayLog(result: CommandResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n')
}

function batchLog(value: string): string {
  const maximumLength = 16 * 1024
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, maximumLength)}\n… batch log truncated`
}

async function runFramePicker(
  arguments_: readonly string[],
  workingDirectory = repositoryRoot,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [framePickerPath, ...arguments_], {
      cwd: workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutSize = 0
    let stderrSize = 0

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutSize < 128 * 1024) {
        stdout.push(chunk)
        stdoutSize += chunk.length
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrSize < 128 * 1024) {
        stderr.push(chunk)
        stderrSize += chunk.length
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      const result = {
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      }

      if (code === 0) {
        resolvePromise(result)
      } else {
        reject(
          new FramePickerError(
            displayLog(result) || `Frame picker exited with code ${code ?? 'unknown'}`,
          ),
        )
      }
    })
  })
}

async function runQuestionCatalogSync(root: string): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/sync-question-catalog.ts')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const result = {
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
      }
      if (code === 0) resolvePromise(result)
      else reject(new Error(displayLog(result) || `Question catalog sync exited with code ${code ?? 'unknown'}`))
    })
  })
}

function browserQuestion(question: AdminQuestion): Record<string, unknown> {
  const root = `/api/questions/${question.id}/assets`

  return {
    ...question,
    originalPath: `${root}/original?v=${question.originalSha256}`,
    questionManifestPath: `${root}/question-manifest`,
    redactedPath:
      question.redactedSha256 === null
        ? ''
        : `${root}/redacted?v=${question.redactedSha256}`,
    redactionManifestPath:
      question.reviewStatus === 'missing' ? '' : `${root}/redaction-manifest`,
  }
}

function browserCapture(capture: CaptureSummary): Record<string, unknown> {
  const stage = (name: 'coarse' | 'fine', value: CaptureSummary[typeof name]) =>
    value === null
      ? null
      : {
          ...value,
          candidates: value.candidates.map((candidate) => ({
            ...candidate,
            imageUrl: `/api/captures/${capture.captureId}/assets/${name}/${candidate.file}`,
          })),
        }

  return {
    ...capture,
    coarse: stage('coarse', capture.coarse),
    fine: stage('fine', capture.fine),
    output:
      capture.output === null
        ? null
        : {
            ...capture.output,
            imageUrl: `/api/captures/${capture.captureId}/output?v=${capture.output.sha256}`,
          },
  }
}

function openBrowser(url: string): void {
  let command: string
  let arguments_: readonly string[]

  if (process.platform === 'win32') {
    command = 'rundll32.exe'
    arguments_ = ['url.dll,FileProtocolHandler', url]
  } else if (process.platform === 'darwin') {
    command = 'open'
    arguments_ = [url]
  } else {
    command = 'xdg-open'
    arguments_ = [url]
  }

  const child = spawn(command, arguments_, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => undefined)
  child.unref()
}

export function createQuestionAdminServer(options: ServerOptions): {
  ready: Promise<{ authenticatedUrl: string; baseUrl: string }>
  server: Server
} {
  const sessionToken = randomBytes(32).toString('base64url')
  const activeCaptures = new Set<string>()
  const activeQuestions = new Set<string>()
  const serverRepositoryRoot = options.repositoryRoot ?? repositoryRoot
  const framePicker =
    options.framePicker ??
    (async (arguments_: readonly string[]) =>
      await runFramePicker(arguments_, serverRepositoryRoot))
  let captureBatchActive = false
  let baseUrl = ''
  let expectedHost = ''

  async function withCaptureLock<T>(captureId: string, work: () => Promise<T>): Promise<T> {
    if (activeCaptures.has(captureId)) {
      throw new HttpError(409, `Capture ${captureId} is already being processed`)
    }

    activeCaptures.add(captureId)

    try {
      return await work()
    } finally {
      activeCaptures.delete(captureId)
    }
  }

  async function withQuestionLock<T>(questionId: string, work: () => Promise<T>): Promise<T> {
    if (activeQuestions.has(questionId)) {
      throw new HttpError(409, `Question ${questionId} is already being updated`)
    }

    activeQuestions.add(questionId)
    try {
      return await work()
    } finally {
      activeQuestions.delete(questionId)
    }
  }

  async function catalogSyncResult(): Promise<{ log: string; ok: boolean }> {
    try {
      const result = await (options.catalogSync ?? runQuestionCatalogSync)(serverRepositoryRoot)
      return { log: displayLog(result), ok: true }
    } catch (error) {
      return { log: error instanceof Error ? error.message : String(error), ok: false }
    }
  }

  const server = createServer((request, response) => {
    void (async () => {
      securityHeaders(response)

      if (request.headers.host !== expectedHost) {
        throw new HttpError(421, 'Unexpected Host header')
      }

      const requestUrl = new URL(request.url ?? '/', baseUrl)

      if (request.method === 'GET' && requestUrl.pathname === '/' && requestUrl.searchParams.has('token')) {
        const suppliedToken = requestUrl.searchParams.get('token') ?? ''

        if (!safeEqual(suppliedToken, sessionToken)) {
          throw new HttpError(401, 'Invalid admin launch token')
        }

        response.statusCode = 303
        response.setHeader(
          'Set-Cookie',
          `${sessionCookieName}=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
        )
        response.setHeader('Location', '/')
        response.end()
        return
      }

      const sessionCookie = cookieValue(request, sessionCookieName)

      if (sessionCookie === null || !safeEqual(sessionCookie, sessionToken)) {
        throw new HttpError(
          401,
          'This local admin session is not authenticated. Restart npm run questions:admin and use the opened URL.',
        )
      }

      if (request.method === 'POST') {
        if (
          request.headers.origin !== baseUrl ||
          request.headers['x-question-admin-request'] !== '1'
        ) {
          throw new HttpError(403, 'Mutation request did not originate from this admin panel')
        }
      }

      if (
        request.method === 'GET' &&
        (requestUrl.pathname === '/' || requestUrl.pathname === '/QUESTION_REDACTION_AUDIT.html')
      ) {
        await sendFile(response, auditPath, 'text/html; charset=utf-8')
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
        response.statusCode = 204
        response.end()
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
        sendJson(response, 200, { localOnly: true, status: 'ok' })
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/questions') {
        const index = await loadAdminQuestionIndex(serverRepositoryRoot)
        sendJson(response, 200, {
          editions: index.editions,
          issues: index.issues,
          questions: index.questions.map(browserQuestion),
          schemaVersion: 1,
        })
        return
      }

      const questionAssetMatch = requestUrl.pathname.match(
        /^\/api\/questions\/(q-[0-9a-hj-km-np-tv-z]{12})\/assets\/(original|redacted|question-manifest|redaction-manifest)$/,
      )

      if (request.method === 'GET' && questionAssetMatch !== null) {
        const questionId = questionAssetMatch[1]
        const asset = questionAssetMatch[2] as
          | 'original'
          | 'question-manifest'
          | 'redacted'
          | 'redaction-manifest'
        const path = await resolveQuestionAssetPath(serverRepositoryRoot, questionId ?? '', asset)
        const contentType = {
          original: 'image/png',
          'question-manifest': 'application/json; charset=utf-8',
          redacted: 'image/webp',
          'redaction-manifest': 'application/json; charset=utf-8',
        }[asset]
        await sendFile(response, path, contentType)
        return
      }

      const captureAssetMatch = requestUrl.pathname.match(
        /^\/api\/captures\/(capture-[0-9a-f]{16})\/assets\/(coarse|fine)\/(frame-\d{2,3}\.png)$/,
      )

      if (request.method === 'GET' && captureAssetMatch !== null) {
        const path = await resolveCaptureCandidatePath(
          serverRepositoryRoot,
          captureAssetMatch[1] ?? '',
          captureAssetMatch[2] as 'coarse' | 'fine',
          captureAssetMatch[3] ?? '',
        )
        await sendFile(response, path, 'image/png')
        return
      }

      const captureOutputMatch = requestUrl.pathname.match(
        /^\/api\/captures\/(capture-[0-9a-f]{16})\/output$/,
      )

      if (request.method === 'GET' && captureOutputMatch !== null) {
        const path = await resolveCaptureOutputPath(serverRepositoryRoot, captureOutputMatch[1] ?? '')
        await sendFile(response, path, 'image/png')
        return
      }

      const captureMatch = requestUrl.pathname.match(
        /^\/api\/captures\/(capture-[0-9a-f]{16})$/,
      )

      if (request.method === 'GET' && captureMatch !== null) {
        const capture = await readCaptureSummary(serverRepositoryRoot, captureMatch[1] ?? '')
        sendJson(response, 200, { capture: browserCapture(capture) })
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/captures') {
        const body = await readJsonBody(request)
        const sourceUrl = requiredString(body, 'url')
        const timestamp = requiredString(body, 'timestamp')
        let captureRequest: ReturnType<typeof createCaptureRequest>

        try {
          captureRequest = createCaptureRequest(sourceUrl, timestamp)
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : String(error))
        }

        const command = await withCaptureLock(captureRequest.captureId, async () =>
          await framePicker([
            '--url',
            captureRequest.canonicalUrl,
            '--timestamp',
            formatTimestamp(captureRequest.roughTimestampSeconds),
            '--no-open',
          ]),
        )
        const capture = await readCaptureSummary(serverRepositoryRoot, captureRequest.captureId)
        sendJson(response, 200, { capture: browserCapture(capture), log: displayLog(command) })
        return
      }

      const captureStageMatch = requestUrl.pathname.match(
        /^\/api\/captures\/(capture-[0-9a-f]{16})\/(coarse|final)$/,
      )

      if (request.method === 'POST' && captureStageMatch !== null) {
        const captureId = captureStageMatch[1] ?? ''
        const stageName = captureStageMatch[2] as 'coarse' | 'final'
        const body = await readJsonBody(request)
        const captureBefore = await readCaptureSummary(serverRepositoryRoot, captureId)
        const candidates = stageName === 'coarse' ? captureBefore.coarse?.candidates : captureBefore.fine?.candidates

        if (candidates === undefined || candidates === null) {
          throw new HttpError(409, `${stageName} candidates are not ready`)
        }

        let candidateNumber: number

        try {
          candidateNumber = parseCandidateNumber(
            typeof body.candidateNumber === 'number' || typeof body.candidateNumber === 'string'
              ? body.candidateNumber
              : '',
            candidates.length,
          )
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : String(error))
        }

        const command = await withCaptureLock(captureId, async () =>
          await framePicker([
            '--url',
            captureBefore.request.canonicalUrl,
            '--timestamp',
            formatTimestamp(captureBefore.request.roughTimestampSeconds),
            `--${stageName}`,
            candidateNumber.toString(),
            '--no-open',
          ]),
        )
        const capture = await readCaptureSummary(serverRepositoryRoot, captureId)
        sendJson(response, 200, { capture: browserCapture(capture), log: displayLog(command) })
        return
      }

      const captureRequestMatch = requestUrl.pathname.match(
        /^\/api\/questions\/(q-[0-9a-hj-km-np-tv-z]{12})\/capture-request$/,
      )

      if (request.method === 'POST' && captureRequestMatch !== null) {
        const questionId = captureRequestMatch[1] ?? ''
        const body = await readJsonBody(request)

        if (body.confirmation !== questionId) {
          throw new HttpError(400, `confirmation must equal ${questionId}`)
        }

        const payload = await withQuestionLock(questionId, async () => {
          const captureRequest = await saveQuestionCaptureRequest({
            questionId,
            repositoryRoot: serverRepositoryRoot,
            timestamp: requiredString(body, 'timestamp'),
            url: requiredString(body, 'url'),
          })
          const index = await loadAdminQuestionIndex(serverRepositoryRoot)
          const question = index.questions.find((candidate) => candidate.id === questionId)

          if (question === undefined) {
            throw new Error(`Question ${questionId} could not be reloaded`)
          }

          return { captureRequest, question: browserQuestion(question) }
        })

        sendJson(response, 200, payload)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/capture-requests/prepare') {
        const body = await readJsonBody(request)

        if (body.confirmation !== 'prepare-all') {
          throw new HttpError(400, 'confirmation must equal prepare-all')
        }

        if (captureBatchActive) {
          throw new HttpError(409, 'Capture request batch preparation is already running')
        }

        captureBatchActive = true

        try {
          const pending = (await listQuestionCaptureRequests(serverRepositoryRoot)).filter(
            (request_) => request_.status === 'saved',
          )
          const unique = [
            ...new Map(pending.map((request_) => [request_.captureId, request_])).values(),
          ]
          const results = new Map<
            string,
            { captureId: string; log: string; ok: boolean }
          >()
          let nextIndex = 0
          const prepareOne = async (captureRequest: QuestionCaptureRequestSummary) => {
            try {
              const command = await withCaptureLock(captureRequest.captureId, async () =>
                await framePicker([
                  '--url',
                  captureRequest.url,
                  '--timestamp',
                  captureRequest.timestamp,
                  '--no-open',
                ]),
              )
              const capture = await readCaptureSummary(
                serverRepositoryRoot,
                captureRequest.captureId,
              )

              if (capture.coarse === null) {
                throw new Error(`Capture ${captureRequest.captureId} has no coarse candidates`)
              }
              results.set(captureRequest.captureId, {
                captureId: captureRequest.captureId,
                log: batchLog(displayLog(command)),
                ok: true,
              })
            } catch (error) {
              results.set(captureRequest.captureId, {
                captureId: captureRequest.captureId,
                log: batchLog(error instanceof Error ? error.message : String(error)),
                ok: false,
              })
            }
          }
          const workerCount = Math.min(3, unique.length)
          await Promise.all(
            Array.from({ length: workerCount }, async () => {
              while (nextIndex < unique.length) {
                const captureRequest = unique[nextIndex]
                nextIndex += 1
                if (captureRequest !== undefined) await prepareOne(captureRequest)
              }
            }),
          )
          const prepared = pending.map((request_) => ({
            ...results.get(request_.captureId),
            questionId: request_.questionId,
          }))
          const index = await loadAdminQuestionIndex(serverRepositoryRoot)
          sendJson(response, 200, {
            issues: index.issues,
            prepared,
            questions: index.questions.map(browserQuestion),
          })
        } finally {
          captureBatchActive = false
        }
        return
      }

      const replaceMatch = requestUrl.pathname.match(
        /^\/api\/questions\/(q-[0-9a-hj-km-np-tv-z]{12})\/original$/,
      )

      if (request.method === 'POST' && replaceMatch !== null) {
        const questionId = replaceMatch[1] ?? ''
        const body = await readJsonBody(request)

        if (body.confirmation !== questionId) {
          throw new HttpError(400, `confirmation must equal ${questionId}`)
        }

        const payload = await withQuestionLock(questionId, async () => {
          const result = await replaceQuestionOriginal({
            allowDimensionChange: body.allowDimensionChange === true,
            captureId: requiredString(body, 'captureId'),
            expectedOriginalSha256: requiredString(body, 'expectedOriginalSha256'),
            questionId,
            repositoryRoot: serverRepositoryRoot,
          })
          const catalogSync = await catalogSyncResult()
          const index = await loadAdminQuestionIndex(serverRepositoryRoot)
          const question = index.questions.find((candidate) => candidate.id === questionId)
          if (question === undefined) {
            throw new Error(`Updated question ${questionId} could not be reloaded`)
          }
          return { catalogSync, question: browserQuestion(question), result }
        })

        sendJson(response, 200, payload)
        return
      }

      const answerMatch = requestUrl.pathname.match(
        /^\/api\/questions\/(q-[0-9a-hj-km-np-tv-z]{12})\/answer$/,
      )

      if (request.method === 'POST' && answerMatch !== null) {
        const questionId = answerMatch[1] ?? ''
        const body = await readJsonBody(request)
        if (body.confirmation !== questionId) {
          throw new HttpError(400, `confirmation must equal ${questionId}`)
        }
        const payload = await withQuestionLock(questionId, async () => {
          const result = await updateQuestionAnswer({
            blueTeamId: requiredString(body, 'blueTeamId'),
            catalogEditionId: requiredString(body, 'catalogEditionId'),
            expectedDirectoryName: requiredString(body, 'expectedDirectoryName'),
            expectedManifestSha256: requiredString(body, 'expectedManifestSha256'),
            gameNumber: body.gameNumber as number,
            questionId,
            redTeamId: requiredString(body, 'redTeamId'),
            repositoryRoot: serverRepositoryRoot,
            stage: requiredString(body, 'stage'),
          })
          const catalogSync = await catalogSyncResult()
          const index = await loadAdminQuestionIndex(serverRepositoryRoot)
          const question = index.questions.find((candidate) => candidate.id === questionId)
          if (question === undefined) {
            throw new Error(`Updated question ${questionId} could not be reloaded`)
          }
          return { catalogSync, question: browserQuestion(question), result }
        })
        sendJson(response, 200, payload)
        return
      }

      const redactionsMatch = requestUrl.pathname.match(
        /^\/api\/questions\/(q-[0-9a-hj-km-np-tv-z]{12})\/redactions$/,
      )

      if (request.method === 'POST' && redactionsMatch !== null) {
        const questionId = redactionsMatch[1] ?? ''
        const body = await readJsonBody(request)
        if (body.confirmation !== questionId) {
          throw new HttpError(400, `confirmation must equal ${questionId}`)
        }
        if (body.expectedRedactionManifestSha256 !== null && typeof body.expectedRedactionManifestSha256 !== 'string') {
          throw new HttpError(400, 'expectedRedactionManifestSha256 must be a SHA-256 digest or null')
        }
        if (!Array.isArray(body.rectangles)) {
          throw new HttpError(400, 'rectangles must be an array')
        }
        const payload = await withQuestionLock(questionId, async () => {
          const result = await saveQuestionRedactions({
            expectedOriginalSha256: requiredString(body, 'expectedOriginalSha256'),
            expectedRedactionManifestSha256: body.expectedRedactionManifestSha256 as string | null,
            questionId,
            rectangles: body.rectangles as unknown[],
            renderer: options.redactionRenderer,
            repositoryRoot: serverRepositoryRoot,
          })
          const catalogSync = await catalogSyncResult()
          const index = await loadAdminQuestionIndex(serverRepositoryRoot)
          const question = index.questions.find((candidate) => candidate.id === questionId)
          if (question === undefined) {
            throw new Error(`Updated question ${questionId} could not be reloaded`)
          }
          return { catalogSync, question: browserQuestion(question), result }
        })
        sendJson(response, 200, payload)
        return
      }

      throw new HttpError(404, 'Not found')
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined)
        return
      }

      if (error instanceof QuestionAdminConflictError) {
        sendJson(response, 409, { error: error.message })
        return
      }

      if (error instanceof QuestionAdminValidationError) {
        sendJson(response, 400, { error: error.message })
        return
      }

      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      console.error(error)
      sendJson(response, 500, { error: message })
    })
  })

  const ready = new Promise<{ authenticatedUrl: string; baseUrl: string }>(
    (resolvePromise, reject) => {
      server.once('error', reject)
      server.listen(options.port, bindHost, () => {
        const address = server.address()

        if (address === null || typeof address === 'string') {
          reject(new Error('Question admin server did not receive a TCP address'))
          return
        }

        expectedHost = `${bindHost}:${address.port}`
        baseUrl = `http://${expectedHost}`
        resolvePromise({
          authenticatedUrl: `${baseUrl}/?token=${encodeURIComponent(sessionToken)}`,
          baseUrl,
        })
      })
    },
  )

  return { ready, server }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))

  if (options === null) {
    console.log(usage())
    return
  }

  await readFile(auditPath, 'utf8')
  const { ready, server } = createQuestionAdminServer(options)
  const addresses = await ready
  console.error(`Question admin is running at ${addresses.baseUrl}`)
  console.error('It is bound to loopback only. Press Ctrl+C to stop it.')

  if (options.openBrowser) {
    openBrowser(addresses.authenticatedUrl)
  } else {
    console.error(`Authenticated URL: ${addresses.authenticatedUrl}`)
  }

  const close = () => server.close(() => process.exit(0))
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}

const entryPoint = process.argv[1]
const isMainModule =
  entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href

if (isMainModule) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
