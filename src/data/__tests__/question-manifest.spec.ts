import { describe, expect, it } from 'vitest'

import type { InternationalCatalog } from '@/data/catalog/types'
import {
  validateQuestionManifest,
  type DraftQuestionManifest,
  type PublishedQuestionManifest,
} from '@/data/question-manifest'

const catalog: InternationalCatalog = {
  schemaVersion: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  sourceName: 'Liquipedia',
  sourceTermsUrl: 'https://liquipedia.net/api-terms-of-use',
  sourceLicense: 'CC BY-SA 3.0',
  sourceLicenseUrl: 'https://liquipedia.net/commons/Help:Reusing_and_remixing_Liquipedia_content',
  series: [
    {
      id: 'worlds',
      name: 'World Championship',
      shortName: 'Worlds',
      organizer: 'Riot Games',
      sourceUrl: 'https://liquipedia.net/leagueoflegends/World_Championships',
    },
  ],
  teams: [
    { id: 'blue-team', name: 'Blue Team', aliases: [] },
    { id: 'red-team', name: 'Red Team', aliases: [] },
  ],
  editions: [
    {
      id: 'worlds-2024',
      seriesId: 'worlds',
      year: 2024,
      name: '2024 World Championship',
      competitionKind: 'club_international',
      teamKind: 'organization',
      whyIncluded: 'Test fixture.',
      participants: [
        { teamId: 'blue-team', nameAtEvent: 'Blue Team' },
        { teamId: 'red-team', nameAtEvent: 'Red Team' },
      ],
      source: {
        pageId: 1,
        pageTitle: 'World Championship/2024',
        revisionId: 2,
        revisionTimestamp: '2026-01-01T00:00:00.000Z',
        url: 'https://liquipedia.net/leagueoflegends/World_Championship/2024',
      },
    },
  ],
}

const publishedManifest: PublishedQuestionManifest = {
  schemaVersion: 1,
  id: 'q-7m4k2d9xrp6v',
  kind: 'production',
  status: 'published',
  catalogEditionId: 'worlds-2024',
  publicImage: 'q-7m4k2d9xrp6v.webp',
  imageAlt: 'A redacted broadcast frame.',
  archiveLabel: 'Archive',
  clue: 'Use the visible game state.',
  answer: {
    year: 2024,
    tournament: 'World Championship',
    stage: 'Final',
    blueTeam: 'Blue Team',
    redTeam: 'Red Team',
    gameNumber: 3,
  },
  choices: {
    years: [2023, 2024],
    tournaments: { source: 'international-series' },
    stages: ['Semifinal', 'Final'],
    teams: ['Blue Team', 'Red Team'],
    games: [1, 2, 3],
  },
  source: {
    label: 'Broadcast archive',
    url: 'https://example.com/match',
  },
}

describe('question manifest validation', () => {
  it('accepts a complete published manifest', () => {
    expect(
      validateQuestionManifest(publishedManifest, {
        expectedId: publishedManifest.id,
        catalog,
      }),
    ).toEqual([])
    expect(
      validateQuestionManifest(publishedManifest, { expectedId: publishedManifest.id }),
    ).toEqual([])
  })

  it('accepts a draft with an answer but no public presentation data', () => {
    const draft: DraftQuestionManifest = {
      schemaVersion: 1,
      id: 'q-1a3ad3vz4whk',
      kind: 'production',
      status: 'draft',
      catalogEditionId: 'worlds-2024',
      answer: publishedManifest.answer,
    }

    expect(validateQuestionManifest(draft, { expectedId: draft.id, catalog })).toEqual([])
  })

  it('rejects mismatched directories, catalog facts, and missing answer choices', () => {
    const invalid = {
      ...publishedManifest,
      id: 'worlds-2024-final',
      answer: {
        ...publishedManifest.answer,
        year: 2023,
        blueTeam: 'Unknown Team',
      },
      choices: {
        ...publishedManifest.choices,
        years: [2024],
        teams: ['Blue Team', 'Red Team'],
      },
    }
    const issues = validateQuestionManifest(invalid, {
      expectedId: publishedManifest.id,
      catalog,
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        'id must match ^q-[0-9a-hj-km-np-tv-z]{12}$',
        'answer.year does not match catalog edition worlds-2024',
        'answer.blueTeam is not a participant in worlds-2024',
        'choices.years does not include answer value 2023',
        'choices.teams does not include answer value Unknown Team',
      ]),
    )
  })

  it('requires attribution before a production question can be published', () => {
    const { source: _source, ...withoutSource } = publishedManifest

    expect(validateQuestionManifest(withoutSource, { catalog })).toContain(
      'source is required for a published production question',
    )
  })
})
