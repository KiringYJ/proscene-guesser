export interface QuestionAnswer {
  year: number
  tournament: string
  stage: string
  blueTeam: string
  redTeam: string
  gameNumber: number
}

export interface PlayerAnswer {
  year: number | null
  tournament: string | null
  stage: string | null
  blueTeam: string | null
  redTeam: string | null
  gameNumber: number | null
}

export interface QuestionChoices {
  years: readonly number[]
  tournaments: readonly string[]
  stages: readonly string[]
  teams: readonly string[]
  games: readonly number[]
}

export interface QuestionSource {
  label: string
  url: string
}

export interface Question {
  id: string
  image: string
  imageAlt: string
  archiveLabel: string
  clue: string
  answer: QuestionAnswer
  choices: QuestionChoices
  source?: QuestionSource
}

export type ScoreCategory = 'year' | 'event' | 'teams' | 'game'

export interface ScoreLine {
  id: ScoreCategory
  label: string
  correct: boolean
  actual: string
  expected: string
}

export interface ScoreResult {
  lines: readonly ScoreLine[]
  points: number
  total: number
}

export function createEmptyAnswer(): PlayerAnswer {
  return {
    year: null,
    tournament: null,
    stage: null,
    blueTeam: null,
    redTeam: null,
    gameNumber: null,
  }
}
