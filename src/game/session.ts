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
  bestPoints: number
}

export type SubmitRejectionCode =
  | 'incomplete-answer'
  | 'not-answering'
  | 'already-submitted'
  | 'temporarily-unavailable'

export type AdvanceRejectionCode =
  | 'not-revealed'
  | 'already-advancing'
  | 'temporarily-unavailable'

export type SubmissionState =
  | { status: 'editable' }
  | { status: 'pending' }
  | { status: 'accepted' }
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
      phase: 'empty'
      reason: 'no-playable-questions'
      progress: SessionProgress & { roundNumber: 0; roundCount: 0 }
    }
  | {
      phase: 'answering'
      roundId: string
      prompt: QuestionPrompt
      progress: SessionProgress
      submission: SubmissionState
    }
  | {
      phase: 'revealed'
      roundId: string
      prompt: QuestionPrompt
      disclosure: RevealDisclosure
      result: ScoreResult
      progress: SessionProgress
      advance: AdvanceState
      nextLabel: 'Next archive' | 'Replay archive'
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
  | { ok: true; previousRoundId: string; nextRoundId: string }
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
  submitAnswer(answer: PlayerAnswer): Promise<SubmitOutcome>
  advanceRound(): Promise<AdvanceOutcome>
}
