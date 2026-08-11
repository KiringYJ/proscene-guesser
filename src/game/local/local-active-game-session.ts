import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import {
  assertUniqueQuestionIds,
  createSoloGameSelection,
  getSoloGameAvailability,
} from '@/game/local/solo-game-selection'
import { isAnswerComplete } from '@/game/scoring'
import {
  isSoloGameConfig,
  QUICK_PLAY_CONFIG,
  type RoundCompletionReason,
  type SoloGameConfig,
  type SoloGamePlan,
  type SoloRoundSummary,
} from '@/game/solo'
import type {
  ActiveGameSessionPort,
  ActiveGameSnapshot,
  AdvanceOutcome,
  RoundTimer,
  SessionProgress,
  StartOutcome,
  StartState,
  SubmitOutcome,
} from '@/game/session'
import { scoreAnswer } from '@/lib/scoring'
import type { PlayerAnswer } from '@/types/question'

export type LocalSessionCommand = 'start' | 'submit' | 'expire' | 'advance'

export interface LocalActiveGameSessionOptions {
  commandBoundary?: (command: LocalSessionCommand) => Promise<void>
  now?: () => number
  random?: () => number
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
  message: 'The next phase could not be opened. Try again.',
  retryable: true,
} as const

const startUnavailable = {
  status: 'rejected',
  code: 'temporarily-unavailable',
  message: 'The game could not be started. Try again.',
  retryable: true,
} as const

type StartableSnapshot = Extract<ActiveGameSnapshot, { phase: 'setup' | 'finished' }>
type AnsweringSnapshot = Extract<ActiveGameSnapshot, { phase: 'answering' }>

export class LocalActiveGameSession implements ActiveGameSessionPort {
  readonly #catalog: readonly LocalQuestionBundle[]
  readonly #availability
  readonly #commandBoundary: (command: LocalSessionCommand) => Promise<void>
  readonly #now: () => number
  readonly #random: () => number
  readonly #listeners = new Set<(snapshot: ActiveGameSnapshot) => void>()
  #selectedBundles: readonly LocalQuestionBundle[] = []
  #currentIndex = 0
  #history: SoloRoundSummary[] = []
  #points = 0
  #gameSerial = 0
  #roundSerial = 0
  #gameId: string | null = null
  #plan: SoloGamePlan | null = null
  #lastConfig: SoloGameConfig = { ...QUICK_PLAY_CONFIG }
  #snapshot: ActiveGameSnapshot

  constructor(
    bundles: readonly LocalQuestionBundle[],
    options: LocalActiveGameSessionOptions = {},
  ) {
    this.#catalog = [...bundles]
    assertUniqueQuestionIds(this.#catalog)
    this.#availability = getSoloGameAvailability(this.#catalog)
    this.#commandBoundary = options.commandBoundary ?? (() => Promise.resolve())
    this.#now = options.now ?? Date.now
    this.#random = options.random ?? Math.random
    this.#snapshot = this.#createSetupSnapshot()
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

  async startGame(config: SoloGameConfig): Promise<StartOutcome> {
    const snapshot = this.#snapshot

    if (snapshot.phase !== 'setup' && snapshot.phase !== 'finished') {
      return {
        ok: false,
        code: 'not-startable',
        message: 'Finish the current game before starting another.',
        retryable: false,
      }
    }

    if (snapshot.start.status === 'pending') {
      return {
        ok: false,
        code: 'already-starting',
        message: 'A game is already starting.',
        retryable: false,
      }
    }

    if (!isSoloGameConfig(config)) {
      const start = {
        status: 'rejected',
        code: 'invalid-config',
        message: 'Choose a valid round count and timer.',
        retryable: false,
      } as const
      this.#publish(this.#withStartState(snapshot, start))

      return { ok: false, ...start }
    }

    const selection = createSoloGameSelection(this.#catalog, config, this.#random)

    if (selection.bundles.length === 0) {
      const start = {
        status: 'rejected',
        code: 'no-questions',
        message: 'No playable archives are available yet.',
        retryable: false,
      } as const
      this.#publish(this.#withStartState(snapshot, start))

      return { ok: false, ...start }
    }

    this.#publish(this.#withStartState(snapshot, { status: 'pending' }))

    try {
      await this.#commandBoundary('start')
      this.#selectedBundles = selection.bundles
      this.#currentIndex = 0
      this.#history = []
      this.#points = 0
      this.#gameSerial += 1
      this.#gameId = `local-game-${this.#gameSerial}`
      this.#plan = selection.plan
      this.#lastConfig = { ...selection.plan.config }
      const nextSnapshot = this.#createAnsweringSnapshot()
      this.#publish(nextSnapshot)

      return {
        ok: true,
        gameId: nextSnapshot.gameId,
        roundCount: selection.plan.roundCount,
        constrainedByAvailability: selection.plan.constrainedByAvailability,
      }
    } catch (error) {
      this.#publish(this.#withStartState(snapshot, startUnavailable))

      if (error instanceof LocalSessionUnavailableError) {
        return { ok: false, ...startUnavailable }
      }

      throw error
    }
  }

  async submitAnswer(answer: PlayerAnswer): Promise<SubmitOutcome> {
    const snapshot = this.#snapshot

    if (snapshot.phase !== 'answering') {
      return this.#notAnsweringOutcome(snapshot)
    }

    if (snapshot.submission.status === 'pending') {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'already-submitted',
        message: 'An answer is already being submitted for this round.',
        retryable: false,
      }
    }

    const timedOut =
      snapshot.timer.kind === 'deadline' && this.#now() >= snapshot.timer.deadlineAt

    if (!timedOut && !isAnswerComplete(answer, snapshot.prompt)) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'incomplete-answer',
        message: 'Complete every answer before submitting.',
        retryable: false,
      }
    }

    return this.#settleRound(snapshot, answer, timedOut ? 'timed-out' : 'submitted')
  }

  async expireRound(roundId: string, answer: PlayerAnswer): Promise<SubmitOutcome> {
    const snapshot = this.#snapshot

    if (snapshot.phase !== 'answering') {
      return this.#notAnsweringOutcome(snapshot)
    }

    if (snapshot.roundId !== roundId) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'stale-round',
        message: 'That timer belongs to an earlier round.',
        retryable: false,
      }
    }

    if (snapshot.submission.status === 'pending') {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'already-submitted',
        message: 'An answer is already being submitted for this round.',
        retryable: false,
      }
    }

    if (snapshot.timer.kind === 'unlimited' || this.#now() < snapshot.timer.deadlineAt) {
      return {
        ok: false,
        roundId: snapshot.roundId,
        code: 'round-not-expired',
        message: 'This round still has time remaining.',
        retryable: false,
      }
    }

    return this.#settleRound(snapshot, answer, 'timed-out')
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
        message: 'The next phase is already opening.',
        retryable: false,
      }
    }

    this.#publish({
      ...snapshot,
      advance: { status: 'pending' },
    })

    try {
      await this.#commandBoundary('advance')

      if (this.#currentIndex + 1 >= this.#selectedBundles.length) {
        this.#publish(this.#createFinishedSnapshot())

        return {
          ok: true,
          destination: 'finished',
          previousRoundId: snapshot.roundId,
        }
      }

      this.#currentIndex += 1
      const nextSnapshot = this.#createAnsweringSnapshot()
      this.#publish(nextSnapshot)

      return {
        ok: true,
        destination: 'round',
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

  returnToSetup(): void {
    const config = this.#plan?.config ?? this.#lastConfig
    this.#selectedBundles = []
    this.#currentIndex = 0
    this.#history = []
    this.#points = 0
    this.#gameId = null
    this.#plan = null
    this.#lastConfig = { ...config }
    this.#publish(this.#createSetupSnapshot())
  }

  async #settleRound(
    snapshot: AnsweringSnapshot,
    answer: PlayerAnswer,
    completionReason: RoundCompletionReason,
  ): Promise<SubmitOutcome> {
    const submittedAnswer = { ...answer }
    this.#publish({
      ...snapshot,
      submission: { status: 'pending' },
    })

    try {
      await this.#commandBoundary(completionReason === 'timed-out' ? 'expire' : 'submit')
      const bundle = this.#requireCurrentBundle()
      const result = scoreAnswer(submittedAnswer, bundle.disclosure.solution, {
        teamChoices: bundle.prompt.choices.teams,
      })
      const roundSummary: SoloRoundSummary = {
        roundNumber: this.#currentIndex + 1,
        roundId: snapshot.roundId,
        questionId: bundle.prompt.id,
        archiveLabel: bundle.prompt.archiveLabel,
        result,
        completionReason,
      }

      this.#history = [...this.#history, roundSummary]
      this.#points += result.points
      const progress = this.#createProgress()

      this.#publish({
        phase: 'revealed',
        gameId: snapshot.gameId,
        roundId: snapshot.roundId,
        prompt: bundle.prompt,
        disclosure: bundle.disclosure,
        result,
        completionReason,
        plan: this.#requirePlan(),
        progress,
        advance: { status: 'ready' },
        nextLabel:
          this.#currentIndex + 1 >= this.#selectedBundles.length
            ? 'View results'
            : 'Next archive',
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

  #createSetupSnapshot(start: StartState = { status: 'ready' }): ActiveGameSnapshot {
    return {
      phase: 'setup',
      availability: this.#availability,
      initialConfig: { ...this.#lastConfig },
      start,
    }
  }

  #createAnsweringSnapshot(): AnsweringSnapshot {
    const bundle = this.#requireCurrentBundle()
    const plan = this.#requirePlan()
    const gameId = this.#requireGameId()
    this.#roundSerial += 1

    return {
      phase: 'answering',
      gameId,
      roundId: `local-round-${this.#roundSerial}`,
      prompt: bundle.prompt,
      plan,
      progress: this.#createProgress(),
      timer: this.#createRoundTimer(plan.config),
      submission: { status: 'editable' },
    }
  }

  #createFinishedSnapshot(start: StartState = { status: 'ready' }): ActiveGameSnapshot {
    const plan = this.#requirePlan()

    return {
      phase: 'finished',
      gameId: this.#requireGameId(),
      plan,
      summary: {
        points: this.#points,
        total: plan.roundCount * 4,
        rounds: [...this.#history],
      },
      availability: this.#availability,
      start,
    }
  }

  #createProgress(): SessionProgress {
    const plan = this.#requirePlan()

    return {
      roundNumber: this.#currentIndex + 1,
      roundCount: plan.roundCount,
      roundsPlayed: this.#history.length,
      points: this.#points,
      possiblePoints: plan.roundCount * 4,
    }
  }

  #createRoundTimer(config: SoloGameConfig): RoundTimer {
    if (config.timerSeconds === 'none') {
      return { kind: 'unlimited' }
    }

    return {
      kind: 'deadline',
      durationSeconds: config.timerSeconds,
      deadlineAt: this.#now() + config.timerSeconds * 1_000,
    }
  }

  #withStartState(snapshot: StartableSnapshot, start: StartState): StartableSnapshot {
    return { ...snapshot, start }
  }

  #notAnsweringOutcome(snapshot: ActiveGameSnapshot): SubmitOutcome {
    return {
      ok: false,
      ...(snapshot.phase === 'revealed' ? { roundId: snapshot.roundId } : {}),
      code: 'not-answering',
      message: 'This round is not accepting answers.',
      retryable: false,
    }
  }

  #requireCurrentBundle(): LocalQuestionBundle {
    const bundle = this.#selectedBundles[this.#currentIndex]

    if (!bundle) {
      throw new Error('The selected solo game is unavailable')
    }

    return bundle
  }

  #requirePlan(): SoloGamePlan {
    if (!this.#plan) {
      throw new Error('The solo game plan is unavailable')
    }

    return this.#plan
  }

  #requireGameId(): string {
    if (!this.#gameId) {
      throw new Error('The solo game identity is unavailable')
    }

    return this.#gameId
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
