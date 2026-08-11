import { describe, expect, it, vi } from 'vitest'

import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import {
  LocalActiveGameSession,
  LocalSessionUnavailableError,
} from '@/game/local/local-active-game-session'
import type { ActiveGameSnapshot } from '@/game/session'
import type { PlayerAnswer } from '@/types/question'

const bundle: LocalQuestionBundle = {
  prompt: {
    id: 'q-7m4k2d9xrp6v',
    pool: 'classic',
    image: '/questions/q-7m4k2d9xrp6v.webp',
    imageAlt: 'A redacted broadcast frame.',
    archiveLabel: 'Archive',
    clue: 'Use the visible game state.',
    choices: {
      years: [2024],
      tournaments: ['World Championship'],
      stages: ['Final'],
      teams: ['Blue Comets', 'Red Meteors'],
      games: [3],
    },
  },
  disclosure: {
    solution: {
      answer: {
        year: 2024,
        tournament: 'World Championship',
        stage: 'Final',
        blueTeam: 'Blue Comets',
        redTeam: 'Red Meteors',
        gameNumber: 3,
      },
    },
    source: {
      label: 'Broadcast archive',
      url: 'https://example.com/match',
    },
  },
}

const completeAnswer: PlayerAnswer = {
  ...bundle.disclosure.solution.answer,
  catalogEditionId: null,
}

function submissionStatus(snapshot: ActiveGameSnapshot): string {
  return snapshot.phase === 'answering' ? snapshot.submission.status : snapshot.phase
}

describe('LocalActiveGameSession', () => {
  it('publishes an explicit empty state for an empty catalog', () => {
    const session = new LocalActiveGameSession([])

    expect(session.getSnapshot()).toEqual({
      phase: 'empty',
      reason: 'no-published-questions',
      progress: {
        roundNumber: 0,
        roundCount: 0,
        roundsPlayed: 0,
        bestPoints: 0,
      },
    })
  })

  it('exposes only the prompt before submission, then reveals and scores authoritatively', async () => {
    const session = new LocalActiveGameSession([bundle])
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))
    const initial = session.getSnapshot()

    expect(initial.phase).toBe('answering')
    expect(initial).not.toHaveProperty('disclosure')
    expect(initial).not.toHaveProperty('result')

    const submission = session.submitAnswer(completeAnswer)

    expect(publications.map(submissionStatus)).toEqual(['pending'])
    await expect(submission).resolves.toEqual({ ok: true, roundId: 'local-round-1' })
    expect(publications.map(submissionStatus)).toEqual(['pending', 'revealed'])
    expect(session.getSnapshot()).toMatchObject({
      phase: 'revealed',
      roundId: 'local-round-1',
      result: { points: 4, total: 4 },
      progress: { roundsPlayed: 1, bestPoints: 4 },
      advance: { status: 'ready' },
      nextLabel: 'Replay archive',
    })
  })

  it('rejects incomplete and reentrant submissions without publishing over pending state', async () => {
    const session = new LocalActiveGameSession([bundle])
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    await expect(
      session.submitAnswer({ ...completeAnswer, gameNumber: null }),
    ).resolves.toMatchObject({ ok: false, code: 'incomplete-answer' })
    expect(publications).toHaveLength(0)

    const firstSubmission = session.submitAnswer(completeAnswer)
    expect(publications.map(submissionStatus)).toEqual(['pending'])

    const secondSubmission = session.submitAnswer(completeAnswer)
    expect(publications.map(submissionStatus)).toEqual(['pending'])
    await expect(secondSubmission).resolves.toMatchObject({
      ok: false,
      code: 'already-submitted',
    })

    await firstSubmission
    expect(publications.map(submissionStatus)).toEqual(['pending', 'revealed'])
  })

  it('publishes advance acknowledgment and assigns a new round ID on one-question replay', async () => {
    const session = new LocalActiveGameSession([bundle])
    await session.submitAnswer(completeAnswer)
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    const advance = session.advanceRound()
    expect(publications).toHaveLength(1)
    expect(publications[0]).toMatchObject({
      phase: 'revealed',
      roundId: 'local-round-1',
      advance: { status: 'pending' },
    })

    const secondAdvance = session.advanceRound()
    expect(publications).toHaveLength(1)
    await expect(secondAdvance).resolves.toMatchObject({
      ok: false,
      code: 'already-advancing',
    })

    await expect(advance).resolves.toEqual({
      ok: true,
      previousRoundId: 'local-round-1',
      nextRoundId: 'local-round-2',
    })
    expect(session.getSnapshot()).toMatchObject({
      phase: 'answering',
      roundId: 'local-round-2',
      progress: { roundNumber: 1, roundCount: 1, roundsPlayed: 1, bestPoints: 4 },
      submission: { status: 'editable' },
    })
  })

  it('stops notifying an unsubscribed listener', async () => {
    const session = new LocalActiveGameSession([bundle])
    const publications: ActiveGameSnapshot[] = []
    const unsubscribe = session.subscribe((snapshot) => publications.push(snapshot))
    unsubscribe()

    await session.submitAnswer(completeAnswer)

    expect(publications).toHaveLength(0)
  })

  it('keeps command publication consistent when a listener throws', async () => {
    const session = new LocalActiveGameSession([bundle])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    session.subscribe(() => {
      throw new Error('listener failed')
    })

    try {
      await expect(session.submitAnswer(completeAnswer)).resolves.toMatchObject({ ok: true })
      expect(session.getSnapshot()).toMatchObject({ phase: 'revealed' })
      expect(consoleError).toHaveBeenCalledTimes(2)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('resolves a typed retryable rejection for an expected submission failure', async () => {
    const session = new LocalActiveGameSession([bundle], {
      commandBoundary: async (command) => {
        if (command === 'submit') {
          throw new LocalSessionUnavailableError()
        }
      },
    })
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    const submission = session.submitAnswer(completeAnswer)
    expect(publications.map(submissionStatus)).toEqual(['pending'])
    await expect(submission).resolves.toMatchObject({
      ok: false,
      code: 'temporarily-unavailable',
      retryable: true,
    })
    expect(publications.map(submissionStatus)).toEqual(['pending', 'rejected'])
  })

  it('resolves a typed retryable rejection for an expected advance failure', async () => {
    const session = new LocalActiveGameSession([bundle], {
      commandBoundary: async (command) => {
        if (command === 'advance') {
          throw new LocalSessionUnavailableError()
        }
      },
    })
    await session.submitAnswer(completeAnswer)
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    const advance = session.advanceRound()
    expect(publications).toHaveLength(1)
    await expect(advance).resolves.toMatchObject({
      ok: false,
      code: 'temporarily-unavailable',
      retryable: true,
    })
    expect(publications).toHaveLength(2)
    expect(publications[1]).toMatchObject({
      phase: 'revealed',
      advance: {
        status: 'rejected',
        code: 'temporarily-unavailable',
        retryable: true,
      },
    })
  })

  it('restores a retryable answering state before an unexpected scoring rejection', async () => {
    const brokenBundle: LocalQuestionBundle = {
      ...bundle,
      prompt: {
        ...bundle.prompt,
        catalogEditionIds: ['missing-edition'],
      },
      disclosure: {
        ...bundle.disclosure,
        solution: {
          ...bundle.disclosure.solution,
          catalogEditionId: 'missing-edition',
        },
      },
    }
    const session = new LocalActiveGameSession([brokenBundle])
    const answer = { ...completeAnswer, catalogEditionId: 'missing-edition' }
    const publications: ActiveGameSnapshot[] = []
    session.subscribe((snapshot) => publications.push(snapshot))

    await expect(session.submitAnswer(answer)).rejects.toThrow(
      'Unknown international edition: missing-edition',
    )
    expect(publications.map(submissionStatus)).toEqual(['pending', 'rejected'])
    expect(session.getSnapshot()).toMatchObject({
      phase: 'answering',
      submission: {
        status: 'rejected',
        code: 'temporarily-unavailable',
        retryable: true,
      },
    })
  })
})
