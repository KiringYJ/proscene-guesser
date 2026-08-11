export interface CatalogSource {
  pageId: number
  pageTitle: string
  revisionId: number
  revisionTimestamp: string
  url: string
  note?: string
}

export interface InternationalSeries {
  id: string
  name: string
  shortName: string
  organizer: string
  sourceUrl: string
}

export interface InternationalTeam {
  id: string
  name: string
  aliases: readonly string[]
}

export interface InternationalParticipant {
  teamId: string
  nameAtEvent: string
}

export type CompetitionKind =
  | 'club_international'
  | 'club_international_qualifier'
  | 'club_cross_regional_challenge'
  | 'club_cross_regional_showcase'

export type TeamKind = 'organization'

export interface InternationalEdition {
  id: string
  seriesId: string
  year: number
  name: string
  competitionKind: CompetitionKind
  teamKind: TeamKind
  whyIncluded: string
  participants: readonly InternationalParticipant[]
  source: CatalogSource
}

export interface InternationalCatalog {
  schemaVersion: 1
  generatedAt: string
  sourceName: 'Liquipedia'
  sourceTermsUrl: string
  sourceLicense: 'CC BY-SA 3.0'
  sourceLicenseUrl: string
  series: readonly InternationalSeries[]
  teams: readonly InternationalTeam[]
  editions: readonly InternationalEdition[]
}
