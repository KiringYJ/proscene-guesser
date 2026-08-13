import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import {
  copyFile,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'

import type { InternationalCatalog, InternationalEdition } from '../src/data/catalog/types.ts'
import { validateInternationalCatalog } from '../src/data/catalog/validation.ts'
import {
  createQuestionDirectoryName,
  parseQuestionDirectoryName,
} from '../src/data/question-directory.ts'
import {
  QUESTION_ID_PATTERN,
  validateQuestionManifest,
  type QuestionManifest,
} from '../src/data/question-manifest.ts'
import {
  createCaptureRequest,
  formatTimestamp,
  parseCandidateNumber,
  type CaptureRequest,
  type FrameCandidate,
} from './video-frame-selection.ts'

const CAPTURE_ID_PATTERN = /^capture-[0-9a-f]{16}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/i
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type UnknownRecord = Record<string, unknown>

interface RedactionSummary {
  rectangleCount: number
  reviewStatus: string
  sourceSha256: string | null
}

interface CaptureStageRecord {
  candidates: readonly FrameCandidate[]
  selectedCandidateNumber?: number
}

interface CaptureOutputRecord {
  height: number
  path: string
  selectedCandidatePngSha256: string
  selectedFrame: FrameCandidate
  sha256: string
  width: number
}

interface CaptureManifestRecord {
  artifacts: {
    coarseDirectory: string
    fineDirectory: string
    selectedWorkspacePng: string
  }
  captureId: string
  coarse?: CaptureStageRecord
  fine?: CaptureStageRecord
  output?: CaptureOutputRecord
  request: CaptureRequest
  schemaVersion: number
}

export interface AdminQuestion {
  blueTeam: { id: string; name: string }
  captureId: string | null
  directoryName: string
  editionId: string
  gameNumber: number
  height: number
  id: string
  originalSha256: string
  pool: string
  rectangleCount: number
  redactedSha256: string | null
  redactionMatchesOriginal: boolean
  redactionSourceSha256: string | null
  reviewStatus: string
  source: { label: string; url: string }
  stage: string
  tournament: string
  redTeam: { id: string; name: string }
  width: number
  year: number
}

export interface AdminQuestionIndex {
  issues: readonly string[]
  questions: readonly AdminQuestion[]
}

export interface CaptureCandidateSummary extends FrameCandidate {
  videoTimestamp: string
}

export interface CaptureSummary {
  captureId: string
  coarse: {
    candidates: readonly CaptureCandidateSummary[]
    selectedCandidateNumber: number | null
  } | null
  fine: {
    candidates: readonly CaptureCandidateSummary[]
    selectedCandidateNumber: number | null
  } | null
  output: {
    height: number
    sha256: string
    width: number
  } | null
  request: CaptureRequest
}

export interface ReplaceQuestionOriginalOptions {
  allowDimensionChange: boolean
  captureId: string
  expectedOriginalSha256: string
  questionId: string
  repositoryRoot: string
}

export interface ReplaceQuestionOriginalResult {
  captureId: string
  dimensionsChanged: boolean
  newOriginalSha256: string
  previousOriginalSha256: string
  questionId: string
  sourceUrl: string
}

export class QuestionAdminConflictError extends Error {}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pathIsWithin(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  )
}

function resolveRepositoryPath(repositoryRoot: string, path: string): string {
  if (isAbsolute(path)) {
    throw new Error(`Expected a repository-relative path: ${path}`)
  }

  const resolved = resolve(repositoryRoot, path)

  if (!pathIsWithin(repositoryRoot, resolved)) {
    throw new Error(`Path escapes the repository: ${path}`)
  }

  return resolved
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function assertRegularFile(path: string): Promise<void> {
  const metadata = await lstat(path)

  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`Expected a regular file: ${path}`)
  }
}

async function assertDirectory(path: string): Promise<void> {
  const metadata = await lstat(path)

  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`Expected a regular directory: ${path}`)
  }
}

async function assertExistingPathWithinRepository(
  repositoryRoot: string,
  path: string,
): Promise<void> {
  const [realRepositoryRoot, realPath] = await Promise.all([
    realpath(repositoryRoot),
    realpath(path),
  ])

  if (!pathIsWithin(realRepositoryRoot, realPath)) {
    throw new Error(`Resolved path escapes the repository: ${path}`)
  }
}

export async function sha256File(path: string): Promise<string> {
  await assertRegularFile(path)
  const digest = createHash('sha256')

  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => digest.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolvePromise)
  })

  return digest.digest('hex')
}

export async function readPngDimensions(path: string): Promise<{ height: number; width: number }> {
  await assertRegularFile(path)
  const handle = await open(path, 'r')

  try {
    const header = Buffer.alloc(24)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)

    if (
      bytesRead !== header.length ||
      !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
      header.readUInt32BE(8) !== 13 ||
      header.subarray(12, 16).toString('ascii') !== 'IHDR'
    ) {
      throw new Error(`Expected a PNG image: ${path}`)
    }

    const width = header.readUInt32BE(16)
    const height = header.readUInt32BE(20)

    if (width === 0 || height === 0) {
      throw new Error(`PNG has invalid dimensions: ${path}`)
    }

    return { height, width }
  } finally {
    await handle.close()
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

function finitePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function readRedactionSummary(value: unknown): RedactionSummary {
  if (!isRecord(value)) {
    throw new Error('redaction.json must contain an object')
  }

  const source = isRecord(value.source) ? value.source : {}

  return {
    rectangleCount: Array.isArray(value.rectangles) ? value.rectangles.length : 0,
    reviewStatus:
      typeof value.reviewStatus === 'string' && value.reviewStatus.length > 0
        ? value.reviewStatus
        : 'unknown',
    sourceSha256:
      typeof source.sha256 === 'string' && SHA256_PATTERN.test(source.sha256)
        ? source.sha256.toLowerCase()
        : null,
  }
}

async function loadInternationalCatalog(repositoryRoot: string): Promise<InternationalCatalog> {
  const path = resolve(repositoryRoot, 'src/data/catalog/international-catalog.json')
  await assertRegularFile(path)
  await assertExistingPathWithinRepository(repositoryRoot, path)
  const value = await readJson(path)

  if (!isRecord(value)) {
    throw new Error('international-catalog.json must contain an object')
  }

  const catalog = value as unknown as InternationalCatalog
  const issues = validateInternationalCatalog(catalog)

  if (issues.length > 0) {
    throw new Error(`International catalog is invalid: ${issues.join('; ')}`)
  }

  return catalog
}

function catalogEdition(
  catalog: InternationalCatalog,
  editionId: string,
): InternationalEdition {
  const edition = catalog.editions.find((candidate) => candidate.id === editionId)

  if (edition === undefined) {
    throw new Error(`Unknown international edition: ${editionId}`)
  }

  return edition
}

function catalogTournamentName(
  catalog: InternationalCatalog,
  edition: InternationalEdition,
): string {
  const series = catalog.series.find((candidate) => candidate.id === edition.seriesId)

  if (series === undefined) {
    throw new Error(`Unknown international series: ${edition.seriesId}`)
  }

  return series.name
}

function teamName(
  catalog: InternationalCatalog,
  manifest: QuestionManifest,
  editionId: string,
  teamId: string,
): string {
  if (manifest.catalogEditionId !== undefined) {
    return catalogEdition(catalog, editionId).participants.find(
      (participant) => participant.teamId === teamId,
    )?.nameAtEvent ?? teamId
  }

  const choices = manifest.choices
  return choices?.teams.find((team) => team.id === teamId)?.name ?? teamId
}

async function captureIdBesideQuestion(directory: string): Promise<string | null> {
  const capturePath = resolve(directory, 'capture.json')

  if (!(await fileExists(capturePath))) {
    return null
  }

  await assertRegularFile(capturePath)
  const value = await readJson(capturePath)

  return isRecord(value) && typeof value.captureId === 'string' && CAPTURE_ID_PATTERN.test(value.captureId)
    ? value.captureId
    : null
}

async function loadAdminQuestion(
  repositoryRoot: string,
  directoryName: string,
  catalog: InternationalCatalog,
): Promise<AdminQuestion> {
  const parsedDirectory = parseQuestionDirectoryName(directoryName)

  if (parsedDirectory === null) {
    throw new Error('directory name is not a canonical question locator')
  }

  const directory = resolve(repositoryRoot, 'sources/questions', directoryName)
  const manifestPath = resolve(directory, 'question.json')
  const originalPath = resolve(directory, 'original.png')
  const redactedPath = resolve(directory, 'redacted.webp')
  const redactionPath = resolve(directory, 'redaction.json')
  await assertDirectory(directory)
  await assertExistingPathWithinRepository(repositoryRoot, directory)
  await assertRegularFile(manifestPath)
  await assertExistingPathWithinRepository(repositoryRoot, manifestPath)
  await assertRegularFile(originalPath)
  await assertExistingPathWithinRepository(repositoryRoot, originalPath)
  const hasRedacted = await fileExists(redactedPath)
  const manifestValue = await readJson(manifestPath)
  const manifestIssues = validateQuestionManifest(manifestValue, { catalog })

  if (manifestIssues.length > 0) {
    throw new Error(`invalid question.json: ${manifestIssues.join('; ')}`)
  }

  const manifest = manifestValue as QuestionManifest
  const expectedDirectoryName = createQuestionDirectoryName(parsedDirectory.id, manifest)

  if (directoryName !== expectedDirectoryName) {
    throw new Error(`directory name does not match question.json; expected ${expectedDirectoryName}`)
  }

  const originalDimensions = await readPngDimensions(originalPath)
  const originalSha256 = await sha256File(originalPath)
  const hasRedaction = await fileExists(redactionPath)

  if (hasRedaction) {
    await assertRegularFile(redactionPath)
    await assertExistingPathWithinRepository(repositoryRoot, redactionPath)
  }

  const redaction = hasRedaction
    ? readRedactionSummary(await readJson(redactionPath))
    : {
        rectangleCount: 0,
        reviewStatus: 'missing',
        sourceSha256: null,
      }
  if (hasRedacted) {
    await assertRegularFile(redactedPath)
    await assertExistingPathWithinRepository(repositoryRoot, redactedPath)
  }

  const redactedSha256 = hasRedacted ? await sha256File(redactedPath) : null
  const editionId =
    manifest.catalogEditionId ?? `${manifest.answer.tournament}-${manifest.answer.year}`
  let tournament: string
  let year: number

  if (manifest.catalogEditionId === undefined) {
    tournament = manifest.answer.tournament
    year = manifest.answer.year
  } else {
    const edition = catalogEdition(catalog, editionId)
    tournament = catalogTournamentName(catalog, edition)
    year = edition.year
  }

  const answer = manifest.answer

  return {
    blueTeam: {
      id: answer.blueTeamId,
      name: teamName(catalog, manifest, editionId, answer.blueTeamId),
    },
    captureId: await captureIdBesideQuestion(directory),
    directoryName,
    editionId,
    gameNumber: answer.gameNumber,
    height: originalDimensions.height,
    id: parsedDirectory.id,
    originalSha256,
    pool: manifest.pool,
    rectangleCount: redaction.rectangleCount,
    redactedSha256,
    redactionMatchesOriginal: redaction.sourceSha256 === originalSha256,
    redactionSourceSha256: redaction.sourceSha256,
    reviewStatus: redaction.reviewStatus,
    source: manifest.source ?? { label: 'Source not recorded', url: '' },
    stage: answer.stage,
    tournament,
    redTeam: {
      id: answer.redTeamId,
      name: teamName(catalog, manifest, editionId, answer.redTeamId),
    },
    width: originalDimensions.width,
    year,
  }
}

export async function loadAdminQuestionIndex(repositoryRoot: string): Promise<AdminQuestionIndex> {
  const questionRoot = resolve(repositoryRoot, 'sources/questions')
  await assertDirectory(questionRoot)
  const catalog = await loadInternationalCatalog(repositoryRoot)
  const entries = (await readdir(questionRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
  const questions: AdminQuestion[] = []
  const issues: string[] = []

  for (const entry of entries) {
    try {
      questions.push(await loadAdminQuestion(repositoryRoot, entry.name, catalog))
    } catch (error) {
      issues.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  questions.sort(
    (left, right) =>
      left.year - right.year ||
      left.tournament.localeCompare(right.tournament) ||
      left.stage.localeCompare(right.stage) ||
      left.blueTeam.name.localeCompare(right.blueTeam.name) ||
      left.redTeam.name.localeCompare(right.redTeam.name) ||
      left.gameNumber - right.gameNumber,
  )

  return { issues, questions }
}

export async function resolveQuestionDirectory(
  repositoryRoot: string,
  questionId: string,
): Promise<string> {
  if (!QUESTION_ID_PATTERN.test(questionId)) {
    throw new Error(`Invalid question ID: ${questionId}`)
  }

  const questionRoot = resolve(repositoryRoot, 'sources/questions')
  const matches: string[] = []

  for (const entry of await readdir(questionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const parsed = parseQuestionDirectoryName(entry.name)

    if (parsed?.id === questionId) {
      matches.push(resolve(questionRoot, entry.name))
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Question ${questionId} was not found`
        : `Question ${questionId} has more than one source directory`,
    )
  }

  await assertDirectory(matches[0] ?? '')
  await assertExistingPathWithinRepository(repositoryRoot, matches[0] ?? '')
  return matches[0] ?? ''
}

export async function resolveQuestionAssetPath(
  repositoryRoot: string,
  questionId: string,
  asset: 'original' | 'question-manifest' | 'redacted' | 'redaction-manifest',
): Promise<string> {
  const directory = await resolveQuestionDirectory(repositoryRoot, questionId)
  const fileName = {
    original: 'original.png',
    'question-manifest': 'question.json',
    redacted: 'redacted.webp',
    'redaction-manifest': 'redaction.json',
  }[asset]
  const path = resolve(directory, fileName)
  await assertRegularFile(path)
  await assertExistingPathWithinRepository(repositoryRoot, path)
  return path
}

function isFrameCandidate(value: unknown): value is FrameCandidate {
  return (
    isRecord(value) &&
    Number.isInteger(value.number) &&
    (value.number as number) > 0 &&
    typeof value.file === 'string' &&
    typeof value.sampleSeconds === 'number' &&
    Number.isFinite(value.sampleSeconds) &&
    value.sampleSeconds >= 0 &&
    Number.isInteger(value.sourceFrameIndex) &&
    (value.sourceFrameIndex as number) >= 0 &&
    (value.sourcePts === null || typeof value.sourcePts === 'string') &&
    typeof value.sourcePtsTimeSeconds === 'number' &&
    Number.isFinite(value.sourcePtsTimeSeconds) &&
    typeof value.sourceRelativeSeconds === 'number' &&
    Number.isFinite(value.sourceRelativeSeconds) &&
    value.sourceRelativeSeconds >= 0
  )
}

function validateCaptureStage(value: unknown, label: string): void {
  if (value === undefined) {
    return
  }

  if (!isRecord(value) || !Array.isArray(value.candidates) || value.candidates.length === 0) {
    throw new Error(`${label} capture stage is malformed`)
  }

  const candidates = value.candidates

  for (const candidate of candidates) {
    if (!isFrameCandidate(candidate)) {
      throw new Error(`${label} capture stage contains a malformed candidate`)
    }

    validateCandidateFileName(candidate.file)
  }

  const validatedCandidates = candidates as FrameCandidate[]

  if (
    validatedCandidates.some((candidate, index) => candidate.number !== index + 1) ||
    new Set(validatedCandidates.map((candidate) => candidate.file)).size !==
      validatedCandidates.length
  ) {
    throw new Error(`${label} capture candidates are not uniquely numbered and named`)
  }

  if (value.selectedCandidateNumber !== undefined) {
    if (
      typeof value.selectedCandidateNumber !== 'number' &&
      typeof value.selectedCandidateNumber !== 'string'
    ) {
      throw new Error(`${label} capture selection is malformed`)
    }

    const selectedNumber = parseCandidateNumber(
      value.selectedCandidateNumber,
      validatedCandidates.length,
    )

    if (!validatedCandidates.some((candidate) => candidate.number === selectedNumber)) {
      throw new Error(`${label} capture selection is not present in its candidates`)
    }
  }
}

function validateCaptureOutput(value: unknown): void {
  if (value === undefined) {
    return
  }

  if (
    !isRecord(value) ||
    typeof value.path !== 'string' ||
    typeof value.selectedCandidatePngSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.selectedCandidatePngSha256) ||
    !isFrameCandidate(value.selectedFrame) ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256) ||
    finitePositiveInteger(value.width) === null ||
    finitePositiveInteger(value.height) === null
  ) {
    throw new Error('Capture output metadata is malformed')
  }
}

function validateCaptureManifest(value: unknown, expectedCaptureId: string): CaptureManifestRecord {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.captureId !== expectedCaptureId) {
    throw new Error(`Invalid capture manifest for ${expectedCaptureId}`)
  }

  if (!isRecord(value.request) || !isRecord(value.artifacts)) {
    throw new Error(`Capture ${expectedCaptureId} is missing request or artifact metadata`)
  }

  const request = value.request
  const artifacts = value.artifacts

  if (
    typeof request.canonicalUrl !== 'string' ||
    typeof request.identity !== 'string' ||
    typeof request.captureId !== 'string' ||
    typeof request.roughTimestampSeconds !== 'number' ||
    !Number.isFinite(request.roughTimestampSeconds) ||
    request.roughTimestampSeconds < 0 ||
    typeof request.clipStartSeconds !== 'number' ||
    !Number.isFinite(request.clipStartSeconds) ||
    request.clipStartSeconds < 0 ||
    typeof request.clipEndSeconds !== 'number' ||
    !Number.isFinite(request.clipEndSeconds) ||
    request.clipEndSeconds <= request.clipStartSeconds ||
    request.captureId !== expectedCaptureId ||
    typeof artifacts.coarseDirectory !== 'string' ||
    typeof artifacts.fineDirectory !== 'string' ||
    typeof artifacts.selectedWorkspacePng !== 'string'
  ) {
    throw new Error(`Capture ${expectedCaptureId} has malformed request or artifact metadata`)
  }

  validateCaptureStage(value.coarse, 'Coarse')
  validateCaptureStage(value.fine, 'Fine')
  validateCaptureOutput(value.output)

  if (value.output !== undefined) {
    const output = value.output as unknown as CaptureOutputRecord
    const fine = value.fine as unknown as CaptureStageRecord | undefined
    const selected = fine?.candidates.find(
      (candidate) => candidate.number === fine.selectedCandidateNumber,
    )

    if (
      selected === undefined ||
      output.selectedFrame.number !== selected.number ||
      output.selectedFrame.file !== selected.file ||
      output.selectedFrame.sourceFrameIndex !== selected.sourceFrameIndex ||
      output.selectedFrame.sourceRelativeSeconds !== selected.sourceRelativeSeconds ||
      output.selectedCandidatePngSha256.toLowerCase() !== output.sha256.toLowerCase()
    ) {
      throw new Error(`Capture ${expectedCaptureId} output does not match its fine selection`)
    }
  }

  const canonicalRequest = createCaptureRequest(
    request.canonicalUrl,
    request.roughTimestampSeconds.toString(),
  )

  if (
    canonicalRequest.captureId !== expectedCaptureId ||
    canonicalRequest.canonicalUrl !== request.canonicalUrl ||
    canonicalRequest.identity !== request.identity
  ) {
    throw new Error(`Capture ${expectedCaptureId} request identity is inconsistent`)
  }

  return value as unknown as CaptureManifestRecord
}

async function findCaptureManifestPath(
  repositoryRoot: string,
  captureId: string,
): Promise<string> {
  if (!CAPTURE_ID_PATTERN.test(captureId)) {
    throw new Error(`Invalid capture ID: ${captureId}`)
  }

  const incomingPath = resolve(repositoryRoot, 'incoming', `${captureId}.capture.json`)

  if (await fileExists(incomingPath)) {
    await assertRegularFile(incomingPath)
    await assertExistingPathWithinRepository(repositoryRoot, incomingPath)
    return incomingPath
  }

  const questionRoot = resolve(repositoryRoot, 'sources/questions')

  for (const entry of await readdir(questionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const candidatePath = resolve(questionRoot, entry.name, 'capture.json')

    if (!(await fileExists(candidatePath))) {
      continue
    }

    await assertRegularFile(candidatePath)
    await assertExistingPathWithinRepository(repositoryRoot, candidatePath)
    const candidate = await readJson(candidatePath)

    if (isRecord(candidate) && candidate.captureId === captureId) {
      return candidatePath
    }
  }

  throw new Error(`Capture ${captureId} was not found`)
}

async function readCaptureManifest(
  repositoryRoot: string,
  captureId: string,
): Promise<{ manifest: CaptureManifestRecord; path: string; raw: string }> {
  const path = await findCaptureManifestPath(repositoryRoot, captureId)
  const raw = await readFile(path, 'utf8')
  const manifest = validateCaptureManifest(JSON.parse(raw) as unknown, captureId)
  return { manifest, path, raw }
}

function summarizeCandidates(
  request: CaptureRequest,
  candidates: readonly FrameCandidate[],
): readonly CaptureCandidateSummary[] {
  return candidates.map((candidate) => ({
    ...candidate,
    videoTimestamp: formatTimestamp(request.clipStartSeconds + candidate.sourceRelativeSeconds),
  }))
}

export async function readCaptureSummary(
  repositoryRoot: string,
  captureId: string,
): Promise<CaptureSummary> {
  const { manifest } = await readCaptureManifest(repositoryRoot, captureId)
  const summarizeStage = (stage: CaptureStageRecord | undefined) =>
    stage === undefined
      ? null
      : {
          candidates: summarizeCandidates(manifest.request, stage.candidates),
          selectedCandidateNumber: stage.selectedCandidateNumber ?? null,
        }

  return {
    captureId,
    coarse: summarizeStage(manifest.coarse),
    fine: summarizeStage(manifest.fine),
    output:
      manifest.output === undefined
        ? null
        : {
            height: manifest.output.height,
            sha256: manifest.output.sha256.toLowerCase(),
            width: manifest.output.width,
          },
    request: manifest.request,
  }
}

function validateCandidateFileName(fileName: string): void {
  if (basename(fileName) !== fileName || !/^frame-\d{2,3}\.png$/.test(fileName)) {
    throw new Error(`Invalid candidate file name: ${fileName}`)
  }
}

export async function resolveCaptureCandidatePath(
  repositoryRoot: string,
  captureId: string,
  stageName: 'coarse' | 'fine',
  fileName: string,
): Promise<string> {
  validateCandidateFileName(fileName)
  const { manifest } = await readCaptureManifest(repositoryRoot, captureId)
  const stage = manifest[stageName]

  if (stage === undefined || !stage.candidates.some((candidate) => candidate.file === fileName)) {
    throw new Error(`${fileName} is not recorded in capture ${captureId} ${stageName} candidates`)
  }

  const artifactPath =
    stageName === 'coarse' ? manifest.artifacts.coarseDirectory : manifest.artifacts.fineDirectory
  const directory = resolveRepositoryPath(repositoryRoot, artifactPath)
  const expectedRoot = resolve(repositoryRoot, '.media/frame-selections', captureId, stageName)

  if (directory !== expectedRoot) {
    throw new Error(`Capture ${captureId} has a non-canonical ${stageName} directory`)
  }

  const path = resolve(directory, fileName)

  if (!pathIsWithin(directory, path)) {
    throw new Error(`Candidate path escapes its capture directory: ${fileName}`)
  }

  await assertRegularFile(path)
  await assertExistingPathWithinRepository(repositoryRoot, path)
  return path
}

async function resolveVerifiedCaptureOutput(
  repositoryRoot: string,
  captureId: string,
): Promise<{
  height: number
  manifestPath: string
  manifestRaw: string
  path: string
  request: CaptureRequest
  sha256: string
  width: number
}> {
  const { manifest, path: manifestPath, raw: manifestRaw } = await readCaptureManifest(
    repositoryRoot,
    captureId,
  )

  if (manifest.output === undefined || !SHA256_PATTERN.test(manifest.output.sha256)) {
    throw new Error(`Capture ${captureId} does not have a completed output`)
  }

  const recordedPath = resolveRepositoryPath(repositoryRoot, manifest.output.path)
  const selectedWorkspacePath = resolveRepositoryPath(
    repositoryRoot,
    manifest.artifacts.selectedWorkspacePng,
  )
  const expectedRecordedPath = resolve(repositoryRoot, 'incoming', `${captureId}.png`)
  const expectedWorkspacePath = resolve(
    repositoryRoot,
    '.media/frame-selections',
    captureId,
    'selected.png',
  )

  if (recordedPath !== expectedRecordedPath || selectedWorkspacePath !== expectedWorkspacePath) {
    throw new Error(`Capture ${captureId} has non-canonical output paths`)
  }

  const migratedPath = resolve(manifestPath, '..', 'original.png')
  const candidates = [...new Set([recordedPath, selectedWorkspacePath, migratedPath])]

  for (const candidatePath of candidates) {
    if (!(await fileExists(candidatePath))) {
      continue
    }

    await assertExistingPathWithinRepository(repositoryRoot, candidatePath)
    const dimensions = await readPngDimensions(candidatePath)
    const sha256 = await sha256File(candidatePath)

    if (sha256 !== manifest.output.sha256.toLowerCase()) {
      continue
    }

    if (dimensions.width !== manifest.output.width || dimensions.height !== manifest.output.height) {
      throw new Error(`Capture ${captureId} output dimensions do not match its manifest`)
    }

    return {
      ...dimensions,
      manifestPath,
      manifestRaw,
      path: candidatePath,
      request: manifest.request,
      sha256,
    }
  }

  throw new Error(`Capture ${captureId} output is missing or failed SHA-256 verification`)
}

export async function resolveCaptureOutputPath(
  repositoryRoot: string,
  captureId: string,
): Promise<string> {
  return (await resolveVerifiedCaptureOutput(repositoryRoot, captureId)).path
}

interface InstallEntry {
  sourcePath?: string
  targetPath: string
  text?: string
}

async function installFileBundle(entries: readonly InstallEntry[]): Promise<void> {
  const token = randomUUID()
  let committed = false
  const prepared = entries.map((entry) => ({
    ...entry,
    backupPath: `${entry.targetPath}.question-admin-backup-${token}`,
    hadTarget: false,
    installed: false,
    temporaryPath: `${entry.targetPath}.question-admin-${token}.tmp`,
  }))

  try {
    for (const entry of prepared) {
      if ((entry.sourcePath === undefined) === (entry.text === undefined)) {
        throw new Error('Each install entry must provide exactly one source')
      }

      if (entry.sourcePath !== undefined) {
        await copyFile(entry.sourcePath, entry.temporaryPath, constants.COPYFILE_EXCL)
      } else {
        await writeFile(entry.temporaryPath, entry.text ?? '', { encoding: 'utf8', flag: 'wx' })
      }
    }

    for (const entry of prepared) {
      if (await fileExists(entry.targetPath)) {
        await assertRegularFile(entry.targetPath)
        await rename(entry.targetPath, entry.backupPath)
        entry.hadTarget = true
      }

      await rename(entry.temporaryPath, entry.targetPath)
      entry.installed = true
    }
    committed = true
  } catch (error) {
    const rollbackErrors: unknown[] = []

    for (const entry of [...prepared].reverse()) {
      try {
        if (entry.installed && (await fileExists(entry.targetPath))) {
          await unlink(entry.targetPath)
        }

        if (entry.hadTarget && (await fileExists(entry.backupPath))) {
          await rename(entry.backupPath, entry.targetPath)
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Question source installation failed and rollback was incomplete; backup files were preserved',
      )
    }

    throw error
  } finally {
    for (const entry of prepared) {
      if (await fileExists(entry.temporaryPath)) {
        await unlink(entry.temporaryPath)
      }

      if (committed && (await fileExists(entry.backupPath))) {
        await unlink(entry.backupPath)
      }
    }
  }
}

export async function replaceQuestionOriginal(
  options: ReplaceQuestionOriginalOptions,
): Promise<ReplaceQuestionOriginalResult> {
  if (!SHA256_PATTERN.test(options.expectedOriginalSha256)) {
    throw new Error('expectedOriginalSha256 must be a SHA-256 digest')
  }

  const directory = await resolveQuestionDirectory(options.repositoryRoot, options.questionId)
  const originalPath = resolve(directory, 'original.png')
  const questionManifestPath = resolve(directory, 'question.json')
  const captureTargetPath = resolve(directory, 'capture.json')
  const currentSha256 = await sha256File(originalPath)

  if (currentSha256 !== options.expectedOriginalSha256.toLowerCase()) {
    throw new QuestionAdminConflictError(
      `Question ${options.questionId} changed after it was loaded; refresh before replacing original.png`,
    )
  }

  const currentDimensions = await readPngDimensions(originalPath)
  const capture = await resolveVerifiedCaptureOutput(options.repositoryRoot, options.captureId)
  const dimensionsChanged =
    currentDimensions.width !== capture.width || currentDimensions.height !== capture.height

  if (dimensionsChanged && !options.allowDimensionChange) {
    throw new QuestionAdminConflictError(
      `Selected frame is ${capture.width} x ${capture.height}, but the current original is ${currentDimensions.width} x ${currentDimensions.height}`,
    )
  }

  await assertRegularFile(questionManifestPath)
  await assertExistingPathWithinRepository(options.repositoryRoot, questionManifestPath)
  const manifestValue = await readJson(questionManifestPath)
  const catalog = await loadInternationalCatalog(options.repositoryRoot)
  const manifestIssues = validateQuestionManifest(manifestValue, { catalog })

  if (manifestIssues.length > 0 || !isRecord(manifestValue)) {
    throw new Error(`Cannot update invalid question.json: ${manifestIssues.join('; ')}`)
  }

  const existingSource = isRecord(manifestValue.source) ? manifestValue.source : {}
  manifestValue.source = {
    label:
      typeof existingSource.label === 'string' && existingSource.label.trim().length > 0
        ? existingSource.label
        : 'YouTube broadcast source',
    url: capture.request.canonicalUrl,
  }
  const updatedManifestIssues = validateQuestionManifest(manifestValue, {
    catalog,
  })

  if (updatedManifestIssues.length > 0) {
    throw new Error(`Updated question.json would be invalid: ${updatedManifestIssues.join('; ')}`)
  }

  await installFileBundle([
    { sourcePath: capture.path, targetPath: originalPath },
    { text: capture.manifestRaw, targetPath: captureTargetPath },
    {
      text: `${JSON.stringify(manifestValue, null, 2)}\n`,
      targetPath: questionManifestPath,
    },
  ])

  const installedSha256 = await sha256File(originalPath)

  if (installedSha256 !== capture.sha256) {
    throw new Error(`Installed original.png failed post-write SHA-256 verification`)
  }

  return {
    captureId: options.captureId,
    dimensionsChanged,
    newOriginalSha256: installedSha256,
    previousOriginalSha256: currentSha256,
    questionId: options.questionId,
    sourceUrl: capture.request.canonicalUrl,
  }
}
