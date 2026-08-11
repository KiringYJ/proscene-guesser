import type { SoloGamePlan, SoloGameSummary } from '@/game/solo'
import type { ScoreResult } from '@/types/question'

function resultSquares(result: ScoreResult): string {
  return result.lines.map((line) => (line.correct ? '🟩' : '⬛')).join('')
}

export function buildShareText(
  questionId: string,
  result: ScoreResult,
  siteUrl?: string,
): string {
  const squares = resultSquares(result)
  const lines = [
    `ProScene Guesser · ${questionId.toUpperCase()}`,
    `${squares} ${result.points}/${result.total}`,
    'Year · Event · Teams · Game',
  ]

  if (siteUrl) {
    lines.push(siteUrl)
  }

  return lines.join('\n')
}

export function buildGameShareText(
  summary: SoloGameSummary,
  plan: SoloGamePlan,
  siteUrl?: string,
): string {
  const timerLabel = plan.config.timerSeconds === 'none'
    ? 'No limit'
    : `${plan.config.timerSeconds}s`
  const archiveLabel = `${plan.roundCount} ${plan.roundCount === 1 ? 'archive' : 'archives'}`
  const lines = [
    `ProScene Guesser · ${summary.points}/${summary.total}`,
    ...summary.rounds.map((round) => {
      const timeoutLabel = round.completionReason === 'timed-out' ? ' · timed out' : ''

      return `R${round.roundNumber} ${resultSquares(round.result)} ${round.result.points}/${round.result.total}${timeoutLabel}`
    }),
    `${archiveLabel} · ${timerLabel}`,
    'Year · Event · Teams · Game',
  ]

  if (siteUrl) {
    lines.push(siteUrl)
  }

  return lines.join('\n')
}
