import type { PlayableQuestionManifest } from './question-manifest.ts'
import type { InternationalCatalog } from './catalog/types.ts'
import type { GeneratedLocalQuestionBundle } from '../game/authority/question-bundle.ts'
import type { QuestionAnswer, QuestionTeamChoice } from '../types/question.ts'

export function createGeneratedLocalQuestionBundle(
  id: string,
  manifest: PlayableQuestionManifest,
  catalog: InternationalCatalog,
): GeneratedLocalQuestionBundle {
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
      `${id}: catalog edition ${manifest.catalogEditionId} is outside the configured choice scope`,
    )
  }

  const stages = answerEdition?.stages ?? manifest.choices.stages
  const teams: readonly QuestionTeamChoice[] | undefined = answerEdition
    ? answerEdition.participants.map((participant) => ({
        id: participant.teamId,
        name: participant.nameAtEvent,
      }))
    : manifest.choices.teams

  if (!stages || !teams) {
    throw new Error(`${id}: static questions must define stage and team choices`)
  }

  let answer: QuestionAnswer

  if (answerEdition) {
    const tournament = seriesNameById.get(answerEdition.seriesId)

    if (!tournament) {
      throw new Error(`${id}: catalog edition has no known series ${answerEdition.seriesId}`)
    }

    answer = {
      year: answerEdition.year,
      tournament,
      stage: manifest.answer.stage,
      blueTeamId: manifest.answer.blueTeamId,
      redTeamId: manifest.answer.redTeamId,
      gameNumber: manifest.answer.gameNumber,
    }
  } else {
    if (!('year' in manifest.answer) || !('tournament' in manifest.answer)) {
      throw new Error(`${id}: catalog-backed answer cannot be resolved without an edition`)
    }

    answer = manifest.answer
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
        `${id}: catalog choice scope has no tournament for ${emptyYears.join(', ')}`,
      )
    }
  }

  return {
    prompt: {
      id,
      pool: manifest.pool,
      imageAlt: manifest.imageAlt,
      archiveLabel: manifest.archiveLabel,
      clue: manifest.clue,
      choices: {
        years: manifest.choices.years,
        tournaments,
        stages,
        teams,
        games: manifest.choices.games,
      },
      ...(catalogEditionIds ? { catalogEditionIds } : {}),
    },
    disclosure: {
      solution: {
        answer,
        ...(manifest.catalogEditionId ? { catalogEditionId: manifest.catalogEditionId } : {}),
      },
      ...(manifest.source ? { source: manifest.source } : {}),
    },
  }
}
