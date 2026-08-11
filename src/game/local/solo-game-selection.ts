import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import type {
  SoloGameAvailability,
  SoloGameConfig,
  SoloGamePlan,
} from '@/game/solo'

export interface SoloGameSelection {
  plan: SoloGamePlan
  bundles: readonly LocalQuestionBundle[]
}

export function getSoloGameAvailability(
  catalog: readonly LocalQuestionBundle[],
): SoloGameAvailability {
  const classic = catalog.filter((bundle) => bundle.prompt.pool === 'classic').length
  const deepCut = catalog.length - classic

  return {
    total: catalog.length,
    byPool: {
      classic,
      'deep-cut': deepCut,
    },
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    const swap = result[swapIndex]

    if (current === undefined || swap === undefined) {
      throw new Error('Solo game shuffle produced an invalid index')
    }

    result[index] = swap
    result[swapIndex] = current
  }

  return result
}

export function createSoloGameSelection(
  catalog: readonly LocalQuestionBundle[],
  config: SoloGameConfig,
  random: () => number = Math.random,
): SoloGameSelection {
  const eligible = config.pool === 'mixed'
    ? catalog
    : catalog.filter((bundle) => bundle.prompt.pool === config.pool)
  const requestedRoundCount = config.rounds === 'all' ? eligible.length : config.rounds
  const roundCount = Math.min(requestedRoundCount, eligible.length)

  return {
    plan: {
      config: { ...config },
      eligibleQuestionCount: eligible.length,
      roundCount,
      constrainedByAvailability:
        config.rounds !== 'all' && eligible.length < config.rounds,
    },
    bundles: shuffled(eligible, random).slice(0, roundCount),
  }
}

export function assertUniqueQuestionIds(catalog: readonly LocalQuestionBundle[]): void {
  const questionIds = new Set<string>()

  for (const bundle of catalog) {
    if (questionIds.has(bundle.prompt.id)) {
      throw new Error(`Duplicate playable question ID: ${bundle.prompt.id}`)
    }

    questionIds.add(bundle.prompt.id)
  }
}
