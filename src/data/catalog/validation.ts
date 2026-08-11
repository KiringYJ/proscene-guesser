import type { InternationalCatalog } from './types'

function findDuplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value)
    }

    seen.add(value)
  }

  return [...duplicates]
}

export function validateInternationalCatalog(catalog: InternationalCatalog): readonly string[] {
  const issues: string[] = []
  const seriesIds = new Set(catalog.series.map((series) => series.id))
  const teamIds = new Set(catalog.teams.map((team) => team.id))
  const teamById = new Map(catalog.teams.map((team) => [team.id, team]))

  if (catalog.schemaVersion !== 1) {
    issues.push(`Unsupported catalog schema version: ${String(catalog.schemaVersion)}`)
  }

  if (catalog.sourceName !== 'Liquipedia') {
    issues.push(`Unexpected catalog source: ${String(catalog.sourceName)}`)
  }

  if (catalog.sourceLicense !== 'CC BY-SA 3.0') {
    issues.push(`Unexpected catalog source license: ${String(catalog.sourceLicense)}`)
  }

  if (Number.isNaN(Date.parse(catalog.generatedAt))) {
    issues.push(`Invalid catalog generation timestamp: ${catalog.generatedAt}`)
  }

  for (const duplicate of findDuplicates(catalog.series.map((series) => series.id))) {
    issues.push(`Duplicate series ID: ${duplicate}`)
  }

  for (const duplicate of findDuplicates(catalog.teams.map((team) => team.id))) {
    issues.push(`Duplicate team ID: ${duplicate}`)
  }

  for (const duplicate of findDuplicates(catalog.editions.map((edition) => edition.id))) {
    issues.push(`Duplicate edition ID: ${duplicate}`)
  }

  for (const duplicate of findDuplicates(catalog.series.map((series) => series.name.toLocaleLowerCase('en-US')))) {
    issues.push(`Duplicate series name: ${duplicate}`)
  }

  for (const duplicate of findDuplicates(catalog.teams.map((team) => team.name.toLocaleLowerCase('en-US')))) {
    issues.push(`Duplicate team name: ${duplicate}`)
  }

  for (const series of catalog.series) {
    if (![series.id, series.name, series.shortName, series.organizer, series.sourceUrl].every(Boolean)) {
      issues.push(`Series ${series.id || '<missing ID>'} has incomplete metadata`)
    }
  }

  for (const team of catalog.teams) {
    if (!team.name.trim()) {
      issues.push(`Team ${team.id} is missing its display name`)
    }

    for (const duplicate of findDuplicates([team.name, ...team.aliases])) {
      issues.push(`Team ${team.id} repeats name or alias ${duplicate}`)
    }

    if (team.aliases.some((alias) => !alias.trim())) {
      issues.push(`Team ${team.id} has an empty alias`)
    }
  }

  for (const edition of catalog.editions) {
    if (!seriesIds.has(edition.seriesId)) {
      issues.push(`Edition ${edition.id} references unknown series ${edition.seriesId}`)
    }

    if (edition.year < 2010 || edition.year > 2100) {
      issues.push(`Edition ${edition.id} has invalid year ${edition.year}`)
    }

    if (edition.participants.length < 2) {
      issues.push(`Edition ${edition.id} has fewer than two participants`)
    }

    if (!edition.whyIncluded.trim()) {
      issues.push(`Edition ${edition.id} is missing its inclusion rationale`)
    }

    for (const duplicate of findDuplicates(edition.participants.map((participant) => participant.teamId))) {
      issues.push(`Edition ${edition.id} repeats participant ${duplicate}`)
    }

    for (const participant of edition.participants) {
      if (!teamIds.has(participant.teamId)) {
        issues.push(`Edition ${edition.id} references unknown team ${participant.teamId}`)
      }

      if (!participant.nameAtEvent.trim()) {
        issues.push(`Edition ${edition.id} has a participant without an event name`)
      }

      const team = teamById.get(participant.teamId)

      if (team && ![team.name, ...team.aliases].includes(participant.nameAtEvent)) {
        issues.push(
          `Edition ${edition.id} uses unregistered name ${participant.nameAtEvent} for team ${participant.teamId}`,
        )
      }
    }

    if (
      edition.source.pageId <= 0 ||
      edition.source.revisionId <= 0 ||
      Number.isNaN(Date.parse(edition.source.revisionTimestamp))
    ) {
      issues.push(`Edition ${edition.id} has invalid Liquipedia revision provenance`)
    }
  }

  return issues
}
