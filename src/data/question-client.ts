import type { InternationalCatalog } from './catalog/types'
import type {
  ClientQuestionRecord,
  PublishedQuestionManifest,
} from './question-manifest'

export function createClientQuestionRecord(
  manifest: PublishedQuestionManifest,
  catalog: InternationalCatalog,
): ClientQuestionRecord {
  const tournaments = Array.isArray(manifest.choices.tournaments)
    ? manifest.choices.tournaments
    : catalog.series.map((series) => series.name)
  const seriesNameById = new Map(catalog.series.map((series) => [series.id, series.name]))
  const allowedYears = new Set(manifest.choices.years)
  const allowedTournaments = new Set(tournaments)
  const answerEdition = manifest.catalogEditionId
    ? catalog.editions.find((edition) => edition.id === manifest.catalogEditionId)
    : undefined
  const catalogEditionIds = manifest.catalogEditionId
    ? catalog.editions
        .filter((edition) => {
          const tournamentName = seriesNameById.get(edition.seriesId)

          return (
            allowedYears.has(edition.year) &&
            tournamentName !== undefined &&
            allowedTournaments.has(tournamentName)
          )
        })
        .map((edition) => edition.id)
    : undefined

  if (
    manifest.catalogEditionId &&
    (!answerEdition || !catalogEditionIds?.includes(manifest.catalogEditionId))
  ) {
    throw new Error(
      `${manifest.id}: catalog edition ${manifest.catalogEditionId} is outside the configured choice scope`,
    )
  }

  const stages = answerEdition?.stages ?? manifest.choices.stages
  const teams = answerEdition?.participants.map((participant) => participant.nameAtEvent) ??
    manifest.choices.teams

  if (!stages || !teams) {
    throw new Error(`${manifest.id}: static questions must define stage and team choices`)
  }

  if (catalogEditionIds) {
    const scopedEditions = catalogEditionIds.map((editionId) =>
      catalog.editions.find((edition) => edition.id === editionId),
    )
    const emptyYears = manifest.choices.years.filter(
      (year) => !scopedEditions.some((edition) => edition?.year === year),
    )

    if (emptyYears.length > 0) {
      throw new Error(
        `${manifest.id}: catalog choice scope has no tournament for ${emptyYears.join(', ')}`,
      )
    }
  }

  return {
    id: manifest.id,
    publicImage: manifest.publicImage,
    imageAlt: manifest.imageAlt,
    archiveLabel: manifest.archiveLabel,
    clue: manifest.clue,
    answer: manifest.answer,
    choices: {
      years: manifest.choices.years,
      tournaments,
      stages,
      teams,
      games: manifest.choices.games,
    },
    ...(manifest.catalogEditionId
      ? {
          catalogEditionId: manifest.catalogEditionId,
          catalogEditionIds,
        }
      : {}),
    ...(manifest.source ? { source: manifest.source } : {}),
  }
}
