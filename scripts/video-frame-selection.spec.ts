import { describe, expect, it } from 'vitest'

import {
  COARSE_CANDIDATE_COUNT,
  createCaptureRequest,
  createCoarseCandidates,
  createFineCandidates,
  fitCaptureWindowToDuration,
  formatTimestamp,
  parseCandidateNumber,
  parseTimestampSeconds,
  type ProbedVideoFrame,
} from './video-frame-selection.ts'

function framesAt(framesPerSecond: number, durationSeconds: number): readonly ProbedVideoFrame[] {
  return Array.from({ length: framesPerSecond * durationSeconds }, (_, frameIndex) => {
    const relativeSeconds = frameIndex / framesPerSecond

    return {
      bestEffortTimestamp: frameIndex.toString(),
      frameIndex,
      keyFrame: frameIndex === 0,
      pictureType: frameIndex === 0 ? 'I' : 'P',
      pts: frameIndex.toString(),
      ptsTimeSeconds: relativeSeconds,
      relativeSeconds,
    }
  })
}

describe('video frame selection timestamps', () => {
  it('normalizes supported timestamp forms to milliseconds', () => {
    expect(parseTimestampSeconds('75.25')).toBe(75.25)
    expect(parseTimestampSeconds('01:15.250')).toBe(75.25)
    expect(parseTimestampSeconds('02:01:15.250')).toBe(7275.25)
    expect(formatTimestamp(7275.25)).toBe('02:01:15.250')
  })

  it('rejects ambiguous or invalid colon fields', () => {
    expect(() => parseTimestampSeconds('1:60')).toThrow(/seconds must be less than 60/)
    expect(() => parseTimestampSeconds('1:60:00')).toThrow(/minutes must be less than 60/)
    expect(() => parseTimestampSeconds('-1')).toThrow(/non-negative number/)
    expect(() => parseTimestampSeconds('1.5:30')).toThrow(/non-negative number/)
  })
})

describe('capture request identity', () => {
  it('uses the same capture for equivalent YouTube URLs and timestamp forms', () => {
    const watch = createCaptureRequest(
      'https://www.youtube.com/watch?v=abcdefghijk&t=10',
      '01:15',
    )
    const short = createCaptureRequest('https://youtu.be/abcdefghijk?si=tracking', '75')
    const live = createCaptureRequest('https://youtube.com/live/abcdefghijk', '00:01:15.000')

    expect(short.captureId).toBe(watch.captureId)
    expect(live.captureId).toBe(watch.captureId)
    expect(watch.canonicalUrl).toBe('https://www.youtube.com/watch?v=abcdefghijk')
    expect(watch.clipStartSeconds).toBe(70)
    expect(watch.clipEndSeconds).toBe(80)
  })

  it('keeps a ten-second clip when the rough timestamp is near the start', () => {
    const request = createCaptureRequest('https://youtu.be/abcdefghijk', '2')

    expect(request.clipStartSeconds).toBe(0)
    expect(request.clipEndSeconds).toBe(10)
  })

  it('shifts the clip backward to retain ten seconds near the end of a video', () => {
    const request = createCaptureRequest('https://youtu.be/abcdefghijk', '17')
    const fitted = fitCaptureWindowToDuration(request, 18.933)

    expect(fitted.clipStartSeconds).toBe(8.933)
    expect(fitted.clipEndSeconds).toBe(18.933)
    expect(fitted.captureId).toBe(request.captureId)
  })

  it('rejects a channel-level live URL that can point to a different stream later', () => {
    expect(() =>
      createCaptureRequest('https://www.youtube.com/@example/live', '10'),
    ).toThrow(/stable video/)
  })

  it('rejects non-YouTube URLs from the resumable workflow', () => {
    expect(() => createCaptureRequest('https://example.com/video.mp4', '10')).toThrow(
      /requires a stable YouTube video URL/,
    )
  })
})

describe('coarse and fine candidates', () => {
  it('maps twenty 2 fps samples to exact source-frame identities', () => {
    const candidates = createCoarseCandidates(framesAt(60, 10))

    expect(candidates).toHaveLength(COARSE_CANDIDATE_COUNT)
    expect(candidates[0]).toMatchObject({
      file: 'frame-01.png',
      number: 1,
      sampleSeconds: 0,
      sourceFrameIndex: 0,
    })
    expect(candidates[19]).toMatchObject({
      file: 'frame-20.png',
      number: 20,
      sampleSeconds: 9.5,
      sourceFrameIndex: 570,
    })
  })

  it('returns every decoded frame in the selected plus-or-minus half-second window', () => {
    const candidates = createFineCandidates(framesAt(60, 10), 5)

    expect(candidates).toHaveLength(61)
    expect(candidates[0]).toMatchObject({
      file: 'frame-001.png',
      sourceFrameIndex: 270,
      sourceRelativeSeconds: 4.5,
    })
    expect(candidates.at(-1)).toMatchObject({
      file: 'frame-061.png',
      sourceFrameIndex: 330,
      sourceRelativeSeconds: 5.5,
    })
  })

  it('validates recorded candidate numbers', () => {
    expect(parseCandidateNumber('08', 20)).toBe(8)
    expect(() => parseCandidateNumber('0', 20)).toThrow(/between 1 and 20/)
    expect(() => parseCandidateNumber('3.5', 20)).toThrow(/whole number/)
  })
})
