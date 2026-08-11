import { describe, expect, it } from 'vitest'

import type { InternationalCatalog } from '@/data/catalog/types'
import {
  validateQuestionManifest,
  type QuestionManifest,
  type ReadyQuestionManifest,
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

const readyManifest: ReadyQuestionManifest = {
  pool: 'classic',
  catalogEditionId: 'worlds-2024',
  imageAlt: 'A redacted broadcast frame.',
  archiveLabel: 'Archive',
  clue: 'Use the visible game state.',
  answer: {
    stage: 'Final',
    blueTeamId: 'blue-team',
    redTeamId: 'red-team',
    gameNumber: 3,
  },
  choices: {
    years: [2023, 2024],
    tournaments: { source: 'international-series' },
    games: [1, 2, 3],
  },
  source: {
    label: 'Broadcast archive',
    url: 'https://example.com/match',
  },
  rights: {
    reviewedAt: '2026-01-01',
    evidence: 'Permission record RIGHTS-001',
  },
}

describe('question manifest validation', () => {
  it('accepts a complete ready manifest', () => {
    expect(
      validateQuestionManifest(readyManifest, {
        catalog,
        ready: true,
      }),
    ).toEqual([])
    expect(validateQuestionManifest(readyManifest, { ready: true })).toEqual([])
  })

  it('derives stage and team choices for a catalog-backed manifest', () => {
    const catalogBacked = {
      ...readyManifest,
      choices: {
        years: readyManifest.choices.years,
        tournaments: readyManifest.choices.tournaments,
        games: readyManifest.choices.games,
      },
    }

    expect(validateQuestionManifest(catalogBacked, { catalog })).toEqual([])
    expect(validateQuestionManifest(catalogBacked)).toEqual([])
  })

  it('accepts a draft with an answer but no public presentation data', () => {
    const draft: QuestionManifest = {
      pool: 'deep-cut',
      catalogEditionId: 'worlds-2024',
      answer: readyManifest.answer,
    }

    expect(validateQuestionManifest(draft, { catalog })).toEqual([])
  })

  it('rejects catalog references and missing answer choices', () => {
    const invalid = {
      ...readyManifest,
      answer: {
        ...readyManifest.answer,
        blueTeamId: 'unknown-team',
      },
      choices: {
        ...readyManifest.choices,
        years: [2023],
      },
    }
    const issues = validateQuestionManifest(invalid, { catalog, ready: true })

    expect(issues).toEqual(
      expect.arrayContaining([
        'answer.blueTeamId references a team outside catalog edition worlds-2024',
        'choices.years does not include catalog edition year 2024',
      ]),
    )
  })

  it('rejects legacy names and duplicated catalog facts in a normalized answer', () => {
    const legacyAnswer = {
      ...readyManifest,
      answer: {
        ...readyManifest.answer,
        year: 2024,
        tournament: 'World Championship',
        blueTeam: 'Blue Team',
        redTeam: 'Red Team',
      },
    }

    expect(validateQuestionManifest(legacyAnswer, { catalog })).toEqual(
      expect.arrayContaining([
        'answer has unknown field year',
        'answer has unknown field tournament',
        'answer has unknown field blueTeam',
        'answer has unknown field redTeam',
      ]),
    )
  })

  it('rejects legacy control fields instead of maintaining duplicate state', () => {
    const legacy = {
      ...readyManifest,
      schemaVersion: 2,
      id: 'q-7m4k2d9xrp6v',
      kind: 'production',
      status: 'published',
      publicImage: 'q-7m4k2d9xrp6v.webp',
    }

    expect(validateQuestionManifest(legacy, { catalog, ready: true })).toEqual(
      expect.arrayContaining([
        'manifest has unknown field schemaVersion',
        'manifest has unknown field id',
        'manifest has unknown field kind',
        'manifest has unknown field status',
        'manifest has unknown field publicImage',
      ]),
    )
  })

  it('requires membership in one of the two question pools', () => {
    const { pool: _pool, ...missingPool } = readyManifest

    expect(validateQuestionManifest(missingPool, { catalog })).toContain(
      'pool must be classic or deep-cut',
    )
    expect(
      validateQuestionManifest({ ...readyManifest, pool: 'featured' }, { catalog }),
    ).toContain('pool must be classic or deep-cut')
  })

  it('keeps non-catalog questions self-contained with explicit local team IDs', () => {
    const staticQuestion: ReadyQuestionManifest = {
      pool: 'deep-cut',
      imageAlt: 'A synthetic broadcast frame.',
      archiveLabel: 'Synthetic archive',
      clue: 'Use the visible game state.',
      answer: {
        year: 2024,
        tournament: 'Example Invitational',
        stage: 'Final',
        blueTeamId: 'blue-comets',
        redTeamId: 'crimson-foxes',
        gameNumber: 3,
      },
      choices: {
        years: [2023, 2024],
        tournaments: ['Example Invitational'],
        stages: ['Semifinal', 'Final'],
        teams: [
          { id: 'blue-comets', name: 'Blue Comets' },
          { id: 'crimson-foxes', name: 'Crimson Foxes' },
        ],
        games: [1, 2, 3],
      },
      source: {
        label: 'Synthetic test fixture',
        url: 'https://example.com/fixture',
      },
      rights: {
        reviewedAt: '2026-01-01',
        evidence: 'Test-only fixture',
      },
    }

    expect(validateQuestionManifest(staticQuestion, { ready: true })).toEqual([])
  })

  it('requires attribution and a rights review before playability', () => {
    const withoutSource = { ...readyManifest, source: undefined }
    const withoutRights = { ...readyManifest, rights: undefined }

    expect(validateQuestionManifest(withoutSource, { catalog, ready: true })).toContain(
      'source is required for a ready question',
    )
    expect(validateQuestionManifest(withoutRights, { catalog, ready: true })).toContain(
      'rights review is required for a ready question',
    )
  })

  it('rejects an answer stage outside the catalog edition', () => {
    const invalidStage = {
      ...readyManifest,
      answer: {
        ...readyManifest.answer,
        stage: 'Swiss Stage',
      },
      choices: {
        ...readyManifest.choices,
        stages: ['Swiss Stage', 'Final'],
      },
    }

    expect(validateQuestionManifest(invalidStage, { catalog })).toContain(
      'answer.stage is not a stage in worlds-2024',
    )
  })

  it('rejects unknown tournament decoys for a catalog-backed question', () => {
    const invalidTournament = {
      ...readyManifest,
      choices: {
        ...readyManifest.choices,
        tournaments: ['World Championship', 'Imaginary Cup'],
      },
    }

    expect(validateQuestionManifest(invalidTournament, { catalog })).toContain(
      'choices.tournaments includes unknown catalog series Imaginary Cup',
    )
  })

  it('rejects a normalized but nonexistent rights-review date', () => {
    const invalidDate = {
      ...readyManifest,
      rights: {
        ...readyManifest.rights,
        reviewedAt: '2026-02-31',
      },
    }

    expect(validateQuestionManifest(invalidDate, { catalog })).toContain(
      'rights.reviewedAt must be a valid YYYY-MM-DD date',
    )
  })

})
