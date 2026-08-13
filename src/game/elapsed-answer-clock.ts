import type { SubmissionState } from '@/game/session'

export function shouldCountAnswerTime(submission: SubmissionState): boolean {
  return (
    submission.status === 'editable' ||
    (submission.status === 'rejected' && submission.retryable)
  )
}

export class ElapsedAnswerClock {
  private accruedMilliseconds = 0
  private startedAt: number | undefined

  reset(): void {
    this.accruedMilliseconds = 0
    this.startedAt = undefined
  }

  resume(now: number): void {
    this.startedAt ??= now
  }

  pause(now: number): void {
    if (this.startedAt === undefined) {
      return
    }

    this.accruedMilliseconds += Math.max(0, now - this.startedAt)
    this.startedAt = undefined
  }

  getElapsedSeconds(now: number): number {
    const activeMilliseconds = this.startedAt === undefined
      ? 0
      : Math.max(0, now - this.startedAt)

    return Math.floor((this.accruedMilliseconds + activeMilliseconds) / 1_000)
  }
}
