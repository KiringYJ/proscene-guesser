import type { ScoreResult } from '@/types/question'

export const SOLO_GAME_ROUND_OPTIONS = [5, 10, 'all'] as const
export const SOLO_GAME_TIMER_OPTIONS = [60, 90, 120, 'none'] as const

export type SoloGameRoundOption = (typeof SOLO_GAME_ROUND_OPTIONS)[number]
export type SoloGameTimerSeconds = (typeof SOLO_GAME_TIMER_OPTIONS)[number]
export type TimedSoloGameSeconds = Exclude<SoloGameTimerSeconds, 'none'>

export interface SoloGameConfig {
  rounds: SoloGameRoundOption
  timerSeconds: SoloGameTimerSeconds
}

export const QUICK_PLAY_CONFIG = Object.freeze({
  rounds: 5,
  timerSeconds: 90,
} as const) satisfies Readonly<SoloGameConfig>

export interface SoloGameAvailability {
  total: number
}

export interface SoloGamePlan {
  config: SoloGameConfig
  eligibleQuestionCount: number
  roundCount: number
  constrainedByAvailability: boolean
}

export type RoundCompletionReason = 'submitted' | 'timed-out'

export interface SoloRoundSummary {
  roundNumber: number
  roundId: string
  questionId: string
  archiveLabel: string
  result: ScoreResult
  completionReason: RoundCompletionReason
}

export interface SoloGameSummary {
  points: number
  total: number
  rounds: readonly SoloRoundSummary[]
}

export function isSoloGameConfig(value: unknown): value is SoloGameConfig {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<SoloGameConfig>

  return (
    SOLO_GAME_ROUND_OPTIONS.some((rounds) => rounds === candidate.rounds) &&
    SOLO_GAME_TIMER_OPTIONS.some((seconds) => seconds === candidate.timerSeconds)
  )
}
