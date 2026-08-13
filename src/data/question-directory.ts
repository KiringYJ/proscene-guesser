import {
  QUESTION_ID_PATTERN,
  type QuestionManifest,
} from './question-manifest.ts'

const QUESTION_ID_TOKEN_PATTERN = '[0-9a-hj-km-np-tv-z]{12}'
const SLUG_SEGMENT_PATTERN = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const QUESTION_LOCATOR_PATTERN = [
  SLUG_SEGMENT_PATTERN,
  SLUG_SEGMENT_PATTERN,
  SLUG_SEGMENT_PATTERN,
  SLUG_SEGMENT_PATTERN,
  'g[1-9][0-9]*',
].join('--')

export const QUESTION_DIRECTORY_NAME_PATTERN = new RegExp(
  `^${QUESTION_LOCATOR_PATTERN}--${QUESTION_ID_TOKEN_PATTERN}$`,
)

export interface ParsedQuestionDirectoryName {
  id: string
  locator: string
}

function createSlug(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length === 0) {
    throw new Error(`Cannot create a question directory slug from ${JSON.stringify(value)}`)
  }

  return slug
}

export function createQuestionDirectoryName(
  id: string,
  manifest: QuestionManifest,
): string {
  if (!QUESTION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid question ID: ${id}`)
  }

  if (!Number.isInteger(manifest.answer.gameNumber) || manifest.answer.gameNumber < 1) {
    throw new Error(`Invalid game number: ${manifest.answer.gameNumber}`)
  }

  const event =
    manifest.catalogEditionId !== undefined
      ? manifest.catalogEditionId
      : `${manifest.answer.tournament}-${manifest.answer.year}`
  const answer = manifest.answer

  return [
    createSlug(event),
    createSlug(answer.stage),
    createSlug(answer.blueTeamId),
    createSlug(answer.redTeamId),
    `g${answer.gameNumber}`,
    id.slice(2),
  ].join('--')
}

export function parseQuestionDirectoryName(
  directoryName: string,
): ParsedQuestionDirectoryName | null {
  if (!QUESTION_DIRECTORY_NAME_PATTERN.test(directoryName)) {
    return null
  }

  const separatorIndex = directoryName.lastIndexOf('--')
  const token = directoryName.slice(separatorIndex + 2)

  return {
    id: `q-${token}`,
    locator: directoryName.slice(0, separatorIndex),
  }
}
