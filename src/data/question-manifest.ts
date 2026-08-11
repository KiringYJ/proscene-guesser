import type { InternationalCatalog } from './catalog/types.ts'
import type { GeneratedLocalQuestionBundle } from '../game/authority/question-bundle.ts'
import type { QuestionSource, QuestionTeamChoice } from '../types/question.ts'

const QUESTION_POOLS = ['classic', 'deep-cut'] as const

type QuestionPool = (typeof QUESTION_POOLS)[number]

export const QUESTION_ID_PATTERN = /^q-[0-9a-hj-km-np-tv-z]{12}$/

export interface InternationalTournamentChoiceSource {
  source: 'international-series'
}

interface QuestionManifestChoiceScope {
  years: readonly number[]
  tournaments: readonly string[] | InternationalTournamentChoiceSource
  games: readonly number[]
}

export interface CatalogQuestionManifestChoices extends QuestionManifestChoiceScope {
  stages?: never
  teams?: never
}

export interface StaticQuestionManifestChoices extends QuestionManifestChoiceScope {
  stages: readonly string[]
  teams: readonly QuestionTeamChoice[]
}

export type QuestionManifestChoices =
  | CatalogQuestionManifestChoices
  | StaticQuestionManifestChoices

export interface CatalogQuestionManifestAnswer {
  stage: string
  blueTeamId: string
  redTeamId: string
  gameNumber: number
}

export interface StaticQuestionManifestAnswer extends CatalogQuestionManifestAnswer {
  year: number
  tournament: string
}

export interface QuestionRightsReview {
  reviewedAt: string
  evidence: string
}

export type { GeneratedLocalQuestionBundle }

interface QuestionManifestBase {
  pool: QuestionPool
  source?: QuestionSource
  rights?: QuestionRightsReview
}

interface CatalogQuestionManifestFields {
  catalogEditionId: string
  answer: CatalogQuestionManifestAnswer
  choices?: CatalogQuestionManifestChoices
}

interface StaticQuestionManifestFields {
  catalogEditionId?: never
  answer: StaticQuestionManifestAnswer
  choices?: StaticQuestionManifestChoices
}

interface QuestionManifestPresentationFields {
  imageAlt?: string
  archiveLabel?: string
  clue?: string
}

interface PlayableQuestionManifestFields {
  imageAlt: string
  archiveLabel: string
  clue: string
}

export type QuestionManifest = QuestionManifestBase &
  QuestionManifestPresentationFields &
  (CatalogQuestionManifestFields | StaticQuestionManifestFields)

export type PlayableQuestionManifest = QuestionManifestBase &
  PlayableQuestionManifestFields &
  (
    | (CatalogQuestionManifestFields & { choices: CatalogQuestionManifestChoices })
    | (StaticQuestionManifestFields & { choices: StaticQuestionManifestChoices })
  )

export type ReadyQuestionManifest = PlayableQuestionManifest & {
  source: QuestionSource
  rights: QuestionRightsReview
}

export interface QuestionManifestValidationContext {
  catalog?: InternationalCatalog
  ready?: boolean
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
  'rights',
])
const catalogAnswerKeys = new Set([
  'stage',
  'blueTeamId',
  'redTeamId',
  'gameNumber',
])
const staticAnswerKeys = new Set([...catalogAnswerKeys, 'year', 'tournament'])
const choiceKeys = new Set(['years', 'tournaments', 'stages', 'teams', 'games'])
const teamChoiceKeys = new Set(['id', 'name'])
const sourceKeys = new Set(['label', 'url'])
const rightsKeys = new Set(['reviewedAt', 'evidence'])

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

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) {
    return false
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
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

function validateTeamChoices(
  value: unknown,
  path: string,
  issues: string[],
): readonly QuestionTeamChoice[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(`${path} must be a non-empty array`)
    return []
  }

  const teams: QuestionTeamChoice[] = []

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`

    if (!isRecord(item)) {
      issues.push(`${itemPath} must be an object`)
      continue
    }

    reportUnknownKeys(item, teamChoiceKeys, itemPath, issues)

    if (!isNonEmptyString(item.id)) {
      issues.push(`${itemPath}.id must be a non-empty string`)
    }

    if (!isNonEmptyString(item.name)) {
      issues.push(`${itemPath}.name must be a non-empty string`)
    }

    if (isNonEmptyString(item.id) && isNonEmptyString(item.name)) {
      teams.push({ id: item.id, name: item.name })
    }
  }

  if (new Set(teams.map((team) => team.id)).size !== teams.length) {
    issues.push(`${path} must not contain duplicate IDs`)
  }

  if (new Set(teams.map((team) => team.name)).size !== teams.length) {
    issues.push(`${path} must not contain duplicate names`)
  }

  return teams
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

function validateAnswer(
  value: unknown,
  catalogBacked: boolean,
  issues: string[],
): UnknownRecord | null {
  if (!isRecord(value)) {
    issues.push('answer must be an object')
    return null
  }

  reportUnknownKeys(
    value,
    catalogBacked ? catalogAnswerKeys : staticAnswerKeys,
    'answer',
    issues,
  )

  if (!catalogBacked) {
    if (
      typeof value.year !== 'number' ||
      !Number.isInteger(value.year) ||
      value.year < 2010 ||
      value.year > 2100
    ) {
      issues.push('answer.year must be an integer from 2010 through 2100')
    }

    if (!isNonEmptyString(value.tournament)) {
      issues.push('answer.tournament must be a non-empty string')
    }
  }

  for (const field of ['stage', 'blueTeamId', 'redTeamId'] as const) {
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
    isNonEmptyString(value.blueTeamId) &&
    isNonEmptyString(value.redTeamId) &&
    value.blueTeamId === value.redTeamId
  ) {
    issues.push('answer.blueTeamId and answer.redTeamId must be different')
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

function validateRights(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('rights must be an object')
    return
  }

  reportUnknownKeys(value, rightsKeys, 'rights', issues)

  if (
    !isNonEmptyString(value.reviewedAt) ||
    !isValidIsoDate(value.reviewedAt)
  ) {
    issues.push('rights.reviewedAt must be a valid YYYY-MM-DD date')
  }

  if (!isNonEmptyString(value.evidence)) {
    issues.push('rights.evidence must be a non-empty review reference')
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
  const catalogBacked = catalogEditionId !== undefined
  const catalogEdition = isNonEmptyString(catalogEditionId)
    ? catalog?.editions.find((edition) => edition.id === catalogEditionId)
    : undefined
  const stages = catalogBacked
    ? []
    : validateStringArray(value.stages, 'choices.stages', issues)
  const teams = catalogBacked
    ? []
    : validateTeamChoices(value.teams, 'choices.teams', issues)
  let tournaments: readonly string[] = []
  let tournamentsResolved = true

  if (catalogBacked && value.stages !== undefined) {
    issues.push('choices.stages must be omitted for a catalog-backed question')
  }

  if (catalogBacked && value.teams !== undefined) {
    issues.push('choices.teams must be omitted for a catalog-backed question')
  }

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
    [answer.gameNumber, games, 'choices.games'],
  ]

  if (catalogBacked) {
    if (catalogEdition && !years.includes(catalogEdition.year)) {
      issues.push(`choices.years does not include catalog edition year ${catalogEdition.year}`)
    }

    const series = catalogEdition
      ? catalog?.series.find((candidate) => candidate.id === catalogEdition.seriesId)
      : undefined

    if (series && tournamentsResolved && !tournaments.includes(series.name)) {
      issues.push(`choices.tournaments does not include catalog series ${series.name}`)
    }
  } else {
    inclusions.push(
      [answer.year, years, 'choices.years'],
      [answer.stage, stages, 'choices.stages'],
      [answer.blueTeamId, teams.map((team) => team.id), 'choices.teams'],
      [answer.redTeamId, teams.map((team) => team.id), 'choices.teams'],
    )
  }

  for (const [expected, values, path] of inclusions) {
    if ((typeof expected === 'string' || typeof expected === 'number') && !values.includes(expected)) {
      issues.push(`${path} does not include answer value ${String(expected)}`)
    }
  }

  if (
    !catalogBacked &&
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

  const participantIds = new Set(edition.participants.map((participant) => participant.teamId))

  if (isNonEmptyString(answer.stage) && !edition.stages.includes(answer.stage)) {
    issues.push(`answer.stage is not a stage in ${manifest.catalogEditionId}`)
  }

  for (const side of ['blueTeamId', 'redTeamId'] as const) {
    const teamId = answer[side]

    if (isNonEmptyString(teamId) && !participantIds.has(teamId)) {
      issues.push(
        `answer.${side} references a team outside catalog edition ${manifest.catalogEditionId}`,
      )
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

  const answer = validateAnswer(value.answer, value.catalogEditionId !== undefined, issues)

  if (value.source !== undefined) {
    validateSource(value.source, issues)
  }

  if (value.rights !== undefined) {
    validateRights(value.rights, issues)
  }

  validateCatalogReference(value, answer, context.catalog, issues)

  if (context.ready) {
    for (const field of ['imageAlt', 'archiveLabel', 'clue'] as const) {
      if (!isNonEmptyString(value[field])) {
        issues.push(`${field} is required for a ready question`)
      }
    }

    validateChoices(value.choices, answer, context.catalog, value.catalogEditionId, issues)

    if (value.source === undefined) {
      issues.push('source is required for a ready question')
    }

    if (value.rights === undefined) {
      issues.push('rights review is required for a ready question')
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
