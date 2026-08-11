import type { InternationalCatalog } from './catalog/types'
import type { QuestionAnswer, QuestionSource } from '../types/question'

export const QUESTION_ID_PATTERN = /^q-[0-9a-hj-km-np-tv-z]{12}$/

export type QuestionKind = 'production' | 'synthetic'
export type QuestionStatus = 'draft' | 'published'

export interface InternationalTournamentChoiceSource {
  source: 'international-series'
}

export interface QuestionManifestChoices {
  years: readonly number[]
  tournaments: readonly string[] | InternationalTournamentChoiceSource
  stages: readonly string[]
  teams: readonly string[]
  games: readonly number[]
}

interface QuestionManifestBase {
  schemaVersion: 1
  id: string
  kind: QuestionKind
  status: QuestionStatus
  catalogEditionId?: string
  answer: QuestionAnswer
  source?: QuestionSource
}

export interface DraftQuestionManifest extends QuestionManifestBase {
  status: 'draft'
  publicImage?: string
  imageAlt?: string
  archiveLabel?: string
  clue?: string
  choices?: QuestionManifestChoices
}

export interface PublishedQuestionManifest extends QuestionManifestBase {
  status: 'published'
  publicImage: string
  imageAlt: string
  archiveLabel: string
  clue: string
  choices: QuestionManifestChoices
}

export type QuestionManifest = DraftQuestionManifest | PublishedQuestionManifest

export interface QuestionManifestValidationContext {
  expectedId?: string
  catalog?: InternationalCatalog
}

type UnknownRecord = Record<string, unknown>

const manifestKeys = new Set([
  'schemaVersion',
  'id',
  'kind',
  'status',
  'catalogEditionId',
  'publicImage',
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
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push('choices must be an object')
    return
  }

  reportUnknownKeys(value, choiceKeys, 'choices', issues)

  const years = validateIntegerArray(value.years, 'choices.years', issues)
  const stages = validateStringArray(value.stages, 'choices.stages', issues)
  const teams = validateStringArray(value.teams, 'choices.teams', issues)
  const games = validateIntegerArray(value.games, 'choices.games', issues)
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

  if (!answer) {
    return
  }

  const inclusions: readonly [unknown, readonly unknown[], string][] = [
    [answer.year, years, 'choices.years'],
    [answer.stage, stages, 'choices.stages'],
    [answer.blueTeam, teams, 'choices.teams'],
    [answer.redTeam, teams, 'choices.teams'],
    [answer.gameNumber, games, 'choices.games'],
  ]

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

  for (const side of ['blueTeam', 'redTeam'] as const) {
    const teamName = answer[side]

    if (isNonEmptyString(teamName) && !participantNames.includes(teamName)) {
      issues.push(`answer.${side} is not a participant in ${manifest.catalogEditionId}`)
    }
  }
}

function validatePublicImage(manifest: UnknownRecord, issues: string[]): void {
  if (manifest.publicImage === undefined) {
    return
  }

  if (!isNonEmptyString(manifest.publicImage)) {
    issues.push('publicImage must be a non-empty filename')
    return
  }

  if (manifest.publicImage.includes('/') || manifest.publicImage.includes('\\')) {
    issues.push('publicImage must be a filename without directories')
  }

  if (isNonEmptyString(manifest.id) && !manifest.publicImage.startsWith(`${manifest.id}.`)) {
    issues.push('publicImage basename must equal the question ID')
  }

  if (manifest.kind === 'production' && !manifest.publicImage.endsWith('.webp')) {
    issues.push('production publicImage must use WebP')
  }

  if (
    manifest.kind === 'synthetic' &&
    !manifest.publicImage.endsWith('.svg') &&
    !manifest.publicImage.endsWith('.webp')
  ) {
    issues.push('synthetic publicImage must use SVG or WebP')
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

  if (value.schemaVersion !== 1) {
    issues.push('schemaVersion must be 1')
  }

  if (!isNonEmptyString(value.id) || !QUESTION_ID_PATTERN.test(value.id)) {
    issues.push('id must match ^q-[0-9a-hj-km-np-tv-z]{12}$')
  } else if (context.expectedId && value.id !== context.expectedId) {
    issues.push(`id must match directory name ${context.expectedId}`)
  }

  if (!['production', 'synthetic'].includes(String(value.kind))) {
    issues.push('kind must be production or synthetic')
  }

  if (!['draft', 'published'].includes(String(value.status))) {
    issues.push('status must be draft or published')
  }

  const answer = validateAnswer(value.answer, issues)

  if (value.source !== undefined) {
    validateSource(value.source, issues)
  }

  validateCatalogReference(value, answer, context.catalog, issues)
  validatePublicImage(value, issues)

  if (value.status === 'published') {
    for (const field of ['publicImage', 'imageAlt', 'archiveLabel', 'clue'] as const) {
      if (!isNonEmptyString(value[field])) {
        issues.push(`${field} is required for a published question`)
      }
    }

    validateChoices(value.choices, answer, context.catalog, issues)

    if (value.kind === 'production' && value.source === undefined) {
      issues.push('source is required for a published production question')
    }
  } else {
    for (const field of ['imageAlt', 'archiveLabel', 'clue'] as const) {
      if (value[field] !== undefined && !isNonEmptyString(value[field])) {
        issues.push(`${field} must be a non-empty string when provided`)
      }
    }

    if (value.choices !== undefined) {
      validateChoices(value.choices, answer, context.catalog, issues)
    }
  }

  return issues
}
