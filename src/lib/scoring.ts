import type {
  PlayerAnswer,
  QuestionAnswer,
  ScoreLine,
  ScoreResult,
} from '@/types/question'

function selected(value: string | number | null): string {
  if (value === null) {
    return 'No answer'
  }

  return String(value)
}

function eventLabel(tournament: string | null, stage: string | null): string {
  return `${selected(tournament)} · ${selected(stage)}`
}

function teamLabel(blueTeam: string | null, redTeam: string | null): string {
  return `${selected(blueTeam)} vs ${selected(redTeam)}`
}

export function scoreAnswer(answer: PlayerAnswer, expected: QuestionAnswer): ScoreResult {
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
      correct: answer.tournament === expected.tournament && answer.stage === expected.stage,
      actual: eventLabel(answer.tournament, answer.stage),
      expected: eventLabel(expected.tournament, expected.stage),
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

export function isAnswerComplete(answer: PlayerAnswer): boolean {
  return Object.values(answer).every((value) => value !== null && value !== '')
}
