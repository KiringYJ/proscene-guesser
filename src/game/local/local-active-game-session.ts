import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import { isAnswerComplete } from '@/game/scoring'
import type {
  ActiveGameSessionPort,
  ActiveGameSnapshot,
  AdvanceOutcome,
  SessionProgress,
  SubmitOutcome,
} from '@/game/session'
import { scoreAnswer } from '@/lib/scoring'
import type { PlayerAnswer } from '@/types/question'

export type LocalSessionCommand = 'submit' | 'advance'

export interface LocalActiveGameSessionOptions {
  commandBoundary?: (command: LocalSessionCommand) => Promise<void>
}

export class LocalSessionUnavailableError extends Error {
  constructor(message = 'The local game session is temporarily unavailable') {
    super(message)
    this.name = 'LocalSessionUnavailableError'
  }
}

const submissionUnavailable = {
  status: 'rejected',
  code: 'temporarily-unavailable',
  message: 'The answer could not be submitted. Try again.',
  retryable: true,
} as const

const advanceUnavailable = {
  status: 'rejected',
  code: 'temporarily-unavailable',
  message: 'The next round could not be opened. Try again.',
  retryable: true,
} as const

export class LocalActiveGameSession implements ActiveGameSessionPort {
  readonly #bundles: readonly LocalQuestionBundle[]
  readonly #commandBoundary: (command: LocalSessionCommand) => Promise<void>
  readonly #listeners = new Set<(snapshot: ActiveGameSnapshot) => void>()
  #currentIndex = 0
  #roundSerial = 0
  #roundsPlayed = 0
  #bestPoints = 0
  #snapshot: ActiveGameSnapshot

  constructor(
    bundles: readonly LocalQuestionBundle[],
    options: LocalActiveGameSessionOptions = {},
  ) {
    this.#bundles = [...bundles]
    this.#commandBoundary = options.commandBoundary ?? (() => Promise.resolve())
    this.#snapshot = this.#createInitialSnapshot()
  }

  getSnapshot(): ActiveGameSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (snapshot: ActiveGameSnapshot) => void): () => void {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  async submitAnswer(answer: PlayerAnswer): Promise<SubmitOutcome> {
    const snapshot = this.#snapshot

    if (snapshot.phase !== 'answering') {
      return {
        ok: false,
        ...(snapshot.phase === 'revealed' ? { roundId: snapshot.roundId } : {}),
        code: 'not-answering',
        message: 'This round is not accepting answers.',
        retryable: false,
      }
    }

    if (snapshot.submission.status === 'pending' || snapshot.submission.status === 'accepted') {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'already-submitted',
        message: 'An answer is already being submitted for this round.',
        retryable: false,
      }
    }

    if (snapshot.submission.status === 'rejected' && !snapshot.submission.retryable) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: snapshot.submission.code,
        message: snapshot.submission.message,
        retryable: false,
      }
    }

    if (!isAnswerComplete(answer, snapshot.prompt)) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'incomplete-answer',
        message: 'Complete every answer before submitting.',
        retryable: false,
      }
    }

    const submittedAnswer = { ...answer }
    this.#publish({
      ...snapshot,
      submission: { status: 'pending' },
    })

    try {
      await this.#commandBoundary('submit')
      const bundle = this.#requireCurrentBundle()
      const result = scoreAnswer(submittedAnswer, bundle.disclosure.solution)
      this.#roundsPlayed += 1
      this.#bestPoints = Math.max(this.#bestPoints, result.points)
      const progress = this.#createProgress()

      this.#publish({
        phase: 'revealed',
        roundId: snapshot.roundId,
        prompt: bundle.prompt,
        disclosure: bundle.disclosure,
        result,
        progress,
        advance: { status: 'ready' },
        nextLabel: this.#bundles.length > 1 ? 'Next archive' : 'Replay archive',
      })

      return { ok: true, roundId: snapshot.roundId }
    } catch (error) {
      this.#publish({
        ...snapshot,
        submission: submissionUnavailable,
      })

      if (error instanceof LocalSessionUnavailableError) {
        return {
          ok: false,
          roundId: snapshot.roundId,
          code: submissionUnavailable.code,
          message: submissionUnavailable.message,
          retryable: submissionUnavailable.retryable,
        }
      }

      throw error
    }
  }

  async advanceRound(): Promise<AdvanceOutcome> {
    const snapshot = this.#snapshot

    if (snapshot.phase !== 'revealed') {
      return {
        ok: false,
        ...(snapshot.phase === 'answering' ? { roundId: snapshot.roundId } : {}),
        code: 'not-revealed',
        message: 'Reveal the current round before advancing.',
        retryable: false,
      }
    }

    if (snapshot.advance.status === 'pending') {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'already-advancing',
        message: 'The next round is already opening.',
        retryable: false,
      }
    }

    if (snapshot.advance.status === 'rejected' && !snapshot.advance.retryable) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: snapshot.advance.code,
        message: snapshot.advance.message,
        retryable: false,
      }
    }

    this.#publish({
      ...snapshot,
      advance: { status: 'pending' },
    })

    try {
      await this.#commandBoundary('advance')
      this.#currentIndex = (this.#currentIndex + 1) % this.#bundles.length
      const nextSnapshot = this.#createAnsweringSnapshot()
      this.#publish(nextSnapshot)

      return {
        ok: true,
        previousRoundId: snapshot.roundId,
        nextRoundId: nextSnapshot.roundId,
      }
    } catch (error) {
      this.#publish({
        ...snapshot,
        advance: advanceUnavailable,
      })

      if (error instanceof LocalSessionUnavailableError) {
        return {
          ok: false,
          roundId: snapshot.roundId,
          code: advanceUnavailable.code,
          message: advanceUnavailable.message,
          retryable: advanceUnavailable.retryable,
        }
      }

      throw error
    }
  }

  #createInitialSnapshot(): ActiveGameSnapshot {
    if (this.#bundles.length === 0) {
      return {
        phase: 'empty',
        reason: 'no-published-questions',
        progress: {
          roundNumber: 0,
          roundCount: 0,
          roundsPlayed: 0,
          bestPoints: 0,
        },
      }
    }

    return this.#createAnsweringSnapshot()
  }

  #createAnsweringSnapshot(): Extract<ActiveGameSnapshot, { phase: 'answering' }> {
    const bundle = this.#requireCurrentBundle()
    this.#roundSerial += 1

    return {
      phase: 'answering',
      roundId: `local-round-${this.#roundSerial}`,
      prompt: bundle.prompt,
      progress: this.#createProgress(),
      submission: { status: 'editable' },
    }
  }

  #createProgress(): SessionProgress {
    return {
      roundNumber: this.#currentIndex + 1,
      roundCount: this.#bundles.length,
      roundsPlayed: this.#roundsPlayed,
      bestPoints: this.#bestPoints,
    }
  }

  #requireCurrentBundle(): LocalQuestionBundle {
    const bundle = this.#bundles[this.#currentIndex]

    if (!bundle) {
      throw new Error('The local question catalog is unavailable')
    }

    return bundle
  }

  #publish(snapshot: ActiveGameSnapshot): void {
    this.#snapshot = snapshot

    for (const listener of this.#listeners) {
      try {
        listener(snapshot)
      } catch (error) {
        console.error('Active game session listener failed', error)
      }
    }
  }
}
