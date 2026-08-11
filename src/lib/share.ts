import type { ScoreResult } from '@/types/question'

export function buildShareText(
  questionId: string,
  result: ScoreResult,
  siteUrl?: string,
): string {
  const squares = result.lines.map((line) => (line.correct ? '🟩' : '⬛')).join('')
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
