import type {
  PlayerAnswer,
  QuestionPrompt,
  QuestionSolution,
  ScoreCategory,
} from '@/types/question'

export interface ScoreEvaluationLine {
  id: ScoreCategory
  correct: boolean
}

export interface ScoreEvaluation {
  lines: readonly ScoreEvaluationLine[]
  points: number
  total: number
}

export function evaluateAnswer(
  answer: PlayerAnswer,
  solution: QuestionSolution,
): ScoreEvaluation {
  const expected = solution.answer
  const eventCorrect = solution.catalogEditionId
    ? answer.catalogEditionId === solution.catalogEditionId && answer.stage === expected.stage
    : answer.tournament === expected.tournament && answer.stage === expected.stage
  const lines: ScoreEvaluationLine[] = [
    {
      id: 'year',
      correct: answer.year === expected.year,
    },
    {
      id: 'event',
      correct: eventCorrect,
    },
    {
      id: 'teams',
      correct:
        answer.blueTeamId === expected.blueTeamId && answer.redTeamId === expected.redTeamId,
    },
    {
      id: 'game',
      correct: answer.gameNumber === expected.gameNumber,
    },
  ]

  return {
    lines,
    points: lines.filter((line) => line.correct).length,
    total: lines.length,
  }
}

export function isAnswerComplete(answer: PlayerAnswer, prompt: QuestionPrompt): boolean {
  const requiredValues = [
    answer.year,
    answer.tournament,
    answer.stage,
    answer.blueTeamId,
    answer.redTeamId,
    answer.gameNumber,
  ]

  return (
    requiredValues.every((value) => value !== null && value !== '') &&
    (prompt.catalogEditionIds === undefined || answer.catalogEditionId !== null)
  )
}
