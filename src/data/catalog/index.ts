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
const seriesById = new Map(
  internationalCatalog.series.map((series) => [series.id, series]),
)

export interface InternationalEditionOption {
  title: string
  value: string
}

export interface InternationalTeamChoice {
  id: string
  name: string
}

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

export function getInternationalEditionOptions(
  editionIds: readonly string[],
  year: number,
): readonly InternationalEditionOption[] {
  const editions = editionIds
    .map(getInternationalEdition)
    .filter((edition) => edition.year === year)
  const editionCountBySeries = new Map<string, number>()

  for (const edition of editions) {
    editionCountBySeries.set(
      edition.seriesId,
      (editionCountBySeries.get(edition.seriesId) ?? 0) + 1,
    )
  }

  return editions.map((edition) => {
    const series = seriesById.get(edition.seriesId)

    if (!series) {
      throw new Error(`Unknown international series: ${edition.seriesId}`)
    }

    return {
      title: editionCountBySeries.get(edition.seriesId) === 1 ? series.name : edition.name,
      value: edition.id,
    }
  })
}

export function getInternationalTournamentNameForEdition(editionId: string): string {
  const edition = getInternationalEdition(editionId)
  const series = seriesById.get(edition.seriesId)

  if (!series) {
    throw new Error(`Unknown international series: ${edition.seriesId}`)
  }

  return series.name
}

export function getInternationalStageNamesForEdition(editionId: string): readonly string[] {
  return getInternationalEdition(editionId).stages
}

export function getInternationalTeamChoicesForEdition(
  editionId: string,
): readonly InternationalTeamChoice[] {
  return getInternationalEdition(editionId)
    .participants.map((participant) => ({
      id: participant.teamId,
      name: participant.nameAtEvent,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function getInternationalTeamNamesForEdition(editionId: string): readonly string[] {
  return getInternationalTeamChoicesForEdition(editionId).map((team) => team.name)
}
