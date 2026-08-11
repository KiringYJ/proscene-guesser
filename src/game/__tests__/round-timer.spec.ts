import { describe, expect, it } from 'vitest'

import { formatRemainingTime, getRemainingSeconds } from '@/game/round-timer'
import type { RoundTimer } from '@/game/session'

describe('round timer display', () => {
  it('derives remaining seconds from the absolute deadline', () => {
    const timer: RoundTimer = {
      kind: 'deadline',
      durationSeconds: 90,
      deadlineAt: 90_000,
    }

    expect(getRemainingSeconds(timer, 0)).toBe(90)
    expect(getRemainingSeconds(timer, 1)).toBe(90)
    expect(getRemainingSeconds(timer, 1_000)).toBe(89)
    expect(getRemainingSeconds(timer, 89_999)).toBe(1)
    expect(getRemainingSeconds(timer, 90_000)).toBe(0)
    expect(getRemainingSeconds(timer, 120_000)).toBe(0)
  })

  it('returns null for an unlimited round', () => {
    expect(getRemainingSeconds({ kind: 'unlimited' }, Date.now())).toBeNull()
  })

  it('formats countdown values without locale-dependent output', () => {
    expect(formatRemainingTime(90)).toBe('1:30')
    expect(formatRemainingTime(9)).toBe('0:09')
    expect(formatRemainingTime(null)).toBe('No limit')
  })
})
