import { describe, expect, it } from 'vitest'

import { isAnswerComplete, scoreAnswer } from '@/lib/scoring'
import { buildShareText } from '@/lib/share'
import type { PlayerAnswer, QuestionAnswer } from '@/types/question'

const expected: QuestionAnswer = {
  year: 2024,
  tournament: 'World Championship',
  stage: 'Semifinal',
  blueTeam: 'Blue Comets',
  redTeam: 'Crimson Foxes',
  gameNumber: 3,
}

const perfectAnswer: PlayerAnswer = { ...expected, catalogEditionId: null }

describe('scoreAnswer', () => {
  it('awards one point for each of the four game dimensions', () => {
    const result = scoreAnswer(perfectAnswer, expected)

    expect(result.points).toBe(4)
    expect(result.total).toBe(4)
    expect(result.lines.every((line) => line.correct)).toBe(true)
  })

  it('treats event and side-specific teams as grouped dimensions', () => {
    const result = scoreAnswer(
      {
        ...perfectAnswer,
        stage: 'Final',
        blueTeam: expected.redTeam,
        redTeam: expected.blueTeam,
      },
      expected,
    )

    expect(result.points).toBe(2)
    expect(result.lines.find((line) => line.id === 'event')?.correct).toBe(false)
    expect(result.lines.find((line) => line.id === 'teams')?.correct).toBe(false)
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
        ...expected,
        tournament: 'Rift Rivals',
        stage: 'Group Stage',
      },
      'rift-rivals-lck-lpl-lms-2018',
    )

    expect(result.lines.find((line) => line.id === 'event')?.correct).toBe(false)
    expect(result.lines.find((line) => line.id === 'event')?.actual).toContain('NA vs EU')
  })
})

describe('isAnswerComplete', () => {
  it('rejects an unanswered field', () => {
    expect(isAnswerComplete({ ...perfectAnswer, gameNumber: null })).toBe(false)
  })

  it('accepts a fully selected answer', () => {
    expect(isAnswerComplete(perfectAnswer)).toBe(true)
  })

  it('requires an edition ID only for catalog-backed questions', () => {
    expect(isAnswerComplete(perfectAnswer, true)).toBe(false)
    expect(
      isAnswerComplete({ ...perfectAnswer, catalogEditionId: 'worlds-2024' }, true),
    ).toBe(true)
  })
})

describe('buildShareText', () => {
  it('shares only the score pattern, not the hidden answer', () => {
    const text = buildShareText('q-7m4k2d9xrp6v', scoreAnswer(perfectAnswer, expected))

    expect(text).toContain('🟩🟩🟩🟩 4/4')
    expect(text).not.toContain(expected.blueTeam)
    expect(text).not.toContain(expected.tournament)
  })
})
