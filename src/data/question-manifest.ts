import type { InternationalCatalog } from './catalog/types'
import type { GeneratedLocalQuestionBundle } from '../game/authority/question-bundle.ts'
import {
  QUESTION_POOLS,
  type QuestionAnswer,
  type QuestionPool,
  type QuestionSource,
} from '../types/question.ts'

export const QUESTION_ID_PATTERN = /^q-[0-9a-hj-km-np-tv-z]{12}$/
export const QUESTION_PUBLIC_IMAGE_PATTERN = /^(q-[0-9a-hj-km-np-tv-z]{12})\.webp$/

export interface InternationalTournamentChoiceSource {
  source: 'international-series'
}

export interface QuestionManifestChoices {
  years: readonly number[]
  tournaments: readonly string[] | InternationalTournamentChoiceSource
  stages?: readonly string[]
  teams?: readonly string[]
  games: readonly number[]
}

export type { GeneratedLocalQuestionBundle }

interface QuestionManifestBase {
  pool: QuestionPool
  catalogEditionId?: string
  answer: QuestionAnswer
  source?: QuestionSource
}

export interface QuestionManifest extends QuestionManifestBase {
  imageAlt?: string
  archiveLabel?: string
  clue?: string
  choices?: QuestionManifestChoices
}

export interface PublishedQuestionManifest extends QuestionManifestBase {
  imageAlt: string
  archiveLabel: string
  clue: string
  choices: QuestionManifestChoices
  source: QuestionSource
}

export interface QuestionManifestValidationContext {
  catalog?: InternationalCatalog
  published?: boolean
}

type UnknownRecord = Record<string, unknown>

const manifestKeys = new Set([
  'pool',
  'catalogEditionId',
  'imageAlt',
  'archiveLabel',
  'clue',
  'answer',
  'choices',
  'source',
])
const answerKeys = new Set([
  'year',
  'tournament',
  'stage',
  'blueTeam',
  'redTeam',
  'gameNumber',
])
const choiceKeys = new Set(['years', 'tournaments', 'stages', 'teams', 'games'])
const sourceKeys = new Set(['label', 'url'])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reportUnknownKeys(
  value: UnknownRecord,
  allowedKeys: ReadonlySet<string>,
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push(`${path} has unknown field ${key}`)
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateStringArray(value: unknown, path: string, issues: string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must be a non-empty array`)
    return []
  }

  const strings = value.filter(isNonEmptyString)

  if (strings.length !== value.length) {
    issues.push(`${path} must contain only non-empty strings`)
  }

  if (new Set(strings).size !== strings.length) {
    issues.push(`${path} must not contain duplicates`)
  }

  return strings
}

function validateIntegerArray(value: unknown, path: string, issues: string[]): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must be a non-empty array`)
    return []
  }

  const integers = value.filter(
    (item): item is number => typeof item === 'number' && Number.isInteger(item),
  )

  if (integers.length !== value.length) {
    issues.push(`${path} must contain only integers`)
  }

  if (new Set(integers).size !== integers.length) {
    issues.push(`${path} must not contain duplicates`)
  }

  return integers
}

function validateAnswer(value: unknown, issues: string[]): UnknownRecord | null {
  if (!isRecord(value)) {
    issues.push('answer must be an object')
    return null
  }

  reportUnknownKeys(value, answerKeys, 'answer', issues)

  if (
    typeof value.year !== 'number' ||
    !Number.isInteger(value.year) ||
    value.year < 2010 ||
    value.year > 2100
  ) {
    issues.push('answer.year must be an integer from 2010 through 2100')
  }

  for (const field of ['tournament', 'stage', 'blueTeam', 'redTeam'] as const) {
    if (!isNonEmptyString(value[field])) {
      issues.push(`answer.${field} must be a non-empty string`)
    }
  }

  if (
    typeof value.gameNumber !== 'number' ||
    !Number.isInteger(value.gameNumber) ||
    value.gameNumber < 1
  ) {
    issues.push('answer.gameNumber must be a positive integer')
  }

  if (
    isNonEmptyString(value.blueTeam) &&
    isNonEmptyString(value.redTeam) &&
    value.blueTeam === value.redTeam
  ) {
    issues.push('answer.blueTeam and answer.redTeam must be different')
  }

  return value
}

function validateSource(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('source must be an object')
    return
  }

  reportUnknownKeys(value, sourceKeys, 'source', issues)

  if (!isNonEmptyString(value.label)) {
    issues.push('source.label must be a non-empty string')
  }

  if (!isNonEmptyString(value.url)) {
    issues.push('source.url must be a non-empty URL')
    return
  }

  try {
    const url = new URL(value.url)

    if (!['http:', 'https:'].includes(url.protocol)) {
      issues.push('source.url must use HTTP or HTTPS')
    }
  } catch {
    issues.push('source.url must be a valid URL')
  }
}

function validateChoices(
  value: unknown,
  answer: UnknownRecord | null,
  catalog: InternationalCatalog | undefined,
  catalogEditionId: unknown,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push('choices must be an object')
    return
  }

  reportUnknownKeys(value, choiceKeys, 'choices', issues)

  const years = validateIntegerArray(value.years, 'choices.years', issues)
  const games = validateIntegerArray(value.games, 'choices.games', issues)
  const catalogBacked = isNonEmptyString(catalogEditionId)
  const catalogEdition = catalogBacked
    ? catalog?.editions.find((edition) => edition.id === catalogEditionId)
    : undefined
  const stages = value.stages === undefined && catalogBacked
    ? (catalogEdition?.stages ?? [])
    : validateStringArray(value.stages, 'choices.stages', issues)
  const teams = value.teams === undefined && catalogBacked
    ? (catalogEdition?.participants.map((participant) => participant.nameAtEvent) ?? [])
    : validateStringArray(value.teams, 'choices.teams', issues)
  const stagesResolved = value.stages !== undefined || catalogEdition !== undefined
  const teamsResolved = value.teams !== undefined || catalogEdition !== undefined
  let tournaments: readonly string[] = []
  let tournamentsResolved = true

  if (Array.isArray(value.tournaments)) {
    tournaments = validateStringArray(value.tournaments, 'choices.tournaments', issues)
  } else if (isRecord(value.tournaments)) {
    reportUnknownKeys(value.tournaments, new Set(['source']), 'choices.tournaments', issues)

    if (value.tournaments.source !== 'international-series') {
      issues.push('choices.tournaments.source must be international-series')
    } else if (catalog) {
      tournaments = catalog.series.map((series) => series.name)
    } else {
      tournamentsResolved = false
    }
  } else {
    issues.push('choices.tournaments must be a non-empty array or a catalog source')
  }

  if (catalogBacked && catalog) {
    const catalogTournamentNames = new Set(catalog.series.map((series) => series.name))

    for (const tournament of tournaments) {
      if (!catalogTournamentNames.has(tournament)) {
        issues.push(`choices.tournaments includes unknown catalog series ${tournament}`)
      }
    }
  }

  if (!answer) {
    return
  }

  const inclusions: [unknown, readonly unknown[], string][] = [
    [answer.year, years, 'choices.years'],
    [answer.gameNumber, games, 'choices.games'],
  ]

  if (stagesResolved) {
    inclusions.push([answer.stage, stages, 'choices.stages'])
  }

  if (teamsResolved) {
    inclusions.push(
      [answer.blueTeam, teams, 'choices.teams'],
      [answer.redTeam, teams, 'choices.teams'],
    )
  }

  for (const [expected, values, path] of inclusions) {
    if ((typeof expected === 'string' || typeof expected === 'number') && !values.includes(expected)) {
      issues.push(`${path} does not include answer value ${String(expected)}`)
    }
  }

  if (
    tournamentsResolved &&
    isNonEmptyString(answer.tournament) &&
    !tournaments.includes(answer.tournament)
  ) {
    issues.push(`choices.tournaments does not include answer value ${answer.tournament}`)
  }
}

function validateCatalogReference(
  manifest: UnknownRecord,
  answer: UnknownRecord | null,
  catalog: InternationalCatalog | undefined,
  issues: string[],
): void {
  if (manifest.catalogEditionId === undefined) {
    return
  }

  if (!isNonEmptyString(manifest.catalogEditionId)) {
    issues.push('catalogEditionId must be a non-empty string')
    return
  }

  if (!catalog || !answer) {
    return
  }

  const edition = catalog.editions.find((candidate) => candidate.id === manifest.catalogEditionId)

  if (!edition) {
    issues.push(`catalogEditionId references unknown edition ${manifest.catalogEditionId}`)
    return
  }

  const series = catalog.series.find((candidate) => candidate.id === edition.seriesId)
  const participantNames = edition.participants.map((participant) => participant.nameAtEvent)

  if (answer.year !== edition.year) {
    issues.push(`answer.year does not match catalog edition ${manifest.catalogEditionId}`)
  }

  if (series && answer.tournament !== series.name) {
    issues.push(`answer.tournament does not match catalog edition ${manifest.catalogEditionId}`)
  }

  if (isNonEmptyString(answer.stage) && !edition.stages.includes(answer.stage)) {
    issues.push(`answer.stage is not a stage in ${manifest.catalogEditionId}`)
  }

  for (const side of ['blueTeam', 'redTeam'] as const) {
    const teamName = answer[side]

    if (isNonEmptyString(teamName) && !participantNames.includes(teamName)) {
      issues.push(`answer.${side} is not a participant in ${manifest.catalogEditionId}`)
    }
  }
}

export function validateQuestionManifest(
  value: unknown,
  context: QuestionManifestValidationContext = {},
): readonly string[] {
  const issues: string[] = []

  if (!isRecord(value)) {
    return ['manifest must be an object']
  }

  reportUnknownKeys(value, manifestKeys, 'manifest', issues)

  if (!QUESTION_POOLS.some((pool) => pool === value.pool)) {
    issues.push('pool must be classic or deep-cut')
  }

  const answer = validateAnswer(value.answer, issues)

  if (value.source !== undefined) {
    validateSource(value.source, issues)
  }

  validateCatalogReference(value, answer, context.catalog, issues)

  if (context.published) {
    for (const field of ['imageAlt', 'archiveLabel', 'clue'] as const) {
      if (!isNonEmptyString(value[field])) {
        issues.push(`${field} is required for a published question`)
      }
    }

    validateChoices(value.choices, answer, context.catalog, value.catalogEditionId, issues)

    if (value.source === undefined) {
      issues.push('source is required for a published question')
    }
  } else {
    for (const field of ['imageAlt', 'archiveLabel', 'clue'] as const) {
      if (value[field] !== undefined && !isNonEmptyString(value[field])) {
        issues.push(`${field} must be a non-empty string when provided`)
      }
    }

    if (value.choices !== undefined) {
      validateChoices(value.choices, answer, context.catalog, value.catalogEditionId, issues)
    }
  }

  return issues
}

export function getQuestionPublicImageFilename(id: string): string {
  return `${id}.webp`
}

export function validatePublicQuestionImageInventory(
  filenames: readonly string[],
  questionIds: ReadonlySet<string>,
): readonly string[] {
  const issues: string[] = []

  for (const filename of filenames) {
    if (filename === 'README.md') {
      continue
    }

    const match = QUESTION_PUBLIC_IMAGE_PATTERN.exec(filename)

    if (!match) {
      issues.push(`public question file must be an opaque question ID followed by .webp: ${filename}`)
    } else if (!questionIds.has(filename.slice(0, -'.webp'.length))) {
      issues.push(`public question image has no source directory: ${filename}`)
    }
  }

  return issues
}
