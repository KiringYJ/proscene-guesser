import type {
  RoundCompletionReason,
  SoloGameAvailability,
  SoloGameConfig,
  SoloGamePlan,
  SoloGameSummary,
  TimedSoloGameSeconds,
} from '@/game/solo'
import type {
  PlayerAnswer,
  QuestionPrompt,
  RevealDisclosure,
  ScoreResult,
} from '@/types/question'

export interface SessionProgress {
  roundNumber: number
  roundCount: number
  roundsPlayed: number
  points: number
  possiblePoints: number
}

export type RoundTimer =
  | { kind: 'unlimited' }
  | {
      kind: 'deadline'
      durationSeconds: TimedSoloGameSeconds
      deadlineAt: number
    }

export type StartRejectionCode =
  | 'invalid-config'
  | 'no-questions-in-pool'
  | 'not-startable'
  | 'already-starting'
  | 'temporarily-unavailable'

export type SubmitRejectionCode =
  | 'incomplete-answer'
  | 'not-answering'
  | 'already-submitted'
  | 'stale-round'
  | 'round-not-expired'
  | 'temporarily-unavailable'

export type AdvanceRejectionCode =
  | 'not-revealed'
  | 'already-advancing'
  | 'temporarily-unavailable'

export type StartState =
  | { status: 'ready' }
  | { status: 'pending' }
  | {
      status: 'rejected'
      code: StartRejectionCode
      message: string
      retryable: boolean
    }

export type SubmissionState =
  | { status: 'editable' }
  | { status: 'pending' }
  | {
      status: 'rejected'
      code: SubmitRejectionCode
      message: string
      retryable: boolean
    }

export type AdvanceState =
  | { status: 'ready' }
  | { status: 'pending' }
  | {
      status: 'rejected'
      code: AdvanceRejectionCode
      message: string
      retryable: boolean
    }

export type ActiveGameSnapshot =
  | {
      phase: 'setup'
      availability: SoloGameAvailability
      initialConfig: SoloGameConfig
      start: StartState
    }
  | {
      phase: 'answering'
      gameId: string
      roundId: string
      prompt: QuestionPrompt
      plan: SoloGamePlan
      progress: SessionProgress
      timer: RoundTimer
      submission: SubmissionState
    }
  | {
      phase: 'revealed'
      gameId: string
      roundId: string
      prompt: QuestionPrompt
      disclosure: RevealDisclosure
      result: ScoreResult
      completionReason: RoundCompletionReason
      plan: SoloGamePlan
      progress: SessionProgress
      advance: AdvanceState
      nextLabel: 'Next archive' | 'View results'
    }
  | {
      phase: 'finished'
      gameId: string
      plan: SoloGamePlan
      summary: SoloGameSummary
      availability: SoloGameAvailability
      start: StartState
    }

export type StartOutcome =
  | {
      ok: true
      gameId: string
      roundCount: number
      constrainedByAvailability: boolean
    }
  | {
      ok: false
      code: StartRejectionCode
      message: string
      retryable: boolean
    }

export type SubmitOutcome =
  | { ok: true; roundId: string }
  | {
      ok: false
      roundId?: string
      code: SubmitRejectionCode
      message: string
      retryable: boolean
    }

export type AdvanceOutcome =
  | {
      ok: true
      destination: 'round'
      previousRoundId: string
      nextRoundId: string
    }
  | {
      ok: true
      destination: 'finished'
      previousRoundId: string
    }
  | {
      ok: false
      roundId?: string
      code: AdvanceRejectionCode
      message: string
      retryable: boolean
    }

export interface ActiveGameSessionPort {
  getSnapshot(): ActiveGameSnapshot
  subscribe(listener: (snapshot: ActiveGameSnapshot) => void): () => void
  startGame(config: SoloGameConfig): Promise<StartOutcome>
  submitAnswer(answer: PlayerAnswer): Promise<SubmitOutcome>
  expireRound(roundId: string, answer: PlayerAnswer): Promise<SubmitOutcome>
  advanceRound(): Promise<AdvanceOutcome>
  returnToSetup(): void
}
