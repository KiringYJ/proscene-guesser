import { describe, expect, it } from 'vitest'

import {
  applyLiquipediaParticipantReview,
  createStableCatalogId,
  extractLiquipediaStageNames,
  parseLiquipediaEdition,
} from '@/data/catalog/liquipedia'
import {
  getInternationalEditionOptions,
  getInternationalTeamChoicesForEdition,
  getInternationalTeamNamesForEdition,
  internationalCatalog,
} from '@/data/catalog'
import { validateInternationalCatalog } from '@/data/catalog/validation'
import type { InternationalCatalog } from '@/data/catalog/types'

const revisionFixture = `
{{Infobox league
|name=Example International 2025
|team_number=3
}}

==Participating Teams==
{{TeamParticipants
|{{Opponent|Team Alpha
    |players={{Persons}}
}}
|{{Opponent|Team Beta
    |players={{Persons}}
}}
}}
{{TeamCard
|team=Team Gamma|link=Team Gamma (organization)
}}

===Former Participants===
{{TeamCard
|team=Withdrawn Team
}}

==Results==
===Group Stage===
|team1=alpha
|team2=beta
`

describe('parseLiquipediaEdition', () => {
  it('extracts participant display names without reading result shortcodes', () => {
    expect(parseLiquipediaEdition(revisionFixture)).toEqual({
      name: 'Example International 2025',
      declaredTeamCount: 3,
      stageNames: ['Group Stage', 'Final'],
      teamNames: ['Team Alpha', 'Team Beta', 'Team Gamma'],
    })
  })

  it('fails closed when the declared participant count does not match', () => {
    expect(() => parseLiquipediaEdition(revisionFixture.replace('|team_number=3', '|team_number=4')))
      .toThrow('expects 4 teams but yielded 3')
  })
})

describe('extractLiquipediaStageNames', () => {
  it('reads explicit result headings without treating format prose as extra stages', () => {
    const wikitext = `
==Format==
* '''Play-In Stage''' - Double elimination
** Teams play a double round robin before advancing to the bracket.
==Results==
==={{Stage|Bracket Stage}}===
==Trivia==
The domestic qualifier used a Swiss Stage and ended in a Quarterfinal.
`

    expect(extractLiquipediaStageNames(wikitext)).toEqual([
      'Play-In Stage',
      'Bracket Stage',
      'Final',
    ])
  })

  it('expands an explicit knockout stage into its playable rounds', () => {
    expect(
      extractLiquipediaStageNames(`
==Results==
===Knockout Stage===
`),
    ).toEqual(['Knockout Stage', 'Quarterfinal', 'Semifinal', 'Final'])
  })
})

describe('createStableCatalogId', () => {
  it('normalizes punctuation without discarding meaningful words', () => {
    expect(createStableCatalogId("Anyone's Legend & Friends")).toBe('anyones-legend-and-friends')
  })
})

describe('applyLiquipediaParticipantReview', () => {
  it('removes reviewed non-team cards and pins the resulting count', () => {
    expect(
      applyLiquipediaParticipantReview('Example Rift Rivals', ['Team Alpha', 'LCK', 'Team Beta'], {
        expectedTeamCount: 2,
        excludedTeamNames: ['LCK'],
      }),
    ).toEqual(['Team Alpha', 'Team Beta'])
  })

  it('fails closed when a reviewed exclusion disappears', () => {
    expect(() =>
      applyLiquipediaParticipantReview('Example Rift Rivals', ['Team Alpha', 'Team Beta'], {
        expectedTeamCount: 2,
        excludedTeamNames: ['LCK'],
      }),
    ).toThrow('no longer contains reviewed exclusions: LCK')
  })

  it('replaces a reviewed template shorthand with its display name', () => {
    expect(
      applyLiquipediaParticipantReview('Example First Stand', ['gen', 'Team Alpha'], {
        expectedTeamCount: 2,
        teamNameReplacements: { gen: 'Gen.G' },
      }),
    ).toEqual(['Gen.G', 'Team Alpha'])
  })
})

describe('validateInternationalCatalog', () => {
  it('reports broken cross-record references', () => {
    const catalog: InternationalCatalog = {
      schemaVersion: 1,
      generatedAt: '2026-08-11T00:00:00.000Z',
      sourceName: 'Liquipedia',
      sourceTermsUrl: 'https://liquipedia.net/api-terms-of-use',
      sourceLicense: 'CC BY-SA 3.0',
      sourceLicenseUrl:
        'https://liquipedia.net/commons/Help:Reusing_and_remixing_Liquipedia_content',
      series: [],
      teams: [],
      editions: [
        {
          id: 'example-2025',
          seriesId: 'example',
          year: 2025,
          name: 'Example International 2025',
          stages: ['Group Stage', 'Final'],
          competitionKind: 'club_international',
          teamKind: 'organization',
          whyIncluded: 'Professional organization teams from multiple competitive regions.',
          participants: [
            { teamId: 'alpha', nameAtEvent: 'Team Alpha' },
            { teamId: 'beta', nameAtEvent: 'Team Beta' },
          ],
          source: {
            pageId: 1,
            pageTitle: 'Example/2025',
            revisionId: 2,
            revisionTimestamp: '2026-08-11T00:00:00Z',
            url: 'https://example.com',
          },
        },
      ],
    }

    expect(validateInternationalCatalog(catalog)).toEqual([
      'Edition example-2025 references unknown series example',
      'Edition example-2025 references unknown team alpha',
      'Edition example-2025 references unknown team beta',
    ])
  })
})

describe('bundled international catalog', () => {
  it('is internally valid and carries revision provenance', () => {
    expect(validateInternationalCatalog(internationalCatalog)).toEqual([])
    expect(
      internationalCatalog.editions.every(
        (edition) => edition.source.pageId > 0 && edition.source.revisionId > 0,
      ),
    ).toBe(true)
  })

  it('includes historic club internationals and EWC without mixing selection-team events', () => {
    const editionIds = internationalCatalog.editions.map((edition) => edition.id)

    expect(editionIds).toEqual(
      expect.arrayContaining([
        'wcg-2010',
        'ipl-5',
        'iem-world-championship-2012',
        'iwci-2016',
        'rift-rivals-na-eu-2019',
        'ewc-2024',
      ]),
    )
    expect(editionIds.some((id) => /all-star|asian-games/.test(id))).toBe(false)
    expect(internationalCatalog.editions.every((edition) => edition.teamKind === 'organization'))
      .toBe(true)
  })

  it('uses the reviewed organization-team list for exceptional Rift Rivals pages', () => {
    expect(getInternationalTeamNamesForEdition('rift-rivals-na-eu-2018')).toEqual([
      '100 Thieves',
      'Echo Fox',
      'Fnatic',
      'G2 Esports',
      'Splyce',
      'Team Liquid',
    ])
    expect(getInternationalTeamNamesForEdition('rift-rivals-lck-lpl-lms-vcs-2019')).toHaveLength(12)
    expect(getInternationalTeamNamesForEdition('rift-rivals-lck-lpl-lms-vcs-2019')).not.toContain(
      'LCK',
    )
  })

  it('preserves edition-specific EWC participant names', () => {
    expect(getInternationalTeamNamesForEdition('ewc-2024')).toEqual([
      'Bilibili Gaming',
      'FlyQuest',
      'Fnatic',
      'G2 Esports',
      'Gen.G Esports',
      'T1',
      'Team Liquid',
      'Top Esports',
    ])
    expect(getInternationalTeamChoicesForEdition('ewc-2024')).toContainEqual({
      id: 'gen-g-esports',
      name: 'Gen.G Esports',
    })
  })

  it('uses edition names only when one year has multiple editions from a series', () => {
    const editionIds = internationalCatalog.editions
      .filter((edition) => edition.year === 2018)
      .map((edition) => edition.id)
    const options = getInternationalEditionOptions(editionIds, 2018)

    expect(options).toContainEqual({ title: 'World Championship', value: 'worlds-2018' })
    expect(options).toContainEqual({
      title: 'Rift Rivals 2018: NA vs EU',
      value: 'rift-rivals-na-eu-2018',
    })
    expect(options.some((option) => option.title === 'Rift Rivals')).toBe(false)
  })

  it('replaces Liquipedia template shortcodes with reviewed display names', () => {
    expect(getInternationalTeamNamesForEdition('first-stand-2026')).toContain('Gen.G')
    expect(getInternationalTeamNamesForEdition('first-stand-2026')).not.toContain('gen')
  })

  it('merges reviewed typography variants without changing event-specific names', () => {
    const istanbulWildcats = internationalCatalog.teams.filter((team) =>
      team.aliases.includes('İstanbul Wild Cats'),
    )

    expect(istanbulWildcats).toEqual([
      {
        id: 'istanbul-wildcats',
        name: 'İstanbul Wildcats',
        aliases: ['İstanbul Wild Cats'],
      },
    ])
    expect(getInternationalTeamNamesForEdition('msi-2021')).toContain('İstanbul Wild Cats')
  })
})
