import { describe, expect, it } from 'vitest'

import {
  ElapsedAnswerClock,
  shouldCountAnswerTime,
} from '@/game/elapsed-answer-clock'
import type { SubmissionState } from '@/game/session'

describe('elapsed answer clock', () => {
  it('excludes paused submission-processing latency from the total', () => {
    const clock = new ElapsedAnswerClock()

    clock.resume(1_000)
    clock.pause(2_500)

    expect(clock.getElapsedSeconds(12_500)).toBe(1)

    clock.resume(12_500)
    expect(clock.getElapsedSeconds(13_500)).toBe(2)
  })

  it('only counts time while an answer can be edited or retried', () => {
    const states: Array<[SubmissionState, boolean]> = [
      [{ status: 'editable' }, true],
      [{ status: 'pending' }, false],
      [
        {
          status: 'rejected',
          code: 'temporarily-unavailable',
          message: 'Retry.',
          retryable: true,
        },
        true,
      ],
      [
        {
          status: 'rejected',
          code: 'already-submitted',
          message: 'Locked.',
          retryable: false,
        },
        false,
      ],
    ]

    for (const [state, expected] of states) {
      expect(shouldCountAnswerTime(state)).toBe(expected)
    }
  })
})
