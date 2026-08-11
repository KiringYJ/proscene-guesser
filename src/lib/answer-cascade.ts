import type { PlayerAnswer, QuestionTeamChoice } from '@/types/question'

export function applyYearSelection(
  answer: PlayerAnswer,
  year: number | null,
  catalogBacked: boolean,
): PlayerAnswer {
  if (!catalogBacked || year === answer.year) {
    return { ...answer, year }
  }

  return {
    ...answer,
    year,
    catalogEditionId: null,
    tournament: null,
    stage: null,
    blueTeamId: null,
    redTeamId: null,
  }
}

export function applyCatalogEditionSelection(
  answer: PlayerAnswer,
  catalogEditionId: string | null,
  tournament: string | null,
): PlayerAnswer {
  if (catalogEditionId === answer.catalogEditionId) {
    return answer
  }

  return {
    ...answer,
    catalogEditionId,
    tournament,
    stage: null,
    blueTeamId: null,
    redTeamId: null,
  }
}

export function excludeOpposingTeam(
  teams: readonly QuestionTeamChoice[],
  opposingTeamId: string | null,
): readonly QuestionTeamChoice[] {
  return opposingTeamId === null
    ? teams
    : teams.filter((team) => team.id !== opposingTeamId)
}
