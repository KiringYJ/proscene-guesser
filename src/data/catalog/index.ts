import catalogSnapshot from './international-catalog.json'
import type { InternationalCatalog, InternationalEdition } from './types'
import { validateInternationalCatalog } from './validation'

export const internationalCatalog = catalogSnapshot as unknown as InternationalCatalog

const catalogIssues = validateInternationalCatalog(internationalCatalog)

if (catalogIssues.length > 0) {
  throw new Error(`Bundled international catalog is invalid:\n- ${catalogIssues.join('\n- ')}`)
}

const editionById = new Map(
  internationalCatalog.editions.map((edition) => [edition.id, edition]),
)

export const internationalTournamentNames = Object.freeze(
  internationalCatalog.series.map((series) => series.name),
)

export const internationalYears = Object.freeze([
  ...new Set(internationalCatalog.editions.map((edition) => edition.year)),
].sort((left, right) => right - left))

export function getInternationalEdition(editionId: string): InternationalEdition {
  const edition = editionById.get(editionId)

  if (!edition) {
    throw new Error(`Unknown international edition: ${editionId}`)
  }

  return edition
}

export function getInternationalEditionsForYear(year: number): readonly InternationalEdition[] {
  return internationalCatalog.editions.filter((edition) => edition.year === year)
}

export function getInternationalTeamNamesForEdition(editionId: string): readonly string[] {
  return getInternationalEdition(editionId)
    .participants.map((participant) => participant.nameAtEvent)
    .sort((left, right) => left.localeCompare(right))
}
