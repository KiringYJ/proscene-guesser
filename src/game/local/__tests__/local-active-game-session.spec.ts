import { describe, expect, it, vi } from 'vitest'

import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import {
  LocalActiveGameSession,
  LocalSessionUnavailableError,
} from '@/game/local/local-active-game-session'
import { QUICK_PLAY_CONFIG, type SoloGameConfig } from '@/game/solo'
import type { ActiveGameSnapshot } from '@/game/session'
import { createEmptyAnswer, type PlayerAnswer, type QuestionPool } from '@/types/question'

function makeBundle(
  id: string,
  pool: QuestionPool = 'classic',
  gameNumber = 1,
): LocalQuestionBundle {
  return {
    prompt: {
      id,
      pool,
      image: `/questions/${id}.webp`,
      imageAlt: 'A redacted broadcast frame.',
      archiveLabel: `Archive ${id.slice(-1)}`,
      clue: 'Use the visible game state.',
      choices: {
        years: [2024],
        tournaments: ['World Championship'],
        stages: ['Final'],
        teams: [
          { id: 'blue-comets', name: 'Blue Comets' },
          { id: 'red-meteors', name: 'Red Meteors' },
        ],
        games: [gameNumber],
      },
    },
    disclosure: {
      solution: {
        answer: {
          year: 2024,
          tournament: 'World Championship',
          stage: 'Final',
          blueTeamId: 'blue-comets',
          redTeamId: 'red-meteors',
          gameNumber,
        },
      },
      source: {
        label: 'Broadcast archive',
        url: 'https://example.com/match',
      },
    },
  }
}

const firstBundle = makeBundle('q-000000000001', 'classic', 1)
const secondBundle = makeBundle('q-000000000002', 'deep-cut', 2)
const thirdBundle = makeBundle('q-000000000003', 'classic', 3)

function answerFor(bundle: LocalQuestionBundle): PlayerAnswer {
  return {
    ...bundle.disclosure.solution.answer,
    catalogEditionId: bundle.disclosure.solution.catalogEditionId ?? null,
  }
}

function submissionStatus(snapshot: ActiveGameSnapshot): string {
  return snapshot.phase === 'answering' ? snapshot.submission.status : snapshot.phase
}

async function startGame(
  session: LocalActiveGameSession,
  config: SoloGameConfig = QUICK_PLAY_CONFIG,
) {
  await expect(session.startGame(config)).resolves.toMatchObject({ ok: true })
  const snapshot = session.getSnapshot()

  expect(snapshot.phase).toBe('answering')
  if (snapshot.phase !== 'answering') {
    throw new Error('Expected an answering snapshot')
  }

  return snapshot
}

describe('LocalActiveGameSession', () => {
  it('starts in setup and reports playable availability', () => {
    const session = new LocalActiveGameSession([firstBundle, secondBundle, thirdBundle])

    expect(session.getSnapshot()).toEqual({
      phase: 'setup',
      availability: {
        total: 3,
        byPool: {
          classic: 2,
          'deep-cut': 1,
        },
      },
      initialConfig: QUICK_PLAY_CONFIG,
      start: { status: 'ready' },
    })
  })

  it('starts a constrained Quick Play game with unique questions and an absolute deadline', async () => {
    const session = new LocalActiveGameSession([firstBundle, secondBundle, thirdBundle], {
      now: () => 1_000,
      random: () => 0.999,
    })
    const snapshot = await startGame(session)

    expect(snapshot).toMatchObject({
      gameId: 'local-game-1',
      roundId: 'local-round-1',
      prompt: { id: firstBundle.prompt.id },
      plan: {
        config: QUICK_PLAY_CONFIG,
        eligibleQuestionCount: 3,
        roundCount: 3,
        constrainedByAvailability: true,
      },
      progress: {
        roundNumber: 1,
        roundCount: 3,
        roundsPlayed: 0,
        points: 0,
        possiblePoints: 12,
      },
      timer: {
        kind: 'deadline',
        durationSeconds: 90,
        deadlineAt: 91_000,
      },
      submission: { status: 'editable' },
    })
    expect(snapshot).not.toHaveProperty('disclosure')
    expect(snapshot).not.toHaveProperty('result')
  })

  it('reveals and scores one submitted answer while preserving the prompt boundary', async () => {
    const session = new LocalActiveGameSession([firstBundle], { random: () => 0.999 })
    const initial = await startGame(session)
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    const submission = session.submitAnswer(answerFor(firstBundle))

    expect(publications.map(submissionStatus)).toEqual(['pending'])
    await expect(submission).resolves.toEqual({ ok: true, roundId: initial.roundId })
    expect(publications.map(submissionStatus)).toEqual(['pending', 'revealed'])
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      roundId: initial.roundId,
      result: { points: 4, total: 4 },
      completionReason: 'submitted',
      progress: { roundsPlayed: 1, points: 4, possiblePoints: 4 },
      advance: { status: 'ready' },
      nextLabel: 'View results',
    })
  })

  it('advances through a finite game and publishes the cumulative final summary', async () => {
    const session = new LocalActiveGameSession([firstBundle, secondBundle], {
      random: () => 0.999,
    })
    await startGame(session, { pool: 'mixed', rounds: 'all', timerSeconds: 'none' })

    await session.submitAnswer(answerFor(firstBundle))
    await expect(session.advanceRound()).resolves.toMatchObject({
      ok: true,
      destination: 'round',
      nextRoundId: 'local-round-2',
    })

    const secondAnswer = { ...answerFor(secondBundle), year: 2023 }
    await session.submitAnswer(secondAnswer)
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      result: { points: 3, total: 4 },
      progress: { roundNumber: 2, roundsPlayed: 2, points: 7, possiblePoints: 8 },
      nextLabel: 'View results',
    })

    await expect(session.advanceRound()).resolves.toEqual({
      ok: true,
      destination: 'finished',
      previousRoundId: 'local-round-2',
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'finished',
      gameId: 'local-game-1',
      summary: {
        points: 7,
        total: 8,
        rounds: [
          { roundNumber: 1, questionId: firstBundle.prompt.id, result: { points: 4 } },
          { roundNumber: 2, questionId: secondBundle.prompt.id, result: { points: 3 } },
        ],
      },
      start: { status: 'ready' },
    })
  })

  it('locks and scores the current partial answer when a timed round expires', async () => {
    let now = 10_000
    const session = new LocalActiveGameSession([firstBundle], {
      now: () => now,
      random: () => 0.999,
    })
    const initial = await startGame(session, { pool: 'mixed', rounds: 5, timerSeconds: 60 })
    const partialAnswer = { ...createEmptyAnswer(), year: 2024 }

    await expect(session.expireRound(initial.roundId, partialAnswer)).resolves.toMatchObject({
      ok: false,
      code: 'round-not-expired',
    })

    now = 70_000
    await expect(session.expireRound(initial.roundId, partialAnswer)).resolves.toMatchObject({
      ok: true,
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      completionReason: 'timed-out',
      result: {
        points: 1,
        lines: [
          { id: 'year', correct: true },
          { id: 'event', correct: false },
          { id: 'teams', correct: false },
          { id: 'game', correct: false },
        ],
      },
    })
    await expect(session.expireRound(initial.roundId, partialAnswer)).resolves.toMatchObject({
      ok: false,
      code: 'not-answering',
    })
  })

  it('keeps a failed timeout retryable and settles it exactly once on retry', async () => {
    let now = 0
    let expirationAttempts = 0
    const session = new LocalActiveGameSession([firstBundle], {
      now: () => now,
      commandBoundary: async (command) => {
        if (command === 'expire' && expirationAttempts === 0) {
          expirationAttempts += 1
          throw new LocalSessionUnavailableError()
        }
      },
    })
    const initial = await startGame(session, { pool: 'mixed', rounds: 5, timerSeconds: 60 })
    const partialAnswer = { ...createEmptyAnswer(), year: 2024 }
    now = 60_000

    await expect(session.expireRound(initial.roundId, partialAnswer)).resolves.toMatchObject({
      ok: false,
      code: 'temporarily-unavailable',
      retryable: true,
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'answering',
      submission: { status: 'rejected', retryable: true },
    })

    await expect(session.expireRound(initial.roundId, partialAnswer)).resolves.toMatchObject({
      ok: true,
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      completionReason: 'timed-out',
      progress: { roundsPlayed: 1 },
    })
  })

  it('settles a submission received at the deadline as a timeout', async () => {
    let now = 0
    const session = new LocalActiveGameSession([firstBundle], {
      now: () => now,
      random: () => 0.999,
    })
    await startGame(session, { pool: 'mixed', rounds: 5, timerSeconds: 60 })
    now = 60_000

    await expect(session.submitAnswer(answerFor(firstBundle))).resolves.toMatchObject({ ok: true })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      completionReason: 'timed-out',
      result: { points: 4 },
    })
  })

  it('publishes an unlimited timer when No limit is selected', async () => {
    const session = new LocalActiveGameSession([firstBundle])
    const snapshot = await startGame(session, {
      pool: 'classic',
      rounds: 'all',
      timerSeconds: 'none',
    })

    expect(snapshot.timer).toEqual({ kind: 'unlimited' })
  })

  it('rejects an empty selected pool without leaving setup', async () => {
    const session = new LocalActiveGameSession([firstBundle])

    await expect(
      session.startGame({ pool: 'deep-cut', rounds: 5, timerSeconds: 90 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'no-questions-in-pool',
      retryable: false,
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'setup',
      start: { status: 'rejected', code: 'no-questions-in-pool' },
    })
  })

  it('replays with the same config and returns to setup without retaining score', async () => {
    const session = new LocalActiveGameSession([firstBundle])
    const first = await startGame(session, {
      pool: 'classic',
      rounds: 'all',
      timerSeconds: 'none',
    })
    await session.submitAnswer(answerFor(firstBundle))
    await session.advanceRound()
    const finished = session.getSnapshot()

    expect(finished.phase).toBe('finished')
    if (finished.phase !== 'finished') {
      throw new Error('Expected a finished snapshot')
    }

    const replay = await startGame(session, finished.plan.config)
    expect(replay.gameId).not.toBe(first.gameId)
    expect(replay.progress).toMatchObject({ roundsPlayed: 0, points: 0 })

    session.returnToSetup()
    expect(session.getSnapshot()).toMatchObject({
      phase: 'setup',
      initialConfig: finished.plan.config,
      start: { status: 'ready' },
    })
  })

  it('rejects incomplete and reentrant submissions without overwriting pending state', async () => {
    let releaseSubmit: (() => void) | undefined
    const session = new LocalActiveGameSession([firstBundle], {
      commandBoundary: (command) => {
        if (command !== 'submit') {
          return Promise.resolve()
        }

        return new Promise<void>((resolve) => {
          releaseSubmit = resolve
        })
      },
    })
    await startGame(session, { pool: 'mixed', rounds: 5, timerSeconds: 'none' })
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    await expect(
      session.submitAnswer({ ...answerFor(firstBundle), gameNumber: null }),
    ).resolves.toMatchObject({ ok: false, code: 'incomplete-answer' })
    expect(publications).toHaveLength(0)

    const firstSubmission = session.submitAnswer(answerFor(firstBundle))
    expect(publications.map(submissionStatus)).toEqual(['pending'])
    await expect(session.submitAnswer(answerFor(firstBundle))).resolves.toMatchObject({
      ok: false,
      code: 'already-submitted',
    })

    releaseSubmit?.()
    await firstSubmission
    expect(publications.map(submissionStatus)).toEqual(['pending', 'revealed'])
  })

  it('restores retryable command state after an expected local failure', async () => {
    const session = new LocalActiveGameSession([firstBundle], {
      commandBoundary: async (command) => {
        if (command === 'submit') {
          throw new LocalSessionUnavailableError()
        }
      },
    })
    await startGame(session, { pool: 'mixed', rounds: 5, timerSeconds: 'none' })

    await expect(session.submitAnswer(answerFor(firstBundle))).resolves.toMatchObject({
      ok: false,
      code: 'temporarily-unavailable',
      retryable: true,
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'answering',
      submission: {
        status: 'rejected',
        code: 'temporarily-unavailable',
        retryable: true,
      },
    })
  })

  it('keeps command publication consistent when a listener throws', async () => {
    const session = new LocalActiveGameSession([firstBundle])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    session.subscribe(() => {
      throw new Error('listener failed')
    })

    try {
      await expect(session.startGame(QUICK_PLAY_CONFIG)).resolves.toMatchObject({ ok: true })
      await expect(session.submitAnswer(answerFor(firstBundle))).resolves.toMatchObject({ ok: true })
      expect(session.getSnapshot()).toMatchObject({ phase: 'revealed' })
      expect(consoleError).toHaveBeenCalledTimes(4)
    } finally {
      consoleError.mockRestore()
    }
  })
})
