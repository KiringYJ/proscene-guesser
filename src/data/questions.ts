import type {
  GeneratedLocalQuestionBundle,
  LocalQuestionBundle,
} from '@/game/authority/question-bundle'

import { playableQuestionBundles } from './questions.generated'

const redactedQuestionImages = import.meta.glob<string>(
  '../../sources/questions/*/redacted.webp',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
)

function getRedactedQuestionImage(id: string): string {
  const image = redactedQuestionImages[`../../sources/questions/${id}/redacted.webp`]

  if (!image) {
    throw new Error(`${id}: generated question is missing redacted.webp`)
  }

  return image
}

export function createLocalQuestionBundle(
  record: GeneratedLocalQuestionBundle,
  image: string,
): LocalQuestionBundle {
  return {
    prompt: {
      id: record.prompt.id,
      image,
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

export const localQuestionBundles = playableQuestionBundles.map(
  (record: GeneratedLocalQuestionBundle) =>
    createLocalQuestionBundle(record, getRedactedQuestionImage(record.prompt.id)),
)
