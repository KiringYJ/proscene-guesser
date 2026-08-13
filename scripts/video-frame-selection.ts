import { createHash } from 'node:crypto'

export const COARSE_CLIP_DURATION_SECONDS = 10
export const COARSE_FRAMES_PER_SECOND = 2
export const COARSE_CANDIDATE_COUNT =
  COARSE_CLIP_DURATION_SECONDS * COARSE_FRAMES_PER_SECOND
export const FINE_RADIUS_SECONDS = 0.5

const YOUTUBE_HOSTS = new Set([
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
])
const YOUTUBE_VIDEO_ID_PATTERN = /^[0-9A-Za-z_-]{6,}$/

export interface CanonicalSource {
  canonicalUrl: string
  identity: string
}

export interface CaptureRequest extends CanonicalSource {
  captureId: string
  roughTimestampSeconds: number
  clipStartSeconds: number
  clipEndSeconds: number
}

export interface ProbedVideoFrame {
  frameIndex: number
  pts: string | null
  ptsTimeSeconds: number
  relativeSeconds: number
  bestEffortTimestamp: string | null
  keyFrame: boolean
  pictureType: string | null
}

export interface FrameCandidate {
  number: number
  file: string
  sampleSeconds: number
  sourceFrameIndex: number
  sourcePts: string | null
  sourcePtsTimeSeconds: number
  sourceRelativeSeconds: number
}

function roundToMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000
}

function parseTimestampPart(value: string, label: string, allowFraction: boolean): number {
  const pattern = allowFraction ? /^\d+(?:\.\d+)?$/ : /^\d+$/

  if (!pattern.test(value)) {
    throw new Error(`${label} must be a non-negative number`)
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} is outside the supported range`)
  }

  return parsed
}

export function parseTimestampSeconds(value: string): number {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error('Timestamp cannot be empty')
  }

  const parts = normalized.split(':')

  if (parts.length > 3) {
    throw new Error('Timestamp must use SS, MM:SS, or HH:MM:SS')
  }

  const values = parts.map((part, index) =>
    parseTimestampPart(part, `Timestamp part ${index + 1}`, index === parts.length - 1),
  )
  const seconds = values.at(-1) ?? 0

  if (parts.length > 1 && seconds >= 60) {
    throw new Error('Timestamp seconds must be less than 60 when using colons')
  }

  const minutes = values.length > 1 ? (values.at(-2) ?? 0) : 0

  if (parts.length > 2 && minutes >= 60) {
    throw new Error('Timestamp minutes must be less than 60 when hours are present')
  }

  const hours = values.length > 2 ? values[0] : 0
  return roundToMilliseconds(hours * 3600 + minutes * 60 + seconds)
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Timestamp must be a finite non-negative number')
  }

  const totalMilliseconds = Math.round(seconds * 1000)
  const milliseconds = totalMilliseconds % 1000
  const totalSeconds = Math.floor(totalMilliseconds / 1000)
  const formattedSeconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const formattedMinutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  return `${hours.toString().padStart(2, '0')}:${formattedMinutes
    .toString()
    .padStart(2, '0')}:${formattedSeconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`
}

function youtubeVideoId(url: URL): string | null {
  const hostname = url.hostname.toLowerCase()

  if (hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] ?? null
  }

  if (url.pathname === '/watch') {
    return url.searchParams.get('v')
  }

  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[0] === 'live' || segments[0] === 'shorts' || segments[0] === 'embed') {
    return segments[1] ?? null
  }

  return null
}

export function canonicalizeSourceUrl(value: string): CanonicalSource {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error('Source URL must be an absolute HTTP or HTTPS URL')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Source URL must use HTTP or HTTPS')
  }

  url.hash = ''
  url.hostname = url.hostname.toLowerCase()

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = youtubeVideoId(url)

    if (videoId === null || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
      throw new Error(
        'YouTube URLs must identify one stable video; channel-level /live URLs are not resumable',
      )
    }

    return {
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      identity: `youtube:${videoId}`,
    }
  }

  throw new Error('The resumable frame picker currently requires a stable YouTube video URL')
}

export function createCaptureRequest(url: string, timestamp: string): CaptureRequest {
  const source = canonicalizeSourceUrl(url.trim())
  const roughTimestampSeconds = parseTimestampSeconds(timestamp)
  const clipStartSeconds = roundToMilliseconds(
    Math.max(0, roughTimestampSeconds - COARSE_CLIP_DURATION_SECONDS / 2),
  )
  const clipEndSeconds = roundToMilliseconds(
    clipStartSeconds + COARSE_CLIP_DURATION_SECONDS,
  )
  const digest = createHash('sha256')
    .update(`${source.identity}\n${Math.round(roughTimestampSeconds * 1000)}`)
    .digest('hex')
    .slice(0, 16)

  return {
    ...source,
    captureId: `capture-${digest}`,
    roughTimestampSeconds,
    clipStartSeconds,
    clipEndSeconds,
  }
}

export function fitCaptureWindowToDuration(
  request: CaptureRequest,
  durationSeconds: number | null,
): CaptureRequest {
  if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return request
  }

  const roundedDuration = roundToMilliseconds(durationSeconds)
  const maximumStart = Math.max(0, roundedDuration - COARSE_CLIP_DURATION_SECONDS)
  const clipStartSeconds = roundToMilliseconds(
    Math.min(
      Math.max(0, request.roughTimestampSeconds - COARSE_CLIP_DURATION_SECONDS / 2),
      maximumStart,
    ),
  )

  return {
    ...request,
    clipStartSeconds,
    clipEndSeconds: roundToMilliseconds(
      Math.min(roundedDuration, clipStartSeconds + COARSE_CLIP_DURATION_SECONDS),
    ),
  }
}

function nearestFrame(frames: readonly ProbedVideoFrame[], targetSeconds: number): ProbedVideoFrame {
  const firstFrame = frames[0]

  if (firstFrame === undefined) {
    throw new Error('Cannot select from an empty video frame list')
  }

  let nearest = firstFrame
  let nearestDistance = Math.abs(firstFrame.relativeSeconds - targetSeconds)

  for (const frame of frames.slice(1)) {
    const distance = Math.abs(frame.relativeSeconds - targetSeconds)

    if (distance < nearestDistance) {
      nearest = frame
      nearestDistance = distance
    }
  }

  return nearest
}

function candidateFromFrame(
  number: number,
  file: string,
  sampleSeconds: number,
  frame: ProbedVideoFrame,
): FrameCandidate {
  return {
    number,
    file,
    sampleSeconds: roundToMilliseconds(sampleSeconds),
    sourceFrameIndex: frame.frameIndex,
    sourcePts: frame.pts,
    sourcePtsTimeSeconds: frame.ptsTimeSeconds,
    sourceRelativeSeconds: frame.relativeSeconds,
  }
}

export function createCoarseCandidates(
  frames: readonly ProbedVideoFrame[],
): readonly FrameCandidate[] {
  return Array.from({ length: COARSE_CANDIDATE_COUNT }, (_, index) => {
    const sampleSeconds = index / COARSE_FRAMES_PER_SECOND
    const frame = nearestFrame(frames, sampleSeconds)

    return candidateFromFrame(
      index + 1,
      `frame-${(index + 1).toString().padStart(2, '0')}.png`,
      sampleSeconds,
      frame,
    )
  })
}

export function createFineCandidates(
  frames: readonly ProbedVideoFrame[],
  centerSeconds: number,
): readonly FrameCandidate[] {
  const windowStart = Math.max(0, centerSeconds - FINE_RADIUS_SECONDS)
  const windowEnd = centerSeconds + FINE_RADIUS_SECONDS
  const selectedFrames = frames.filter(
    (frame) =>
      frame.relativeSeconds >= windowStart - Number.EPSILON &&
      frame.relativeSeconds <= windowEnd + Number.EPSILON,
  )
  const candidates =
    selectedFrames.length > 0 ? selectedFrames : [nearestFrame(frames, centerSeconds)]

  return candidates.map((frame, index) =>
    candidateFromFrame(
      index + 1,
      `frame-${(index + 1).toString().padStart(3, '0')}.png`,
      frame.relativeSeconds,
      frame,
    ),
  )
}

export function parseCandidateNumber(value: string | number, maximum: number): number {
  const normalized = typeof value === 'number' ? value.toString() : value.trim()

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Selection must be a whole number from 1 to ${maximum}`)
  }

  const candidateNumber = Number(normalized)

  if (candidateNumber < 1 || candidateNumber > maximum) {
    throw new Error(`Selection must be between 1 and ${maximum}`)
  }

  return candidateNumber
}
