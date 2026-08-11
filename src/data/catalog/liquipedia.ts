export interface LiquipediaRevisionPage {
  pageId: number
  pageTitle: string
  revisionId: number
  revisionTimestamp: string
  wikitext: string
}

export interface ParsedLiquipediaEdition {
  name: string
  declaredTeamCount: number | null
  stageNames: readonly string[]
  teamNames: readonly string[]
}

export interface LiquipediaParticipantReview {
  expectedTeamCount: number
  excludedTeamNames?: readonly string[]
  teamNameReplacements?: Readonly<Record<string, string>>
}

function extractLevelTwoSection(wikitext: string, title: string): string | null {
  const lines = wikitext.split(/\r?\n/)
  const normalizedTitle = title.trim().toLocaleLowerCase('en-US')
  let collecting = false
  const sectionLines: string[] = []

  for (const line of lines) {
    const heading = /^==\s*([^=].*?[^=]?)\s*==\s*$/.exec(line)

    if (heading) {
      if (collecting) {
        break
      }

      collecting = heading[1]?.trim().toLocaleLowerCase('en-US') === normalizedTitle
      continue
    }

    if (collecting) {
      sectionLines.push(line)
    }
  }

  return collecting || sectionLines.length > 0 ? sectionLines.join('\n') : null
}

const canonicalStageOrder = [
  'Play-In Stage',
  'Group Stage',
  'Round Robin Stage',
  'Rumble Stage',
  'Swiss Stage',
  'Bracket Stage',
  'Knockout Stage',
  'Playoffs',
  'Round of 16',
  'Quarterfinal',
  'Semifinal',
  'Final',
] as const

type CanonicalStageName = (typeof canonicalStageOrder)[number]

function canonicalizeStageName(rawLabel: string): CanonicalStageName | null {
  const stageTemplate = /\{\{\s*Stage\s*\|\s*([^|}]+)/i.exec(rawLabel)
  const label = (stageTemplate?.[1] ?? rawLabel)
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')

  if (/^play[ -]?in(?: stage)?(?:\s*:\s*round \d+|\s+stage \d+)?$/.test(label)) {
    return 'Play-In Stage'
  }

  if (/^group stage(?: teams| matches)?$/.test(label)) {
    return 'Group Stage'
  }

  if (/^round robin(?: stage)?$/.test(label)) {
    return 'Round Robin Stage'
  }

  if (label === 'rumble stage') {
    return 'Rumble Stage'
  }

  if (/^swiss(?: stage)?$/.test(label)) {
    return 'Swiss Stage'
  }

  if (label === 'bracket stage') {
    return 'Bracket Stage'
  }

  if (label === 'knockout stage') {
    return 'Knockout Stage'
  }

  if (/^playoffs?$/.test(label)) {
    return 'Playoffs'
  }

  if (label === 'round of 16') {
    return 'Round of 16'
  }

  if (/^quarter[ -]?finals?$/.test(label)) {
    return 'Quarterfinal'
  }

  if (/^semi[ -]?finals?$/.test(label)) {
    return 'Semifinal'
  }

  if (/^(?:grand )?finals?$/.test(label)) {
    return 'Final'
  }

  return null
}

function collectStageLabels(section: string): readonly string[] {
  const labels: string[] = []
  const patterns = [
    /^={3,6}\s*(.+?)\s*={3,6}\s*$/gm,
    /^\*+\s*'''([^']+)'''/gm,
    /<!--\s*([^<>]+?)\s*-->/g,
    /^\s*\|(?:title|R\d+)\s*=\s*([^|\r\n]+)/gim,
  ]

  for (const pattern of patterns) {
    for (const match of section.matchAll(pattern)) {
      if (match[1]) {
        labels.push(match[1])
      }
    }
  }

  return labels
}

export function extractLiquipediaStageNames(wikitext: string): readonly string[] {
  const relevantSections = ['Overview', 'Format', 'Result', 'Results']
    .map((title) => extractLevelTwoSection(wikitext, title))
    .filter((section): section is string => section !== null)
  const stageNames = new Set(
    relevantSections
      .flatMap(collectStageLabels)
      .map(canonicalizeStageName)
      .filter((stageName): stageName is CanonicalStageName => stageName !== null),
  )

  if (stageNames.has('Knockout Stage')) {
    for (const knockoutRound of ['Quarterfinal', 'Semifinal', 'Final'] as const) {
      stageNames.add(knockoutRound)
    }
  }

  if (stageNames.size > 0) {
    stageNames.add('Final')
  }

  return canonicalStageOrder.filter((stageName) => stageNames.has(stageName))
}

function cleanWikitextValue(value: string): string | null {
  const cleaned = value
    .replace(/<!--.*?-->/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)]]/g, '$2')
    .replace(/\[\[([^\]]+)]]/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?39;/g, "'")
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    cleaned === '' ||
    /\{\{|}}/.test(cleaned) ||
    /^(?:tba|tbd|bye|unknown)$/i.test(cleaned)
  ) {
    return null
  }

  return cleaned
}

function extractFirstField(wikitext: string, field: string): string | null {
  const match = new RegExp(`^\\s*\\|${field}\\s*=\\s*(.+?)\\s*$`, 'im').exec(wikitext)
  return match?.[1] ? cleanWikitextValue(match[1]) : null
}

function extractTeamNames(participantsSection: string): readonly string[] {
  const activeParticipantsSection = participantsSection.split(
    /^(?:={3,}\s*Former Participants\s*={3,}|!+\s*Former Participants)\s*$/im,
    1,
  )[0]

  if (activeParticipantsSection === undefined) {
    return []
  }

  const candidates: string[] = []
  const patterns = [
    /\{\{\s*Opponent\s*\|\s*([^|{}\r\n]+)/gi,
    /^\s*\|team\s*=\s*([^|{}\r\n]+?)(?:\|[^\r\n]*)?\s*$/gim,
  ]

  for (const pattern of patterns) {
    for (const match of activeParticipantsSection.matchAll(pattern)) {
      const teamName = match[1] ? cleanWikitextValue(match[1]) : null

      if (teamName) {
        candidates.push(teamName)
      }
    }
  }

  const seen = new Set<string>()

  return candidates.filter((teamName) => {
    const key = teamName.toLocaleLowerCase('en-US')

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function parseLiquipediaEdition(
  wikitext: string,
  expectedTeamCountOverride?: number | null,
): ParsedLiquipediaEdition {
  const name = extractFirstField(wikitext, 'name')
  const participantsSection =
    extractLevelTwoSection(wikitext, 'Participating Teams') ??
    extractLevelTwoSection(wikitext, 'Participants')

  if (!name) {
    throw new Error('Liquipedia page is missing an infobox name')
  }

  if (!participantsSection) {
    throw new Error(`Liquipedia page "${name}" is missing a participant section`)
  }

  const teamNames = extractTeamNames(participantsSection)
  const stageNames = extractLiquipediaStageNames(wikitext)

  if (teamNames.length < 2) {
    throw new Error(`Liquipedia page "${name}" yielded fewer than two participant teams`)
  }

  const declaredTeamCountText = extractFirstField(wikitext, 'team_number')
  const declaredTeamCount = declaredTeamCountText ? Number.parseInt(declaredTeamCountText, 10) : null
  const expectedTeamCount =
    expectedTeamCountOverride === undefined ? declaredTeamCount : expectedTeamCountOverride

  if (expectedTeamCount !== null && expectedTeamCount !== teamNames.length) {
    throw new Error(
      `Liquipedia page "${name}" expects ${expectedTeamCount} teams but yielded ${teamNames.length}`,
    )
  }

  return {
    name,
    declaredTeamCount,
    stageNames,
    teamNames,
  }
}

export function applyLiquipediaParticipantReview(
  editionName: string,
  teamNames: readonly string[],
  review: LiquipediaParticipantReview,
): readonly string[] {
  const replacementNames = new Map(
    Object.entries(review.teamNameReplacements ?? {}).map(([name, replacement]) => [
      name.toLocaleLowerCase('en-US'),
      { name, replacement },
    ]),
  )
  const foundReplacementNames = new Set<string>()
  const correctedTeamNames = teamNames.map((name) => {
    const key = name.toLocaleLowerCase('en-US')
    const replacement = replacementNames.get(key)

    if (!replacement) {
      return name
    }

    foundReplacementNames.add(key)
    return replacement.replacement
  })
  const missingReplacementNames = [...replacementNames]
    .filter(([key]) => !foundReplacementNames.has(key))
    .map(([, replacement]) => replacement.name)

  if (missingReplacementNames.length > 0) {
    throw new Error(
      `Liquipedia page "${editionName}" no longer contains reviewed replacements: ${missingReplacementNames.join(', ')}`,
    )
  }

  const excludedNames = new Map(
    (review.excludedTeamNames ?? []).map((name) => [name.toLocaleLowerCase('en-US'), name]),
  )
  const foundExcludedNames = new Set<string>()
  const reviewedTeamNames = correctedTeamNames.filter((name) => {
    const key = name.toLocaleLowerCase('en-US')

    if (!excludedNames.has(key)) {
      return true
    }

    foundExcludedNames.add(key)
    return false
  })
  const missingExcludedNames = [...excludedNames]
    .filter(([key]) => !foundExcludedNames.has(key))
    .map(([, name]) => name)

  if (missingExcludedNames.length > 0) {
    throw new Error(
      `Liquipedia page "${editionName}" no longer contains reviewed exclusions: ${missingExcludedNames.join(', ')}`,
    )
  }

  if (reviewedTeamNames.length !== review.expectedTeamCount) {
    throw new Error(
      `Liquipedia page "${editionName}" expects ${review.expectedTeamCount} reviewed teams but yielded ${reviewedTeamNames.length}`,
    )
  }

  const duplicateTeamNames = reviewedTeamNames.filter(
    (name, index) =>
      reviewedTeamNames.findIndex(
        (candidate) => candidate.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
      ) !== index,
  )

  if (duplicateTeamNames.length > 0) {
    throw new Error(
      `Liquipedia page "${editionName}" has duplicate reviewed teams: ${duplicateTeamNames.join(', ')}`,
    )
  }

  return reviewedTeamNames
}

export function createStableCatalogId(label: string): string {
  const id = label
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  if (!id) {
    throw new Error(`Cannot create a stable catalog ID from "${label}"`)
  }

  return id
}
