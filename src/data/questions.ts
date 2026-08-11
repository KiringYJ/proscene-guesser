import type {
  GeneratedLocalQuestionBundle,
  LocalQuestionBundle,
} from '@/game/authority/question-bundle'

import { publishedQuestionBundles } from './questions.generated'

export function createLocalQuestionBundle(
  record: GeneratedLocalQuestionBundle,
  baseUrl: string,
): LocalQuestionBundle {
  return {
    prompt: {
      id: record.prompt.id,
      pool: record.prompt.pool,
      image: `${baseUrl}questions/${record.prompt.publicImage}`,
      imageAlt: record.prompt.imageAlt,
      archiveLabel: record.prompt.archiveLabel,
      clue: record.prompt.clue,
      choices: record.prompt.choices,
      ...(record.prompt.catalogEditionIds
        ? { catalogEditionIds: record.prompt.catalogEditionIds }
        : {}),
    },
    disclosure: record.disclosure,
  }
}

export const localQuestionBundles = publishedQuestionBundles.map((record) =>
  createLocalQuestionBundle(record, import.meta.env.BASE_URL),
)
