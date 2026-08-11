import type { RoundTimer } from '@/game/session'

export function getRemainingSeconds(timer: RoundTimer, now: number): number | null {
  if (timer.kind === 'unlimited') {
    return null
  }

  return Math.max(0, Math.ceil((timer.deadlineAt - now) / 1_000))
}

export function formatRemainingTime(seconds: number | null): string {
  if (seconds === null) {
    return 'No limit'
  }

  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60

  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
