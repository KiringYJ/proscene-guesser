import type {
  PlayerAnswer,
  QuestionSolution,
  ScoreLine,
  ScoreResult,
} from '@/types/question'
import { getInternationalEdition } from '@/data/catalog'
import { evaluateAnswer } from '@/game/scoring'

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
  solution: QuestionSolution,
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
      actual: teamLabel(answer.blueTeam, answer.redTeam),
      expected: teamLabel(expected.blueTeam, expected.redTeam),
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
