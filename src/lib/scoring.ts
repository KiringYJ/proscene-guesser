import type {
  PlayerAnswer,
  QuestionAnswer,
  ScoreLine,
  ScoreResult,
} from '@/types/question'
import { getInternationalEdition } from '@/data/catalog'

function selected(value: string | number | null): string {
  if (value === null) {
    return 'No answer'
  }

  return String(value)
}

function eventLabel(
  tournament: string | null,
  stage: string | null,
  catalogEditionId?: string | null,
): string {
  const eventName = catalogEditionId
    ? getInternationalEdition(catalogEditionId).name
    : selected(tournament)

  return `${eventName} · ${selected(stage)}`
}

function teamLabel(blueTeam: string | null, redTeam: string | null): string {
  return `${selected(blueTeam)} vs ${selected(redTeam)}`
}

export function scoreAnswer(
  answer: PlayerAnswer,
  expected: QuestionAnswer,
  expectedCatalogEditionId?: string,
): ScoreResult {
  const eventCorrect = expectedCatalogEditionId
    ? answer.catalogEditionId === expectedCatalogEditionId && answer.stage === expected.stage
    : answer.tournament === expected.tournament && answer.stage === expected.stage
  const lines: ScoreLine[] = [
    {
      id: 'year',
      label: 'Year',
      correct: answer.year === expected.year,
      actual: selected(answer.year),
      expected: selected(expected.year),
    },
    {
      id: 'event',
      label: 'Event',
      correct: eventCorrect,
      actual: eventLabel(answer.tournament, answer.stage, answer.catalogEditionId),
      expected: eventLabel(expected.tournament, expected.stage, expectedCatalogEditionId),
    },
    {
      id: 'teams',
      label: 'Teams',
      correct: answer.blueTeam === expected.blueTeam && answer.redTeam === expected.redTeam,
      actual: teamLabel(answer.blueTeam, answer.redTeam),
      expected: teamLabel(expected.blueTeam, expected.redTeam),
    },
    {
      id: 'game',
      label: 'Game',
      correct: answer.gameNumber === expected.gameNumber,
      actual: `Game ${selected(answer.gameNumber)}`,
      expected: `Game ${selected(expected.gameNumber)}`,
    },
  ]

  return {
    lines,
    points: lines.filter((line) => line.correct).length,
    total: lines.length,
  }
}

export function isAnswerComplete(
  answer: PlayerAnswer,
  requireCatalogEditionId = false,
): boolean {
  const requiredValues = [
    answer.year,
    answer.tournament,
    answer.stage,
    answer.blueTeam,
    answer.redTeam,
    answer.gameNumber,
  ]

  return (
    requiredValues.every((value) => value !== null && value !== '') &&
    (!requireCatalogEditionId || answer.catalogEditionId !== null)
  )
}
