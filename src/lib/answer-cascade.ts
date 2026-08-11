import type { PlayerAnswer } from '@/types/question'

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
    blueTeam: null,
    redTeam: null,
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
    blueTeam: null,
    redTeam: null,
  }
}

export function excludeOpposingTeam(
  teamNames: readonly string[],
  opposingTeam: string | null,
): readonly string[] {
  return opposingTeam === null
    ? teamNames
    : teamNames.filter((teamName) => teamName !== opposingTeam)
}
