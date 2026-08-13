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

export function formatElapsedTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(wholeSeconds / 3_600)
  const minutes = Math.floor((wholeSeconds % 3_600) / 60)
  const remainder = wholeSeconds % 60
  const minuteDisplay = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const clock = `${minuteDisplay}:${String(remainder).padStart(2, '0')}`

  return hours > 0 ? `${hours}:${clock}` : clock
}
