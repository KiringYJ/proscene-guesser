import type {
  GeneratedLocalQuestionBundle,
  LocalQuestionBundle,
} from '@/game/authority/question-bundle'

import { parseQuestionDirectoryName } from './question-directory'
import { playableQuestionBundles } from './questions.generated'

const redactedQuestionImages = import.meta.glob<string>(
  '../../sources/questions/*/redacted.webp',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
)

const redactedQuestionImagesById = new Map<string, string>()

for (const [path, image] of Object.entries(redactedQuestionImages)) {
  const directoryName = path.match(/\/([^/]+)\/redacted\.webp$/)?.[1]
  const parsedDirectory = directoryName
    ? parseQuestionDirectoryName(directoryName)
    : null

  if (parsedDirectory === null) {
    throw new Error(`Invalid redacted question image path: ${path}`)
  }

  if (redactedQuestionImagesById.has(parsedDirectory.id)) {
    throw new Error(`Duplicate redacted question image for ${parsedDirectory.id}`)
  }

  redactedQuestionImagesById.set(parsedDirectory.id, image)
}

function getRedactedQuestionImage(id: string): string {
  const image = redactedQuestionImagesById.get(id)

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
