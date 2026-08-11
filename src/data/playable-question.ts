import type { InternationalCatalog } from './catalog/types.ts'
import type {
  CatalogQuestionManifestChoices,
  PlayableQuestionManifest,
  QuestionManifest,
} from './question-manifest.ts'

const MINIMUM_GAME_CHOICES = 5

function createCatalogChoiceScope(
  manifest: QuestionManifest & { catalogEditionId: string },
  catalog: InternationalCatalog,
): CatalogQuestionManifestChoices {
  const gameCount = Math.max(MINIMUM_GAME_CHOICES, manifest.answer.gameNumber)

  return {
    years: [...new Set(catalog.editions.map((edition) => edition.year))].sort(
      (left, right) => right - left,
    ),
    tournaments: { source: 'international-series' },
    games: Array.from({ length: gameCount }, (_, index) => index + 1),
  }
}

export function materializePlayableQuestionManifest(
  id: string,
  manifest: QuestionManifest,
  catalog: InternationalCatalog,
): PlayableQuestionManifest {
  const presentation = {
    imageAlt: manifest.imageAlt ?? 'A redacted professional League of Legends broadcast frame.',
    archiveLabel: manifest.archiveLabel ?? 'Pro match archive',
    clue: manifest.clue ?? 'Infer the match from the remaining broadcast and game-state clues.',
  }

  if (manifest.catalogEditionId !== undefined) {
    return {
      ...manifest,
      ...presentation,
      choices: manifest.choices ?? createCatalogChoiceScope(manifest, catalog),
    }
  }

  if (manifest.choices === undefined) {
    throw new Error(`${id}: a non-catalog question needs explicit choices before it is playable`)
  }

  return {
    ...manifest,
    ...presentation,
    choices: manifest.choices,
  }
}
