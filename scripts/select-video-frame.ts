import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'

import {
  COARSE_CANDIDATE_COUNT,
  COARSE_FRAMES_PER_SECOND,
  FINE_RADIUS_SECONDS,
  createCaptureRequest,
  createCoarseCandidates,
  createFineCandidates,
  fitCaptureWindowToDuration,
  formatTimestamp,
  parseCandidateNumber,
  type CaptureRequest,
  type FrameCandidate,
  type ProbedVideoFrame,
} from './video-frame-selection.ts'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const incomingRoot = resolve(repositoryRoot, 'incoming')
const questionSourceRoot = resolve(repositoryRoot, 'sources/questions')
const captureRoot = resolve(repositoryRoot, '.media/frame-selections')
const CAPTURE_SCHEMA_VERSION = 1

interface CliOptions {
  coarseCandidate?: string
  finalCandidate?: string
  help: boolean
  openPicker: boolean
  timestamp?: string
  url?: string
}

interface ToolRecord {
  ffmpegBinarySha256: string
  ffmpegVersion: string
  ffprobeBinarySha256: string
  ffprobeVersion: string
  ytDlpVersion: string
}

interface SourceRecord {
  clipPath: string
  clipSha256: string
  downloadCommand: readonly string[]
  infoJsonPath: string
  metadataCommand: readonly string[]
  metadata: {
    durationSeconds: number | null
    extractor: string | null
    formatId: string | null
    id: string | null
    liveStatus: string | null
    requestedFormatIds: readonly string[]
    title: string | null
    webpageUrl: string | null
  }
  sizeBytes: number
}

interface ProbeRecord {
  averageFrameRate: string | null
  colorPrimaries: string | null
  colorRange: string | null
  colorSpace: string | null
  colorTransfer: string | null
  frameCount: number
  height: number
  pixelFormat: string
  probeCommand: readonly string[]
  streamIndex: number
  timeBase: string
  width: number
}

interface CandidateStage {
  candidates: readonly FrameCandidate[]
  generationCommand: readonly string[]
  pickerPath: string
  selectedAt?: string
  selectedCandidateNumber?: number
}

interface CoarseStage extends CandidateStage {
  framesPerSecond: number
}

interface FineStage extends CandidateStage {
  centerSeconds: number
  radiusSeconds: number
  windowEndSeconds: number
  windowStartSeconds: number
}

interface OutputRecord {
  extractionCommand: readonly string[]
  height: number
  path: string
  pixelFormat: string
  selectedCandidatePngSha256: string
  selectedAt: string
  selectedFrame: FrameCandidate
  sha256: string
  sizeBytes: number
  width: number
}

interface CaptureManifest {
  artifacts: {
    coarseDirectory: string
    fineDirectory: string
    selectedWorkspacePng: string
    workspace: string
  }
  captureId: string
  coarse?: CoarseStage
  createdAt: string
  fine?: FineStage
  output?: OutputRecord
  probe?: ProbeRecord
  request: CaptureRequest
  schemaVersion: number
  source?: SourceRecord
  tools?: ToolRecord
  updatedAt: string
}

interface ProbedVideo {
  frames: readonly ProbedVideoFrame[]
  summary: ProbeRecord
}

interface CommandResult {
  stderr: string
  stdout: string
}

interface CaptureLockRecord {
  createdAt: string
  hostname: string
  pid: number
  token: string
}

function captureArtifacts(request: CaptureRequest): CaptureManifest['artifacts'] {
  const workspace = resolve(captureRoot, request.captureId)

  return {
    coarseDirectory: repositoryRelativePath(resolve(workspace, 'coarse')),
    fineDirectory: repositoryRelativePath(resolve(workspace, 'fine')),
    selectedWorkspacePng: repositoryRelativePath(resolve(workspace, 'selected.png')),
    workspace: repositoryRelativePath(workspace),
  }
}

function usage(): string {
  return `Usage:
  npm run -- media:pick-frame -- --url <youtube-url> --timestamp <HH:MM:SS[.mmm]>

Options:
  --coarse <number>  Select a generated 2 fps candidate without an interactive prompt
  --final <number>   Select a full-frame-rate candidate without an interactive prompt
  --no-open          Do not open candidate galleries in the default browser
  --help             Show this help

The same canonical URL and rough timestamp resolve to the same capture manifest.
Completed captures return the recorded PNG without asking for either choice again.`
}

function readArgumentValue(arguments_: readonly string[], index: number, name: string): string {
  const value = arguments_[index + 1]

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  const options: CliOptions = { help: false, openPicker: true }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === '--help') {
      options.help = true
      continue
    }

    if (argument === '--no-open') {
      options.openPicker = false
      continue
    }

    const equalsIndex = argument.indexOf('=')
    const name = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex)
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1)

    if (name !== '--url' && name !== '--timestamp' && name !== '--coarse' && name !== '--final') {
      throw new Error(`Unknown argument: ${argument}`)
    }

    const value = inlineValue ?? readArgumentValue(arguments_, index, name)

    if (inlineValue === undefined) {
      index += 1
    }

    if (value.length === 0) {
      throw new Error(`${name} cannot be empty`)
    }

    if (name === '--url') {
      options.url = value
    } else if (name === '--timestamp') {
      options.timestamp = value
    } else if (name === '--coarse') {
      options.coarseCandidate = value
    } else {
      options.finalCandidate = value
    }
  }

  return options
}

function portablePath(path: string): string {
  return path.split(sep).join('/')
}

function repositoryRelativePath(path: string): string {
  return portablePath(relative(repositoryRoot, path))
}

function resolveRepositoryPath(path: string): string {
  if (isAbsolute(path)) {
    throw new Error(`Manifest path must be repository-relative: ${path}`)
  }

  const resolved = resolve(repositoryRoot, path)
  const relativePath = relative(repositoryRoot, resolved)

  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Manifest path escapes the repository: ${path}`)
  }

  return resolved
}

function pathIsWithin(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  )
}

async function assertNoSymlinkComponents(path: string): Promise<void> {
  const relativePath = relative(repositoryRoot, path)

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the repository: ${path}`)
  }

  let currentPath = repositoryRoot

  for (const component of relativePath.split(sep).filter(Boolean)) {
    currentPath = resolve(currentPath, component)

    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`Refusing to use symbolic-link path: ${repositoryRelativePath(currentPath)}`)
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        return
      }

      throw error
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'EEXIST'
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function acquireCaptureLock(request: CaptureRequest): Promise<() => Promise<void>> {
  const workspace = resolve(captureRoot, request.captureId)
  const lockPath = resolve(workspace, '.capture.lock')
  const currentHostname = hostname()
  const lockRecord: CaptureLockRecord = {
    createdAt: new Date().toISOString(),
    hostname: currentHostname,
    pid: process.pid,
    token: randomUUID(),
  }

  await assertNoSymlinkComponents(captureRoot)
  await mkdir(workspace, { recursive: true })
  await assertNoSymlinkComponents(workspace)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx')

      try {
        await handle.writeFile(`${JSON.stringify(lockRecord)}\n`, 'utf8')
        await handle.sync()
      } catch (error) {
        await handle.close()
        await unlink(lockPath).catch(() => undefined)
        throw error
      }

      await handle.close()

      return async () => {
        try {
          await assertNoSymlinkComponents(lockPath)
          const current = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<CaptureLockRecord>

          if (current.token === lockRecord.token) {
            await unlink(lockPath)
          }
        } catch (error) {
          if (!isMissingFileError(error)) {
            throw error
          }
        }
      }
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error
      }

      await assertNoSymlinkComponents(lockPath)
      let existing: Partial<CaptureLockRecord> | null = null

      try {
        existing = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<CaptureLockRecord>
      } catch (readError) {
        if (isMissingFileError(readError)) {
          continue
        }

        // An unreadable lock is retained so a human can inspect it instead of racing another process.
      }

      if (
        existing?.hostname === currentHostname &&
        Number.isInteger(existing.pid) &&
        !processIsRunning(existing.pid as number)
      ) {
        await unlink(lockPath).catch((unlinkError: unknown) => {
          if (!isMissingFileError(unlinkError)) {
            throw unlinkError
          }
        })
        continue
      }

      throw new Error(
        `Capture ${request.captureId} is already active (lock: ${repositoryRelativePath(lockPath)})`,
      )
    }
  }

  throw new Error(`Unable to acquire capture lock for ${request.captureId}`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (isMissingFileError(error)) {
      return false
    }

    throw error
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')

  for await (const chunk of createReadStream(path)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

function shellDisplay(command: string, arguments_: readonly string[]): string {
  return [command, ...arguments_].map((value) => JSON.stringify(value)).join(' ')
}

async function runCommand(
  command: string,
  arguments_: readonly string[],
  captureOutput = false,
): Promise<CommandResult> {
  console.error(`> ${shellDisplay(command, arguments_)}`)

  return await new Promise<CommandResult>((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''

    if (captureOutput) {
      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
    }

    child.on('error', (error) => {
      rejectPromise(new Error(`Unable to start ${command}: ${error.message}`, { cause: error }))
    })
    child.on('close', (code) => {
      if (code !== 0) {
        const diagnostics = stderr.trim()
        rejectPromise(
          new Error(
            `${command} exited with code ${code ?? 'unknown'}${diagnostics ? `:\n${diagnostics}` : ''}`,
          ),
        )
        return
      }

      resolvePromise({ stderr, stdout })
    })
  })
}

async function executablePath(command: string): Promise<string> {
  const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = await runCommand(lookupCommand, [command], true)
  const path = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (path === undefined) {
    throw new Error(`Unable to resolve ${command} on PATH`)
  }

  return path
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? ''
}

async function inspectTools(): Promise<ToolRecord> {
  const [ffmpegVersion, ffprobeVersion, ytDlpVersion, ffmpegPath, ffprobePath] =
    await Promise.all([
      runCommand('ffmpeg', ['-version'], true),
      runCommand('ffprobe', ['-version'], true),
      runCommand('uv', ['run', 'yt-dlp', '--version'], true),
      executablePath('ffmpeg'),
      executablePath('ffprobe'),
    ])

  return {
    ffmpegBinarySha256: await sha256File(ffmpegPath),
    ffmpegVersion: firstLine(ffmpegVersion.stdout),
    ffprobeBinarySha256: await sha256File(ffprobePath),
    ffprobeVersion: firstLine(ffprobeVersion.stdout),
    ytDlpVersion: firstLine(ytDlpVersion.stdout),
  }
}

function assertCompatibleTools(recorded: ToolRecord, current: ToolRecord): void {
  const differences: string[] = []

  if (recorded.ffmpegBinarySha256 !== current.ffmpegBinarySha256) {
    differences.push('FFmpeg binary')
  }

  if (recorded.ffprobeBinarySha256 !== current.ffprobeBinarySha256) {
    differences.push('FFprobe binary')
  }

  if (differences.length > 0) {
    throw new Error(
      `This unfinished capture was created with a different ${differences.join(
        ', ',
      )}. Restore the recorded toolchain before regenerating its artifacts.`,
    )
  }
}

function createInitialManifest(request: CaptureRequest): CaptureManifest {
  const createdAt = new Date().toISOString()

  return {
    artifacts: captureArtifacts(request),
    captureId: request.captureId,
    createdAt,
    request,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    updatedAt: createdAt,
  }
}

async function writeManifest(path: string, manifest: CaptureManifest): Promise<void> {
  manifest.updatedAt = new Date().toISOString()
  await mkdir(dirname(path), { recursive: true })
  await assertNoSymlinkComponents(path)
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx')

  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    await rename(temporaryPath, path)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function readManifest(path: string, request: CaptureRequest): Promise<CaptureManifest> {
  const value = JSON.parse(await readFile(path, 'utf8')) as Partial<CaptureManifest>

  if (value.schemaVersion !== CAPTURE_SCHEMA_VERSION || value.captureId !== request.captureId) {
    throw new Error(`Unsupported or mismatched capture manifest: ${repositoryRelativePath(path)}`)
  }

  if (
    value.request?.identity !== request.identity ||
    value.request.roughTimestampSeconds !== request.roughTimestampSeconds
  ) {
    throw new Error(`Capture manifest request does not match ${request.captureId}`)
  }

  const expectedArtifacts = captureArtifacts(request)

  for (const [name, expectedPath] of Object.entries(expectedArtifacts)) {
    const recordedPath = value.artifacts?.[name as keyof CaptureManifest['artifacts']]

    if (recordedPath !== expectedPath) {
      throw new Error(`Capture manifest has an unsafe ${name} path`)
    }
  }

  if (value.source !== undefined) {
    const expectedSourceDirectory = resolve(
      resolveRepositoryPath(expectedArtifacts.workspace),
      'source',
    )
    const clipPath = resolveRepositoryPath(value.source.clipPath)
    const infoJsonPath = resolveRepositoryPath(value.source.infoJsonPath)

    if (
      !pathIsWithin(expectedSourceDirectory, clipPath) ||
      !pathIsWithin(expectedSourceDirectory, infoJsonPath)
    ) {
      throw new Error('Capture manifest has an unsafe source path')
    }

    await assertNoSymlinkComponents(clipPath)
    await assertNoSymlinkComponents(infoJsonPath)
  }

  if (value.output !== undefined) {
    const expectedOutputPath = repositoryRelativePath(
      resolve(incomingRoot, `${request.captureId}.png`),
    )

    if (value.output.path !== expectedOutputPath) {
      throw new Error('Capture manifest has an unsafe final output path')
    }
  }

  return value as CaptureManifest
}

async function findManifestPath(captureId: string): Promise<string | null> {
  const incomingPath = resolve(incomingRoot, `${captureId}.capture.json`)

  if (await fileExists(incomingPath)) {
    await assertNoSymlinkComponents(incomingPath)
    return incomingPath
  }

  const entries = await readdir(questionSourceRoot, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const candidatePath = resolve(questionSourceRoot, entry.name, 'capture.json')

    if (!(await fileExists(candidatePath))) {
      continue
    }

    try {
      await assertNoSymlinkComponents(candidatePath)
      const value = JSON.parse(await readFile(candidatePath, 'utf8')) as { captureId?: unknown }

      if (value.captureId === captureId) {
        return candidatePath
      }
    } catch (error) {
      throw new Error(`Unable to read ${repositoryRelativePath(candidatePath)}`, { cause: error })
    }
  }

  return null
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalNumberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`FFprobe did not return a valid ${label}`)
  }

  return value
}

async function inspectSourceMetadata(manifest: CaptureManifest): Promise<{
  command: readonly string[]
  durationSeconds: number | null
  liveStatus: string | null
}> {
  const arguments_ = [
    'run',
    'yt-dlp',
    '--config-locations',
    'yt-dlp.conf',
    '--no-write-info-json',
    '--dump-single-json',
    '--skip-download',
    manifest.request.canonicalUrl,
  ] as const
  const result = await runCommand('uv', arguments_, true)
  const info = JSON.parse(result.stdout) as Record<string, unknown>

  return {
    command: ['uv', ...arguments_],
    durationSeconds: optionalNumberField(info.duration),
    liveStatus: stringField(info.live_status),
  }
}

async function downloadSource(manifest: CaptureManifest): Promise<SourceRecord> {
  const sourceMetadata = await inspectSourceMetadata(manifest)
  manifest.request = fitCaptureWindowToDuration(
    manifest.request,
    sourceMetadata.durationSeconds,
  )
  const workspace = resolveRepositoryPath(manifest.artifacts.workspace)
  const sourceDirectory = resolve(workspace, 'source')
  const temporaryDirectoryName = `tmp-${randomUUID()}`
  const temporaryDirectory = resolve(workspace, temporaryDirectoryName)
  const sourceDirectoryRelative = repositoryRelativePath(sourceDirectory)
  await assertNoSymlinkComponents(sourceDirectory)
  await assertNoSymlinkComponents(temporaryDirectory)
  await mkdir(sourceDirectory, { recursive: true })
  await mkdir(temporaryDirectory, { recursive: true })
  await assertNoSymlinkComponents(sourceDirectory)
  await assertNoSymlinkComponents(temporaryDirectory)

  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    if (!entry.name.startsWith('clip.')) {
      continue
    }

    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(
        `Unexpected source artifact: ${repositoryRelativePath(resolve(sourceDirectory, entry.name))}`,
      )
    }

    await unlink(resolve(sourceDirectory, entry.name))
  }

  const arguments_ = [
    'run',
    'yt-dlp',
    '--config-locations',
    'yt-dlp.conf',
    '--force-overwrites',
    '--live-from-start',
    '--download-sections',
    `*${formatTimestamp(manifest.request.clipStartSeconds)}-${formatTimestamp(
      manifest.request.clipEndSeconds,
    )}`,
    '--force-keyframes-at-cuts',
    '--paths',
    `home:${sourceDirectoryRelative}`,
    '--paths',
    `temp:../${temporaryDirectoryName}`,
    '--output',
    'clip.%(ext)s',
    '--output',
    'infojson:clip',
    manifest.request.canonicalUrl,
  ] as const

  await runCommand('uv', arguments_)

  const entries = await readdir(sourceDirectory, { withFileTypes: true })
  const mediaFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith('clip.') &&
        !entry.name.endsWith('.json') &&
        !entry.name.endsWith('.part') &&
        !entry.name.endsWith('.ytdl'),
    )
    .map((entry) => entry.name)

  if (mediaFiles.length !== 1) {
    throw new Error(
      `Expected one downloaded clip in ${sourceDirectoryRelative}, found ${mediaFiles.length}`,
    )
  }

  const clipPath = resolve(sourceDirectory, mediaFiles[0] ?? '')
  const infoJsonPath = resolve(sourceDirectory, 'clip.info.json')

  await assertNoSymlinkComponents(clipPath)
  await assertNoSymlinkComponents(infoJsonPath)

  if (!(await fileExists(infoJsonPath))) {
    throw new Error(`yt-dlp did not create ${repositoryRelativePath(infoJsonPath)}`)
  }

  const info = JSON.parse(await readFile(infoJsonPath, 'utf8')) as Record<string, unknown>
  const requestedFormats = Array.isArray(info.requested_formats)
    ? info.requested_formats
        .map((format) =>
          typeof format === 'object' && format !== null
            ? stringField((format as Record<string, unknown>).format_id)
            : null,
        )
        .filter((formatId): formatId is string => formatId !== null)
    : []
  const source: SourceRecord = {
    clipPath: repositoryRelativePath(clipPath),
    clipSha256: await sha256File(clipPath),
    downloadCommand: ['uv', ...arguments_],
    infoJsonPath: repositoryRelativePath(infoJsonPath),
    metadataCommand: sourceMetadata.command,
    metadata: {
      durationSeconds: optionalNumberField(info.duration) ?? sourceMetadata.durationSeconds,
      extractor: stringField(info.extractor),
      formatId: stringField(info.format_id),
      id: stringField(info.id),
      liveStatus: stringField(info.live_status) ?? sourceMetadata.liveStatus,
      requestedFormatIds: requestedFormats,
      title: stringField(info.title),
      webpageUrl: stringField(info.webpage_url),
    },
    sizeBytes: (await stat(clipPath)).size,
  }

  return source
}

async function ensureSource(
  manifest: CaptureManifest,
  manifestPath: string,
): Promise<SourceRecord> {
  if (manifest.source === undefined) {
    const downloaded = await downloadSource(manifest)
    manifest.source = downloaded
    await writeManifest(manifestPath, manifest)
    return downloaded
  }

  const clipPath = resolveRepositoryPath(manifest.source.clipPath)

  if (!(await fileExists(clipPath))) {
    const expectedHash = manifest.source.clipSha256
    const redownloaded = await downloadSource(manifest)

    if (redownloaded.clipSha256 !== expectedHash) {
      throw new Error(
        'The re-downloaded 10-second clip differs from the recorded source; refusing to reuse frame selections',
      )
    }

    manifest.source = redownloaded
    await writeManifest(manifestPath, manifest)
    return redownloaded
  }

  const actualHash = await sha256File(clipPath)

  if (actualHash !== manifest.source.clipSha256) {
    throw new Error(`Source clip hash mismatch: ${manifest.source.clipPath}`)
  }

  return manifest.source
}

function parseFrameTime(frame: Record<string, unknown>): number | null {
  const value = stringField(frame.best_effort_timestamp_time) ?? stringField(frame.pts_time)

  if (value === null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundFrameTime(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

async function probeVideo(source: SourceRecord): Promise<ProbedVideo> {
  const arguments_ = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_streams',
    '-show_frames',
    '-show_entries',
    'stream=index,width,height,pix_fmt,time_base,avg_frame_rate,color_range,color_space,color_transfer,color_primaries:frame=pts,pts_time,best_effort_timestamp,best_effort_timestamp_time,key_frame,pict_type',
    '-of',
    'json',
    source.clipPath,
  ] as const
  const result = await runCommand('ffprobe', arguments_, true)
  const value = JSON.parse(result.stdout) as {
    frames?: readonly Record<string, unknown>[]
    streams?: readonly Record<string, unknown>[]
  }
  const stream = value.streams?.[0]

  if (stream === undefined) {
    throw new Error('FFprobe found no video stream in the downloaded clip')
  }

  const timedFrames = (value.frames ?? [])
    .map((frame, frameIndex) => ({ frame, frameIndex, time: parseFrameTime(frame) }))
    .filter(
      (
        record,
      ): record is { frame: Record<string, unknown>; frameIndex: number; time: number } =>
        record.time !== null,
    )

  if (timedFrames.length === 0) {
    throw new Error('FFprobe found no timestamped video frames in the downloaded clip')
  }

  const firstTime = timedFrames[0]?.time ?? 0
  const frames: ProbedVideoFrame[] = timedFrames.map(({ frame, frameIndex, time }) => ({
    bestEffortTimestamp:
      stringField(frame.best_effort_timestamp) ?? stringField(frame.pts),
    frameIndex,
    keyFrame: frame.key_frame === 1,
    pictureType: stringField(frame.pict_type),
    pts: stringField(frame.pts),
    ptsTimeSeconds: roundFrameTime(time),
    relativeSeconds: roundFrameTime(time - firstTime),
  }))
  const summary: ProbeRecord = {
    averageFrameRate: stringField(stream.avg_frame_rate),
    colorPrimaries: stringField(stream.color_primaries),
    colorRange: stringField(stream.color_range),
    colorSpace: stringField(stream.color_space),
    colorTransfer: stringField(stream.color_transfer),
    frameCount: frames.length,
    height: numberField(stream.height, 'video height'),
    pixelFormat: stringField(stream.pix_fmt) ?? 'unknown',
    probeCommand: ['ffprobe', ...arguments_],
    streamIndex: numberField(stream.index, 'video stream index'),
    timeBase: stringField(stream.time_base) ?? 'unknown',
    width: numberField(stream.width, 'video width'),
  }

  return { frames, summary }
}

function ffmpegInputArguments(source: SourceRecord): readonly string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-filter_threads',
    '1',
    '-hwaccel',
    'none',
    '-threads:v',
    '1',
    '-bitexact',
    '-autorotate',
    '-apply_cropping',
    'all',
    '-i',
    source.clipPath,
  ]
}

function ffmpegPngOutputArguments(): readonly string[] {
  return [
    '-fps_mode',
    'passthrough',
    '-map_metadata',
    '-1',
    '-c:v',
    'png',
    '-threads:v',
    '1',
    '-bitexact',
  ]
}

async function candidateFiles(directory: string): Promise<readonly string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^frame-\d+\.png$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }

    throw error
  }
}

async function prepareCandidateDirectory(
  directory: string,
  candidates: readonly FrameCandidate[],
): Promise<void> {
  await assertNoSymlinkComponents(directory)
  await mkdir(directory, { recursive: true })
  await assertNoSymlinkComponents(directory)

  const expectedNames = new Set(candidates.map((candidate) => candidate.file))
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    if (!/^frame-\d+\.png$/.test(entry.name)) {
      continue
    }

    if (!expectedNames.has(entry.name) || entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Unexpected candidate artifact: ${repositoryRelativePath(resolve(directory, entry.name))}`)
    }

    await unlink(resolve(directory, entry.name))
  }
}

async function assertCandidateFileSet(
  directory: string,
  candidates: readonly FrameCandidate[],
  label: string,
): Promise<void> {
  const actual = await candidateFiles(directory)
  const expected = candidates.map((candidate) => candidate.file).sort((left, right) =>
    left.localeCompare(right),
  )

  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error(
      `Expected ${expected.length} ${label} candidates with exact filenames, generated ${actual.length}`,
    )
  }
}

async function prepareOutputFile(path: string): Promise<void> {
  await assertNoSymlinkComponents(path)

  try {
    const existing = await lstat(path)

    if (!existing.isFile()) {
      throw new Error(`Refusing to replace non-file output: ${repositoryRelativePath(path)}`)
    }

    await unlink(path)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function writePicker(
  path: string,
  heading: string,
  explanation: string,
  candidates: readonly FrameCandidate[],
): Promise<void> {
  const figures = candidates
    .map(
      (candidate) => `      <figure>
        <img src="${escapeHtml(candidate.file)}" alt="Candidate ${candidate.number}">
        <figcaption><strong>${candidate.number}</strong> · ${formatTimestamp(
          candidate.sourceRelativeSeconds,
        )} · source frame ${candidate.sourceFrameIndex}</figcaption>
      </figure>`,
    )
    .join('\n')
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(heading)}</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #111; color: #eee; }
      body { margin: 0 auto; max-width: 1800px; padding: 24px; }
      h1 { margin: 0 0 8px; }
      p { color: #bbb; margin: 0 0 24px; }
      main { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
      figure { margin: 0; border: 1px solid #333; border-radius: 8px; overflow: hidden; background: #1b1b1b; }
      img { display: block; width: 100%; height: auto; }
      figcaption { padding: 10px 12px; font-variant-numeric: tabular-nums; }
      strong { color: #7dd3fc; font-size: 1.25rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(explanation)}</p>
    <main>
${figures}
    </main>
  </body>
</html>
`

  await prepareOutputFile(path)
  await writeFile(path, html, { encoding: 'utf8', flag: 'wx' })
}

async function ensureCoarseStage(
  manifest: CaptureManifest,
  manifestPath: string,
  source: SourceRecord,
  frames: readonly ProbedVideoFrame[],
): Promise<CoarseStage> {
  const directory = resolveRepositoryPath(manifest.artifacts.coarseDirectory)
  const pickerPath = resolve(directory, 'index.html')
  const candidates = createCoarseCandidates(frames)
  const frameIndexes = candidates.map((candidate) => candidate.sourceFrameIndex)

  if (new Set(frameIndexes).size !== COARSE_CANDIDATE_COUNT) {
    throw new Error(
      'The downloaded clip does not contain twenty distinct frames at 2 fps sampling points',
    )
  }

  const outputPattern = `${manifest.artifacts.coarseDirectory}/frame-%02d.png`
  const arguments_ = [
    ...ffmpegInputArguments(source),
    '-map',
    '0:v:0',
    '-vf',
    `select='${frameIndexes.map((frameIndex) => `eq(n,${frameIndex})`).join('+')}',format=rgb24`,
    '-frames:v',
    COARSE_CANDIDATE_COUNT.toString(),
    ...ffmpegPngOutputArguments(),
    outputPattern,
  ]
  const previous = manifest.coarse
  const selectedCandidateNumber = previous?.selectedCandidateNumber

  if (selectedCandidateNumber !== undefined) {
    parseCandidateNumber(selectedCandidateNumber, candidates.length)
  }

  const stage: CoarseStage = {
    candidates,
    framesPerSecond: COARSE_FRAMES_PER_SECOND,
    generationCommand: ['ffmpeg', ...arguments_],
    pickerPath: repositoryRelativePath(pickerPath),
    selectedAt: previous?.selectedAt,
    selectedCandidateNumber,
  }

  manifest.coarse = stage
  await writeManifest(manifestPath, manifest)
  await prepareCandidateDirectory(directory, candidates)
  await runCommand('ffmpeg', arguments_)
  await assertCandidateFileSet(directory, candidates, 'coarse')

  await writePicker(
    pickerPath,
    `${manifest.captureId}: coarse candidates`,
    'Twenty frames sampled at 2 fps. Choose the number that best centers the desired moment.',
    candidates,
  )
  await writeManifest(manifestPath, manifest)
  return stage
}

async function ensureFineStage(
  manifest: CaptureManifest,
  manifestPath: string,
  source: SourceRecord,
  frames: readonly ProbedVideoFrame[],
  coarseCandidate: FrameCandidate,
): Promise<FineStage> {
  const directory = resolveRepositoryPath(manifest.artifacts.fineDirectory)
  const pickerPath = resolve(directory, 'index.html')
  const candidates = createFineCandidates(frames, coarseCandidate.sourceRelativeSeconds)
  const windowStartSeconds = Math.max(
    0,
    coarseCandidate.sourceRelativeSeconds - FINE_RADIUS_SECONDS,
  )
  const windowEndSeconds = coarseCandidate.sourceRelativeSeconds + FINE_RADIUS_SECONDS
  const firstCandidate = candidates[0]
  const lastCandidate = candidates.at(-1)

  if (firstCandidate === undefined || lastCandidate === undefined) {
    throw new Error('No full-frame-rate candidates were found')
  }

  const outputPattern = `${manifest.artifacts.fineDirectory}/frame-%03d.png`
  const arguments_ = [
    ...ffmpegInputArguments(source),
    '-map',
    '0:v:0',
    '-vf',
    `select='${candidates
      .map((candidate) => `eq(n,${candidate.sourceFrameIndex})`)
      .join('+')}',format=rgb24`,
    '-frames:v',
    candidates.length.toString(),
    ...ffmpegPngOutputArguments(),
    outputPattern,
  ]
  const previous = manifest.fine
  const selectedCandidateNumber = previous?.selectedCandidateNumber

  if (selectedCandidateNumber !== undefined) {
    parseCandidateNumber(selectedCandidateNumber, candidates.length)
  }

  const stage: FineStage = {
    candidates,
    centerSeconds: coarseCandidate.sourceRelativeSeconds,
    generationCommand: ['ffmpeg', ...arguments_],
    pickerPath: repositoryRelativePath(pickerPath),
    radiusSeconds: FINE_RADIUS_SECONDS,
    selectedAt: previous?.selectedAt,
    selectedCandidateNumber,
    windowEndSeconds,
    windowStartSeconds,
  }

  manifest.fine = stage
  await writeManifest(manifestPath, manifest)
  await prepareCandidateDirectory(directory, candidates)
  await runCommand('ffmpeg', arguments_)
  await assertCandidateFileSet(directory, candidates, 'full-frame-rate')

  await writePicker(
    pickerPath,
    `${manifest.captureId}: full-frame-rate candidates`,
    `Every decoded frame within ±${FINE_RADIUS_SECONDS.toFixed(
      1,
    )} seconds of coarse candidate ${coarseCandidate.number}. Choose the final frame number.`,
    candidates,
  )
  await writeManifest(manifestPath, manifest)
  return stage
}

function openPicker(path: string): void {
  const url = pathToFileURL(path).href
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

async function requestCandidate(
  stageName: 'coarse' | 'final',
  candidates: readonly FrameCandidate[],
  pickerPath: string,
  providedValue: string | undefined,
  shouldOpenPicker: boolean,
): Promise<number | null> {
  if (providedValue !== undefined) {
    return parseCandidateNumber(providedValue, candidates.length)
  }

  if (!process.stdin.isTTY) {
    console.error(`Candidates are ready at ${pickerPath}`)
    console.error(`Rerun with --${stageName} <number> to record the choice.`)
    return null
  }

  const absolutePickerPath = resolveRepositoryPath(pickerPath)

  if (shouldOpenPicker) {
    openPicker(absolutePickerPath)
  }

  const interface_ = createInterface({ input: process.stdin, output: process.stderr })

  try {
    while (true) {
      const answer = await interface_.question(
        `Choose ${stageName} candidate 1-${candidates.length}: `,
      )

      try {
        return parseCandidateNumber(answer, candidates.length)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      }
    }
  } finally {
    interface_.close()
  }
}

function selectedCandidate(stage: CandidateStage): FrameCandidate {
  const selectedNumber = stage.selectedCandidateNumber

  if (selectedNumber === undefined) {
    throw new Error('Candidate stage has no recorded selection')
  }

  const selected = stage.candidates.find((candidate) => candidate.number === selectedNumber)

  if (selected === undefined) {
    throw new Error(`Recorded candidate ${selectedNumber} is not present in its stage`)
  }

  return selected
}

function recordStageSelection(
  stage: CandidateStage,
  selection: number,
  providedValue: string | undefined,
  label: string,
): void {
  if (stage.selectedCandidateNumber !== undefined) {
    if (providedValue !== undefined && stage.selectedCandidateNumber !== selection) {
      throw new Error(
        `${label} candidate ${stage.selectedCandidateNumber} is already recorded; refusing to replace it with ${selection}`,
      )
    }

    return
  }

  stage.selectedCandidateNumber = selection
  stage.selectedAt = new Date().toISOString()
}

async function probeImage(path: string): Promise<{
  height: number
  pixelFormat: string
  width: number
}> {
  const result = await runCommand(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,pix_fmt',
      '-of',
      'json',
      path,
    ],
    true,
  )
  const value = JSON.parse(result.stdout) as {
    streams?: readonly Record<string, unknown>[]
  }
  const stream = value.streams?.[0]

  if (stream === undefined) {
    throw new Error(`FFprobe found no image stream in ${path}`)
  }

  return {
    height: numberField(stream.height, 'image height'),
    pixelFormat: stringField(stream.pix_fmt) ?? 'unknown',
    width: numberField(stream.width, 'image width'),
  }
}

async function existingCompletedOutput(
  manifest: CaptureManifest,
  manifestPath: string,
): Promise<string | null> {
  if (manifest.output === undefined) {
    return null
  }

  const recordedPath = resolveRepositoryPath(manifest.output.path)
  const migratedPath = resolve(dirname(manifestPath), 'original.png')
  const candidatePaths = [...new Set([recordedPath, migratedPath])]
  const existingPaths: string[] = []

  for (const candidatePath of candidatePaths) {
    await assertNoSymlinkComponents(candidatePath)

    if (!(await fileExists(candidatePath))) {
      continue
    }

    existingPaths.push(candidatePath)

    if ((await sha256File(candidatePath)) === manifest.output.sha256) {
      return candidatePath
    }
  }

  if (existingPaths.length > 0) {
    throw new Error(
      `Recorded final PNG hash mismatch: ${existingPaths
        .map((path) => repositoryRelativePath(path))
        .join(', ')}`,
    )
  }

  return null
}

async function createFinalOutput(
  manifest: CaptureManifest,
  manifestPath: string,
  source: SourceRecord,
  candidate: FrameCandidate,
): Promise<OutputRecord> {
  const workspaceOutputPath = resolveRepositoryPath(manifest.artifacts.selectedWorkspacePng)
  const incomingOutputPath = resolve(incomingRoot, `${manifest.captureId}.png`)
  const incomingOutputRelative = repositoryRelativePath(incomingOutputPath)
  const fineDirectory = resolveRepositoryPath(manifest.artifacts.fineDirectory)
  const selectedCandidatePath = resolve(fineDirectory, candidate.file)

  if (!pathIsWithin(fineDirectory, selectedCandidatePath)) {
    throw new Error(`Selected candidate path escapes its gallery: ${candidate.file}`)
  }

  await assertNoSymlinkComponents(selectedCandidatePath)

  if (!(await fileExists(selectedCandidatePath))) {
    throw new Error(`Selected candidate is missing: ${repositoryRelativePath(selectedCandidatePath)}`)
  }

  const selectedCandidatePngSha256 = await sha256File(selectedCandidatePath)
  await mkdir(dirname(workspaceOutputPath), { recursive: true })
  await mkdir(incomingRoot, { recursive: true })
  await prepareOutputFile(workspaceOutputPath)
  await assertNoSymlinkComponents(incomingOutputPath)

  const arguments_ = [
    ...ffmpegInputArguments(source),
    '-map',
    '0:v:0',
    '-vf',
    `select='eq(n,${candidate.sourceFrameIndex})',format=rgb24`,
    '-frames:v',
    '1',
    ...ffmpegPngOutputArguments(),
    manifest.artifacts.selectedWorkspacePng,
  ]

  await runCommand('ffmpeg', arguments_)

  const workspaceHash = await sha256File(workspaceOutputPath)

  if (workspaceHash !== selectedCandidatePngSha256) {
    throw new Error('The selected gallery frame does not match deterministic final extraction')
  }

  if (await fileExists(incomingOutputPath)) {
    const existingHash = await sha256File(incomingOutputPath)

    if (existingHash !== workspaceHash) {
      throw new Error(`Refusing to overwrite existing ${incomingOutputRelative}`)
    }
  } else {
    await copyFile(workspaceOutputPath, incomingOutputPath, constants.COPYFILE_EXCL)
  }

  const image = await probeImage(incomingOutputRelative)
  const output: OutputRecord = {
    extractionCommand: ['ffmpeg', ...arguments_],
    height: image.height,
    path: incomingOutputRelative,
    pixelFormat: image.pixelFormat,
    selectedCandidatePngSha256,
    selectedAt: new Date().toISOString(),
    selectedFrame: candidate,
    sha256: await sha256File(incomingOutputPath),
    sizeBytes: (await stat(incomingOutputPath)).size,
    width: image.width,
  }

  manifest.output = output
  await writeManifest(manifestPath, manifest)
  return output
}

async function runCapture(options: CliOptions, request: CaptureRequest): Promise<void> {
  const existingManifestPath = await findManifestPath(request.captureId)
  const manifestPath =
    existingManifestPath ?? resolve(incomingRoot, `${request.captureId}.capture.json`)
  const manifest =
    existingManifestPath === null
      ? createInitialManifest(request)
      : await readManifest(existingManifestPath, request)

  if (existingManifestPath === null) {
    await writeManifest(manifestPath, manifest)
  }

  const completedOutput = await existingCompletedOutput(manifest, manifestPath)

  if (completedOutput !== null) {
    console.error(`Reusing recorded final frame from ${repositoryRelativePath(completedOutput)}`)
    console.log(repositoryRelativePath(completedOutput))
    return
  }

  const currentTools = await inspectTools()

  if (manifest.tools === undefined) {
    manifest.tools = currentTools
    await writeManifest(manifestPath, manifest)
  } else {
    assertCompatibleTools(manifest.tools, currentTools)
  }

  const source = await ensureSource(manifest, manifestPath)
  const probe = await probeVideo(source)
  manifest.probe = probe.summary
  await writeManifest(manifestPath, manifest)

  const coarse = await ensureCoarseStage(
    manifest,
    manifestPath,
    source,
    probe.frames,
  )
  const coarseSelection =
    coarse.selectedCandidateNumber === undefined
      ? await requestCandidate(
          'coarse',
          coarse.candidates,
          coarse.pickerPath,
          options.coarseCandidate,
          options.openPicker,
        )
      : options.coarseCandidate === undefined
        ? coarse.selectedCandidateNumber
        : parseCandidateNumber(options.coarseCandidate, coarse.candidates.length)

  if (coarseSelection === null) {
    return
  }

  recordStageSelection(coarse, coarseSelection, options.coarseCandidate, 'Coarse')
  manifest.coarse = coarse
  await writeManifest(manifestPath, manifest)

  const fine = await ensureFineStage(
    manifest,
    manifestPath,
    source,
    probe.frames,
    selectedCandidate(coarse),
  )
  const finalSelection =
    fine.selectedCandidateNumber === undefined
      ? await requestCandidate(
          'final',
          fine.candidates,
          fine.pickerPath,
          options.finalCandidate,
          options.openPicker,
        )
      : options.finalCandidate === undefined
        ? fine.selectedCandidateNumber
        : parseCandidateNumber(options.finalCandidate, fine.candidates.length)

  if (finalSelection === null) {
    return
  }

  recordStageSelection(fine, finalSelection, options.finalCandidate, 'Final')
  manifest.fine = fine
  await writeManifest(manifestPath, manifest)

  const output = await createFinalOutput(
    manifest,
    manifestPath,
    source,
    selectedCandidate(fine),
  )

  console.error(`Recorded final frame at ${output.path}`)
  console.error(`Selection manifest: ${repositoryRelativePath(manifestPath)}`)
  console.log(output.path)
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))

  if (options.help) {
    console.log(usage())
    return
  }

  if (options.url === undefined || options.timestamp === undefined) {
    throw new Error(`--url and --timestamp are required\n\n${usage()}`)
  }

  const request = createCaptureRequest(options.url, options.timestamp)
  const releaseLock = await acquireCaptureLock(request)

  try {
    await runCapture(options, request)
  } finally {
    await releaseLock()
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
