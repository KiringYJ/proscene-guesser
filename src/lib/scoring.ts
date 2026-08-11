import { getInternationalEdition } from '@/data/catalog'
import { evaluateAnswer } from '@/game/scoring'
import type {
  PlayerAnswer,
  QuestionSolution,
  QuestionTeamChoice,
  ScoreLine,
  ScoreResult,
} from '@/types/question'

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

export interface ScoreAnswerOptions {
  teamChoices?: readonly QuestionTeamChoice[]
}

function teamName(
  teamId: string | null,
  catalogEditionId: string | null | undefined,
  teamChoices: readonly QuestionTeamChoice[] | undefined,
): string {
  if (teamId === null) {
    return 'No answer'
  }

  if (catalogEditionId) {
    return getInternationalEdition(catalogEditionId).participants.find(
      (participant) => participant.teamId === teamId,
    )?.nameAtEvent ?? teamId
  }

  return teamChoices?.find((team) => team.id === teamId)?.name ?? teamId
}

function teamLabel(
  blueTeamId: string | null,
  redTeamId: string | null,
  catalogEditionId: string | null | undefined,
  teamChoices: readonly QuestionTeamChoice[] | undefined,
): string {
  const blueTeam = teamName(blueTeamId, catalogEditionId, teamChoices)
  const redTeam = teamName(redTeamId, catalogEditionId, teamChoices)

  return `${blueTeam} vs ${redTeam}`
}

export function scoreAnswer(
  answer: PlayerAnswer,
  solution: QuestionSolution,
  options: ScoreAnswerOptions = {},
): ScoreResult {
  const expected = solution.answer
  const evaluation = evaluateAnswer(answer, solution)
  const correctByCategory = new Map(
    evaluation.lines.map((line) => [line.id, line.correct]),
  )
  const lines: ScoreLine[] = [
    {
      id: 'year',
      label: 'Year',
      correct: correctByCategory.get('year') ?? false,
      actual: selected(answer.year),
      expected: selected(expected.year),
    },
    {
      id: 'event',
      label: 'Event',
      correct: correctByCategory.get('event') ?? false,
      actual: eventLabel(answer.tournament, answer.stage, answer.catalogEditionId),
      expected: eventLabel(expected.tournament, expected.stage, solution.catalogEditionId),
    },
    {
      id: 'teams',
      label: 'Teams',
      correct: correctByCategory.get('teams') ?? false,
      actual: teamLabel(
        answer.blueTeamId,
        answer.redTeamId,
        answer.catalogEditionId,
        options.teamChoices,
      ),
      expected: teamLabel(
        expected.blueTeamId,
        expected.redTeamId,
        solution.catalogEditionId,
        options.teamChoices,
      ),
    },
    {
      id: 'game',
      label: 'Game',
      correct: correctByCategory.get('game') ?? false,
      actual: `Game ${selected(answer.gameNumber)}`,
      expected: `Game ${selected(expected.gameNumber)}`,
    },
  ]

  return {
    lines,
    points: evaluation.points,
    total: evaluation.total,
  }
}
