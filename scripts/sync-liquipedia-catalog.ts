import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  applyLiquipediaParticipantReview,
  createStableCatalogId,
  parseLiquipediaEdition,
  type LiquipediaRevisionPage,
} from '../src/data/catalog/liquipedia.ts'
import type {
  CompetitionKind,
  InternationalCatalog,
  InternationalEdition,
  InternationalSeries,
  InternationalTeam,
} from '../src/data/catalog/types.ts'
import { validateInternationalCatalog } from '../src/data/catalog/validation.ts'

interface EditionDefinition {
  id: string
  seriesId: string
  year: number
  pageTitle: string
  competitionKind: CompetitionKind
  whyIncluded: string
  participantReview?: {
    expectedTeamCount: number
    excludedTeamNames?: readonly string[]
    teamNameReplacements?: Readonly<Record<string, string>>
    reason: string
  }
  stageReview?: {
    stages: readonly string[]
    reason: string
  }
}

interface MediaWikiRevision {
  revid: number
  timestamp: string
  slots: {
    main: {
      content: string
    }
  }
}

interface MediaWikiPage {
  pageid?: number
  title: string
  missing?: boolean
  revisions?: readonly MediaWikiRevision[]
}

interface MediaWikiResponse {
  error?: {
    code: string
    info: string
  }
  query?: {
    pages: readonly MediaWikiPage[]
  }
}

const LIQUIPEDIA_API_URL = 'https://liquipedia.net/leagueoflegends/api.php'
const LIQUIPEDIA_BASE_URL = 'https://liquipedia.net/leagueoflegends/'
const LIQUIPEDIA_TERMS_URL = 'https://liquipedia.net/api-terms-of-use'
const LIQUIPEDIA_LICENSE_URL =
  'https://liquipedia.net/commons/Help:Reusing_and_remixing_Liquipedia_content'
const DEFAULT_USER_AGENT =
  'ProSceneGuesser/0.1 (https://github.com/KiringYJ/proscene-guesser)'
const MAX_TITLES_PER_REQUEST = 40
const REQUEST_INTERVAL_MS = 2_100

interface TeamIdentityOverride {
  id: string
  name: string
}

const teamIdentityOverrideEntries: readonly (readonly [string, TeamIdentityOverride])[] = [
  ['İstanbul Wild Cats', { id: 'istanbul-wildcats', name: 'İstanbul Wildcats' }],
  ['İstanbul Wildcats', { id: 'istanbul-wildcats', name: 'İstanbul Wildcats' }],
  ['KING-ZONE DragonX', { id: 'kingzone-dragonx', name: 'Kingzone DragonX' }],
  ['Kingzone DragonX', { id: 'kingzone-dragonx', name: 'Kingzone DragonX' }],
]
const teamIdentityOverrides = new Map<string, TeamIdentityOverride>(
  teamIdentityOverrideEntries.map(([name, identity]) => [
    name.toLocaleLowerCase('en-US'),
    identity,
  ]),
)

const series = [
  {
    id: 'worlds',
    name: 'World Championship',
    shortName: 'Worlds',
    organizer: 'Riot Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}World_Championships`,
  },
  {
    id: 'msi',
    name: 'Mid-Season Invitational',
    shortName: 'MSI',
    organizer: 'Riot Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}Mid-Season_Invitational`,
  },
  {
    id: 'first-stand',
    name: 'First Stand Tournament',
    shortName: 'First Stand',
    organizer: 'Riot Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}First_Stand_Tournament`,
  },
  {
    id: 'ewc',
    name: 'Esports World Cup',
    shortName: 'EWC',
    organizer: 'Esports World Cup Foundation',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}Esports_World_Cup`,
  },
  {
    id: 'iem-world-championship',
    name: 'Intel Extreme Masters World Championship',
    shortName: 'IEM World Championship',
    organizer: 'ESL',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}Intel_Extreme_Masters`,
  },
  {
    id: 'ipl',
    name: 'IGN Pro League',
    shortName: 'IPL',
    organizer: 'IGN',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}IGN_ProLeague`,
  },
  {
    id: 'wcg',
    name: 'World Cyber Games',
    shortName: 'WCG',
    organizer: 'World Cyber Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}World_Cyber_Games`,
  },
  {
    id: 'international-wildcard',
    name: 'International Wildcard',
    shortName: 'IWC',
    organizer: 'Riot Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}International_Wildcard`,
  },
  {
    id: 'rift-rivals',
    name: 'Rift Rivals',
    shortName: 'Rift Rivals',
    organizer: 'Riot Games',
    sourceUrl: `${LIQUIPEDIA_BASE_URL}Rift_Rivals`,
  },
] as const satisfies readonly InternationalSeries[]

const globalClubReason =
  'Main event featuring professional organization teams from multiple competitive regions.'
const qualifierReason =
  'International qualifier featuring professional organization teams from multiple competitive regions.'
const crossRegionalReason =
  'Cross-regional challenge whose matches are played by professional organization teams.'

const worldsEditions: readonly EditionDefinition[] = [
  { id: 'worlds-2011', year: 2011, pageTitle: 'World Championship/2011' },
  { id: 'worlds-2012', year: 2012, pageTitle: 'World Championship/2012' },
  { id: 'worlds-2013', year: 2013, pageTitle: 'World Championship/2013' },
  ...Array.from({ length: 12 }, (_, index) => {
    const year = 2014 + index
    return { id: `worlds-${year}`, year, pageTitle: `World Championship/${year}` }
  }),
].map((edition) => ({
  ...edition,
  seriesId: 'worlds',
  competitionKind: 'club_international' as const,
  whyIncluded: globalClubReason,
}))

const msiYears = [2015, 2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025, 2026]
const msiEditions: readonly EditionDefinition[] = msiYears.map((year) => ({
  id: `msi-${year}`,
  seriesId: 'msi',
  year,
  pageTitle: `Mid-Season Invitational/${year}`,
  competitionKind: 'club_international',
  whyIncluded: globalClubReason,
}))

const currentInternationalEditions: readonly EditionDefinition[] = [
  {
    id: 'first-stand-2025',
    seriesId: 'first-stand',
    year: 2025,
    pageTitle: 'First Stand Tournament/2025',
  },
  {
    id: 'first-stand-2026',
    seriesId: 'first-stand',
    year: 2026,
    pageTitle: 'First Stand Tournament/2026',
    participantReview: {
      expectedTeamCount: 8,
      teamNameReplacements: { gen: 'Gen.G' },
      reason:
        'Liquipedia stores Gen.G as the team shorthand "gen" in this participant template; the reviewed display name is retained.',
    },
  },
  {
    id: 'ewc-2024',
    seriesId: 'ewc',
    year: 2024,
    pageTitle: 'Esports World Cup/2024',
  },
  {
    id: 'ewc-2025',
    seriesId: 'ewc',
    year: 2025,
    pageTitle: 'Esports World Cup/2025',
  },
  {
    id: 'ewc-2026',
    seriesId: 'ewc',
    year: 2026,
    pageTitle: 'Esports World Cup/2026',
  },
].map((edition) => ({
  ...edition,
  competitionKind: 'club_international' as const,
  whyIncluded: globalClubReason,
}))

const iemWorldChampionshipEditions: readonly EditionDefinition[] = [
  ['VI', 2012],
  ['VII', 2013],
  ['VIII', 2014],
  ['IX', 2015],
  ['X', 2016],
  ['XI', 2017],
].map(([season, year]) => ({
  id: `iem-world-championship-${year}`,
  seriesId: 'iem-world-championship',
  year: Number(year),
  pageTitle: `Intel Extreme Masters/Season ${season}/World Championship`,
  competitionKind: 'club_international',
  whyIncluded: globalClubReason,
}))

const oneOffEditions: readonly EditionDefinition[] = [
  {
    id: 'wcg-2010',
    seriesId: 'wcg',
    year: 2010,
    pageTitle: 'World Cyber Games/2010',
    competitionKind: 'club_international',
    whyIncluded: globalClubReason,
  },
  {
    id: 'ipl-5',
    seriesId: 'ipl',
    year: 2012,
    pageTitle: 'IGN ProLeague/Season 5',
    competitionKind: 'club_international',
    whyIncluded: globalClubReason,
  },
]

const wildcardEditions: readonly EditionDefinition[] = [
  ['iwcq-2013', 2013, 'International Wildcard Qualifier/2013'],
  ['iwct-gamescom-2014', 2014, 'International Wildcard Tournament/Gamescom/2014'],
  ['iwct-pax-2014', 2014, 'International Wildcard Tournament/PAX/2014'],
  ['iwci-2015', 2015, 'International Wildcard Invitational/2015'],
  ['iwct-turkey-2015', 2015, 'International Wildcard Tournament/2015/Turkey'],
  ['iwct-chile-2015', 2015, 'International Wildcard Tournament/2015/Chile'],
  ['iwci-2016', 2016, 'International Wildcard/2016/Invitational'],
  ['iwcq-2016', 2016, 'International Wildcard Qualifier/2016'],
].map(([id, year, pageTitle]) => {
  const definition: EditionDefinition = {
    id: String(id),
    seriesId: 'international-wildcard',
    year: Number(year),
    pageTitle: String(pageTitle),
    competitionKind: 'club_international_qualifier',
    whyIncluded: qualifierReason,
  }

  if (id === 'iwct-chile-2015') {
    definition.participantReview = {
      expectedTeamCount: 3,
      reason:
        'Liquipedia declares four teams in the infobox but lists three teams in the reviewed main-event participant section.',
    }
  }

  if (id === 'iwct-pax-2014') {
    definition.stageReview = {
      stages: ['Final'],
      reason:
        'Liquipedia records this two-team event as one unlabeled best-of-five match; the reviewed match is the final.',
    }
  }

  return definition
})

const riftRivalsRegionsByYear = new Map<number, readonly string[]>([
  [2017, ['NA-EU', 'LLN-CLS-CBLOL', 'LCL-TCL', 'GPL-LJL-OPL', 'LCK-LPL-LMS']],
  [2018, ['NA-EU', 'LLN-CLS-CBLOL', 'LCL-TCL-VCS', 'SEA-LJL-OPL', 'LCK-LPL-LMS']],
  [2019, ['NA-EU', 'LCK-LPL-LMS-VCS']],
])
const riftRivalsParticipantCounts = new Map<string, number>([
  ['2017:NA-EU', 6],
  ['2017:LLN-CLS-CBLOL', 6],
  ['2017:LCL-TCL', 8],
  ['2017:GPL-LJL-OPL', 9],
  ['2017:LCK-LPL-LMS', 12],
  ['2018:NA-EU', 6],
  ['2018:LLN-CLS-CBLOL', 6],
  ['2018:LCL-TCL-VCS', 9],
  ['2018:SEA-LJL-OPL', 9],
  ['2018:LCK-LPL-LMS', 12],
  ['2019:NA-EU', 6],
  ['2019:LCK-LPL-LMS-VCS', 12],
])
const riftRivalsExcludedTeamNames = new Map<string, readonly string[]>([
  [
    '2018:NA-EU',
    [
      'Levi & Brandini',
      'Wunder & Perkz',
      'Huni & Adrian',
      'Kobbe & kaSing',
      'Doublelift & Olleh',
      'Caps & Bwipo',
      'Hjarnan & Wadid',
      'Cody Sun & aphromoo',
      'Altec & Adrian',
      'Bwipo & Hylissang',
    ],
  ],
  ['2019:LCK-LPL-LMS-VCS', ['LCK']],
])
const riftRivalsEditions: readonly EditionDefinition[] = [...riftRivalsRegionsByYear].flatMap(
  ([year, regions]) =>
    regions.map((regionsId) => {
      const reviewKey = `${year}:${regionsId}`
      const expectedTeamCount = riftRivalsParticipantCounts.get(reviewKey)

      if (expectedTeamCount === undefined) {
        throw new Error(`Missing reviewed Rift Rivals participant count for ${reviewKey}`)
      }

      return {
        id: `rift-rivals-${regionsId.toLocaleLowerCase('en-US')}-${year}`,
        seriesId: 'rift-rivals',
        year,
        pageTitle: `Rift Rivals/${regionsId}/${year}`,
        competitionKind: 'club_cross_regional_challenge',
        whyIncluded: crossRegionalReason,
        participantReview: {
          expectedTeamCount,
          excludedTeamNames: riftRivalsExcludedTeamNames.get(reviewKey),
          reason:
            'Liquipedia infobox counts describe regional-result structure inconsistently; the organization-team participant cards and exclusions were reviewed for this edition.',
        },
      } satisfies EditionDefinition
    }),
)

const editionDefinitions: readonly EditionDefinition[] = [
  ...worldsEditions,
  ...msiEditions,
  ...currentInternationalEditions,
  ...iemWorldChampionshipEditions,
  ...oneOffEditions,
  ...wildcardEditions,
  ...riftRivalsEditions,
]

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

function createPageUrl(pageTitle: string): string {
  const encodedTitle = pageTitle
    .split('/')
    .map((part) => encodeURIComponent(part.replaceAll(' ', '_')))
    .join('/')

  return `${LIQUIPEDIA_BASE_URL}${encodedTitle}`
}

function resolveTeamIdentity(nameAtEvent: string): TeamIdentityOverride {
  return (
    teamIdentityOverrides.get(nameAtEvent.toLocaleLowerCase('en-US')) ?? {
      id: createStableCatalogId(nameAtEvent),
      name: nameAtEvent,
    }
  )
}

async function fetchRevisionPages(pageTitles: readonly string[]): Promise<readonly LiquipediaRevisionPage[]> {
  const parameters = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    prop: 'revisions',
    redirects: '1',
    rvprop: 'ids|timestamp|content',
    rvslots: 'main',
    titles: pageTitles.join('|'),
  })
  const response = await fetch(`${LIQUIPEDIA_API_URL}?${parameters}`, {
    headers: {
      'User-Agent': process.env.LIQUIPEDIA_USER_AGENT ?? DEFAULT_USER_AGENT,
    },
    signal: AbortSignal.timeout(60_000),
  })

  if (!response.ok) {
    throw new Error(`Liquipedia request failed with HTTP ${response.status}`)
  }

  const payload = (await response.json()) as MediaWikiResponse

  if (payload.error) {
    throw new Error(`Liquipedia API ${payload.error.code}: ${payload.error.info}`)
  }

  if (!payload.query) {
    throw new Error('Liquipedia response did not contain query results')
  }

  const missingPages = payload.query.pages.filter(
    (page) => page.missing || page.pageid === undefined || !page.revisions?.[0],
  )

  if (missingPages.length > 0) {
    throw new Error(
      `Liquipedia pages are missing or have no readable revision: ${missingPages
        .map((page) => page.title)
        .join(', ')}`,
    )
  }

  return payload.query.pages.map((page) => {
    const revision = page.revisions?.[0]

    if (page.pageid === undefined || !revision) {
      throw new Error(`Liquipedia page passed validation without a readable revision: ${page.title}`)
    }

    return {
      pageId: page.pageid,
      pageTitle: page.title,
      revisionId: revision.revid,
      revisionTimestamp: revision.timestamp,
      wikitext: revision.slots.main.content,
    }
  })
}

async function fetchAllRevisionPages(): Promise<readonly LiquipediaRevisionPage[]> {
  const titleChunks = chunk(
    editionDefinitions.map((edition) => edition.pageTitle),
    MAX_TITLES_PER_REQUEST,
  )
  const pages: LiquipediaRevisionPage[] = []

  for (const [index, titles] of titleChunks.entries()) {
    if (index > 0) {
      await delay(REQUEST_INTERVAL_MS)
    }

    console.error(`Fetching Liquipedia revision batch ${index + 1}/${titleChunks.length}...`)
    pages.push(...(await fetchRevisionPages(titles)))
  }

  return pages
}

function buildCatalog(revisionPages: readonly LiquipediaRevisionPage[]): InternationalCatalog {
  const pageByTitle = new Map(
    revisionPages.map((page) => [page.pageTitle.toLocaleLowerCase('en-US'), page]),
  )
  const teamNameById = new Map<string, string>()
  const aliasesByTeamId = new Map<string, Set<string>>()
  const editions: InternationalEdition[] = editionDefinitions.map((definition) => {
    const page = pageByTitle.get(definition.pageTitle.toLocaleLowerCase('en-US'))

    if (!page) {
      throw new Error(`Liquipedia response omitted ${definition.pageTitle}`)
    }

    const parsed = parseLiquipediaEdition(
      page.wikitext,
      definition.participantReview ? null : undefined,
    )
    const teamNames = definition.participantReview
      ? applyLiquipediaParticipantReview(parsed.name, parsed.teamNames, definition.participantReview)
      : parsed.teamNames
    const participants = teamNames.map((nameAtEvent) => {
      const identity = resolveTeamIdentity(nameAtEvent)
      const teamId = identity.id
      const existingName = teamNameById.get(teamId)

      if (existingName && existingName !== nameAtEvent) {
        const aliases = aliasesByTeamId.get(teamId) ?? new Set<string>()
        aliases.add(nameAtEvent)
        aliasesByTeamId.set(teamId, aliases)
      } else {
        teamNameById.set(teamId, identity.name)
      }

      if (identity.name !== nameAtEvent) {
        const aliases = aliasesByTeamId.get(teamId) ?? new Set<string>()
        aliases.add(nameAtEvent)
        aliasesByTeamId.set(teamId, aliases)
      }

      return { teamId, nameAtEvent }
    })
    const reviewNotes = [
      definition.participantReview?.reason,
      definition.stageReview?.reason,
    ].filter((note): note is string => note !== undefined)

    return {
      id: definition.id,
      seriesId: definition.seriesId,
      year: definition.year,
      name: parsed.name,
      stages: definition.stageReview?.stages ?? parsed.stageNames,
      competitionKind: definition.competitionKind,
      teamKind: 'organization',
      whyIncluded: definition.whyIncluded,
      participants,
      source: {
        pageId: page.pageId,
        pageTitle: page.pageTitle,
        revisionId: page.revisionId,
        revisionTimestamp: page.revisionTimestamp,
        url: createPageUrl(page.pageTitle),
        ...(reviewNotes.length > 0 ? { note: reviewNotes.join(' ') } : {}),
      },
    }
  })
  const teams: InternationalTeam[] = [...teamNameById]
    .map(([id, name]) => ({
      id,
      name,
      aliases: [...(aliasesByTeamId.get(id) ?? [])].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  const catalog: InternationalCatalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceName: 'Liquipedia',
    sourceTermsUrl: LIQUIPEDIA_TERMS_URL,
    sourceLicense: 'CC BY-SA 3.0',
    sourceLicenseUrl: LIQUIPEDIA_LICENSE_URL,
    series,
    teams,
    editions: editions.sort((left, right) => left.year - right.year || left.name.localeCompare(right.name)),
  }
  const issues = validateInternationalCatalog(catalog)

  if (issues.length > 0) {
    throw new Error(`Generated catalog is invalid:\n- ${issues.join('\n- ')}`)
  }

  return catalog
}

async function main(): Promise<void> {
  const revisionPages = await fetchAllRevisionPages()
  const catalog = buildCatalog(revisionPages)
  const scriptDirectory = dirname(fileURLToPath(import.meta.url))
  const outputPath = resolve(scriptDirectory, '../src/data/catalog/international-catalog.json')

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.error(
    `Wrote ${catalog.editions.length} editions and ${catalog.teams.length} team names to ${outputPath}`,
  )
}

await main()
