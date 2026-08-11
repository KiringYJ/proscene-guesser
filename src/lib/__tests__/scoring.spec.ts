import { describe, expect, it } from 'vitest'

import { evaluateAnswer, isAnswerComplete } from '@/game/scoring'
import type { SoloGamePlan, SoloGameSummary } from '@/game/solo'
import { scoreAnswer } from '@/lib/scoring'
import { buildGameShareText, buildShareText } from '@/lib/share'
import type {
  PlayerAnswer,
  QuestionAnswer,
  QuestionPrompt,
  QuestionSolution,
  QuestionTeamChoice,
} from '@/types/question'

const teamChoices: readonly QuestionTeamChoice[] = [
  { id: 'blue-comets', name: 'Blue Comets' },
  { id: 'crimson-foxes', name: 'Crimson Foxes' },
]

const expected: QuestionAnswer = {
  year: 2024,
  tournament: 'World Championship',
  stage: 'Semifinal',
  blueTeamId: 'blue-comets',
  redTeamId: 'crimson-foxes',
  gameNumber: 3,
}

const perfectAnswer: PlayerAnswer = { ...expected, catalogEditionId: null }
const solution: QuestionSolution = { answer: expected }
const prompt: QuestionPrompt = {
  id: 'q-7m4k2d9xrp6v',
  pool: 'classic',
  image: '/questions/q-7m4k2d9xrp6v.webp',
  imageAlt: 'A redacted broadcast frame.',
  archiveLabel: 'Archive',
  clue: 'Use the visible game state.',
  choices: {
    years: [2024],
    tournaments: ['World Championship'],
    stages: ['Semifinal'],
    teams: teamChoices,
    games: [3],
  },
}

describe('scoreAnswer', () => {
  it('awards one point for each of the four game dimensions', () => {
    const evaluation = evaluateAnswer(perfectAnswer, solution)
    const result = scoreAnswer(perfectAnswer, solution, { teamChoices })

    expect(evaluation.points).toBe(4)
    expect(result.points).toBe(4)
    expect(result.total).toBe(4)
    expect(result.lines.every((line) => line.correct)).toBe(true)
    expect(result.lines.find((line) => line.id === 'teams')?.expected).toBe(
      'Blue Comets vs Crimson Foxes',
    )
  })

  it('treats event and side-specific teams as grouped dimensions', () => {
    const result = scoreAnswer(
      {
        ...perfectAnswer,
        stage: 'Final',
        blueTeamId: expected.redTeamId,
        redTeamId: expected.blueTeamId,
      },
      solution,
      { teamChoices },
    )

    expect(result.points).toBe(2)
    expect(result.lines.find((line) => line.id === 'event')?.correct).toBe(false)
    expect(result.lines.find((line) => line.id === 'teams')?.correct).toBe(false)
  })

  it('awards the event point when the tournament and stage are right but the year is wrong', () => {
    const result = scoreAnswer(
      {
        ...perfectAnswer,
        year: 2023,
        catalogEditionId: 'worlds-2023',
      },
      {
        ...solution,
        catalogEditionId: 'worlds-2024',
      },
      { teamChoices },
    )

    expect(result.points).toBe(3)
    expect(result.lines.find((line) => line.id === 'year')?.correct).toBe(false)
    expect(result.lines.find((line) => line.id === 'event')?.correct).toBe(true)
  })

  it('distinguishes same-series editions by their stable catalog ID', () => {
    const result = scoreAnswer(
      {
        ...perfectAnswer,
        catalogEditionId: 'rift-rivals-na-eu-2018',
        tournament: 'Rift Rivals',
        stage: 'Group Stage',
      },
      {
        answer: {
          ...expected,
          tournament: 'Rift Rivals',
          stage: 'Group Stage',
        },
        catalogEditionId: 'rift-rivals-lck-lpl-lms-2018',
      },
      { teamChoices },
    )

    expect(result.lines.find((line) => line.id === 'event')?.correct).toBe(false)
    expect(result.lines.find((line) => line.id === 'event')?.actual).toContain('NA vs EU')
  })
})

describe('isAnswerComplete', () => {
  it('rejects an unanswered field', () => {
    expect(isAnswerComplete({ ...perfectAnswer, gameNumber: null }, prompt)).toBe(false)
  })

  it('accepts a fully selected answer', () => {
    expect(isAnswerComplete(perfectAnswer, prompt)).toBe(true)
  })

  it('requires an edition ID only for catalog-backed questions', () => {
    const catalogPrompt = {
      ...prompt,
      catalogEditionIds: ['worlds-2024'],
    }

    expect(isAnswerComplete(perfectAnswer, catalogPrompt)).toBe(false)
    expect(
      isAnswerComplete(
        { ...perfectAnswer, catalogEditionId: 'worlds-2024' },
        catalogPrompt,
      ),
    ).toBe(true)
  })
})

describe('buildShareText', () => {
  it('shares only the score pattern, not the hidden answer', () => {
    const text = buildShareText(
      'q-7m4k2d9xrp6v',
      scoreAnswer(perfectAnswer, solution, { teamChoices }),
    )

    expect(text).toContain('🟩🟩🟩🟩 4/4')
    expect(text).not.toContain('Blue Comets')
    expect(text).not.toContain(expected.tournament)
  })

  it('shares a complete game breakdown without revealing answers', () => {
    const perfectResult = scoreAnswer(perfectAnswer, solution, { teamChoices })
    const imperfectResult = scoreAnswer(
      { ...perfectAnswer, year: 2023 },
      solution,
      { teamChoices },
    )
    const plan: SoloGamePlan = {
      config: { pool: 'mixed', rounds: 5, timerSeconds: 90 },
      eligibleQuestionCount: 2,
      roundCount: 2,
      constrainedByAvailability: true,
    }
    const summary: SoloGameSummary = {
      points: 7,
      total: 8,
      rounds: [
        {
          roundNumber: 1,
          roundId: 'round-1',
          questionId: 'q-000000000001',
          archiveLabel: 'Archive 1',
          pool: 'classic',
          result: perfectResult,
          completionReason: 'submitted',
        },
        {
          roundNumber: 2,
          roundId: 'round-2',
          questionId: 'q-000000000002',
          archiveLabel: 'Archive 2',
          pool: 'deep-cut',
          result: imperfectResult,
          completionReason: 'timed-out',
        },
      ],
    }

    const text = buildGameShareText(summary, plan, 'https://example.com/play')

    expect(text).toContain('ProScene Guesser · 7/8')
    expect(text).toContain('R1 🟩🟩🟩🟩 4/4')
    expect(text).toContain('R2 ⬛🟩🟩🟩 3/4 · timed out')
    expect(text).toContain('Mixed · 2 archives · 90s')
    expect(text).toContain('https://example.com/play')
    expect(text).not.toContain('Blue Comets')
    expect(text).not.toContain(expected.tournament)
  })
})
