import { describe, expect, it } from 'vitest'

import type { InternationalCatalog } from '@/data/catalog/types'
import {
  validatePublicQuestionImageInventory,
  validateQuestionManifest,
  type PublishedQuestionManifest,
  type QuestionManifest,
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
      stages: ['Semifinal', 'Final'],
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
  catalogEditionId: 'worlds-2024',
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
        catalog,
        published: true,
      }),
    ).toEqual([])
    expect(validateQuestionManifest(publishedManifest, { published: true })).toEqual([])
  })

  it('derives stage and team choices for a catalog-backed manifest', () => {
    const catalogBacked = {
      ...publishedManifest,
      choices: {
        years: publishedManifest.choices.years,
        tournaments: publishedManifest.choices.tournaments,
        games: publishedManifest.choices.games,
      },
    }

    expect(validateQuestionManifest(catalogBacked, { catalog })).toEqual([])
    expect(validateQuestionManifest(catalogBacked)).toEqual([])
  })

  it('accepts a draft with an answer but no public presentation data', () => {
    const draft: QuestionManifest = {
      catalogEditionId: 'worlds-2024',
      answer: publishedManifest.answer,
    }

    expect(validateQuestionManifest(draft, { catalog })).toEqual([])
  })

  it('rejects catalog facts and missing answer choices', () => {
    const invalid = {
      ...publishedManifest,
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
    const issues = validateQuestionManifest(invalid, { catalog, published: true })

    expect(issues).toEqual(
      expect.arrayContaining([
        'answer.year does not match catalog edition worlds-2024',
        'answer.blueTeam is not a participant in worlds-2024',
        'choices.years does not include answer value 2023',
        'choices.teams does not include answer value Unknown Team',
      ]),
    )
  })

  it('requires attribution before a production question can be published', () => {
    const { source: _source, ...withoutSource } = publishedManifest

    expect(validateQuestionManifest(withoutSource, { catalog, published: true })).toContain(
      'source is required for a published question',
    )
  })

  it('rejects legacy control fields instead of maintaining duplicate state', () => {
    const legacy = {
      ...publishedManifest,
      schemaVersion: 1,
      id: 'q-7m4k2d9xrp6v',
      kind: 'production',
      status: 'published',
      publicImage: 'q-7m4k2d9xrp6v.webp',
    }

    expect(validateQuestionManifest(legacy, { catalog, published: true })).toEqual(
      expect.arrayContaining([
        'manifest has unknown field schemaVersion',
        'manifest has unknown field id',
        'manifest has unknown field kind',
        'manifest has unknown field status',
        'manifest has unknown field publicImage',
      ]),
    )
  })

  it('rejects an answer stage outside the catalog edition', () => {
    const invalidStage = {
      ...publishedManifest,
      answer: {
        ...publishedManifest.answer,
        stage: 'Swiss Stage',
      },
      choices: {
        ...publishedManifest.choices,
        stages: ['Swiss Stage', 'Final'],
      },
    }

    expect(validateQuestionManifest(invalidStage, { catalog })).toContain(
      'answer.stage is not a stage in worlds-2024',
    )
  })

  it('rejects unknown tournament decoys for a catalog-backed question', () => {
    const invalidTournament = {
      ...publishedManifest,
      choices: {
        ...publishedManifest.choices,
        tournaments: ['World Championship', 'Imaginary Cup'],
      },
    }

    expect(validateQuestionManifest(invalidTournament, { catalog })).toContain(
      'choices.tournaments includes unknown catalog series Imaginary Cup',
    )
  })
})

describe('public question image inventory', () => {
  it('accepts derived WebP names and rejects orphaned or unsupported files', () => {
    expect(
      validatePublicQuestionImageInventory(
        ['README.md', 'q-7m4k2d9xrp6v.webp', 'q-1a3ad3vz4whk.webp', 'preview.png'],
        new Set(['q-7m4k2d9xrp6v']),
      ),
    ).toEqual([
      'public question image has no source directory: q-1a3ad3vz4whk.webp',
      'public question file must be an opaque question ID followed by .webp: preview.png',
    ])
  })
})
