export const QUESTION_POOLS = ['classic', 'deep-cut'] as const

export type QuestionPool = (typeof QUESTION_POOLS)[number]

export interface QuestionTeamChoice {
  id: string
  name: string
}

export interface QuestionAnswer {
  year: number
  tournament: string
  stage: string
  blueTeamId: string
  redTeamId: string
  gameNumber: number
}

export interface PlayerAnswer {
  year: number | null
  catalogEditionId: string | null
  tournament: string | null
  stage: string | null
  blueTeamId: string | null
  redTeamId: string | null
  gameNumber: number | null
}

export interface QuestionChoices {
  years: readonly number[]
  tournaments: readonly string[]
  stages: readonly string[]
  teams: readonly QuestionTeamChoice[]
  games: readonly number[]
}

export interface QuestionSource {
  label: string
  url: string
}

export interface QuestionPrompt {
  id: string
  pool: QuestionPool
  image: string
  imageAlt: string
  archiveLabel: string
  clue: string
  choices: QuestionChoices
  catalogEditionIds?: readonly string[]
}

export interface QuestionSolution {
  answer: QuestionAnswer
  catalogEditionId?: string
}

export interface RevealDisclosure {
  solution: QuestionSolution
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
    catalogEditionId: null,
    tournament: null,
    stage: null,
    blueTeamId: null,
    redTeamId: null,
    gameNumber: null,
  }
}
