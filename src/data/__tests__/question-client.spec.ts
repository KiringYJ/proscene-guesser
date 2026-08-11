import { describe, expect, it } from 'vitest'

import { internationalCatalog } from '@/data/catalog'
import { createClientQuestionRecord } from '@/data/question-client'
import type { PublishedQuestionManifest } from '@/data/question-manifest'

const publishedManifest: PublishedQuestionManifest = {
  catalogEditionId: 'worlds-2024',
  imageAlt: 'A redacted broadcast frame.',
  archiveLabel: 'Archive',
  clue: 'Use the visible game state.',
  answer: {
    year: 2024,
    tournament: 'World Championship',
    stage: 'Quarterfinal',
    blueTeam: 'Hanwha Life Esports',
    redTeam: 'Bilibili Gaming',
    gameNumber: 4,
  },
  choices: {
    years: [2023, 2024],
    tournaments: ['World Championship', 'Mid-Season Invitational'],
    games: [1, 2, 3, 4, 5],
  },
  source: {
    label: 'Broadcast archive',
    url: 'https://example.com/match',
  },
}

describe('client question records', () => {
  it('emits the selected edition and only editions in the configured year/event scope', () => {
    const record = createClientQuestionRecord(
      'q-7m4k2d9xrp6v',
      publishedManifest,
      internationalCatalog,
    )

    expect(record.catalogEditionId).toBe('worlds-2024')
    expect(record.catalogEditionIds).toEqual([
      'msi-2023',
      'worlds-2023',
      'msi-2024',
      'worlds-2024',
    ])
    expect(record.choices.stages).toEqual([
      'Play-In Stage',
      'Swiss Stage',
      'Knockout Stage',
      'Quarterfinal',
      'Semifinal',
      'Final',
    ])
    expect(record.choices.teams).toContain('Hanwha Life Esports')
    expect(record.choices.teams).toContain('Bilibili Gaming')
  })

  it('derives runtime identity and the public image filename', () => {
    const record = createClientQuestionRecord(
      'q-7m4k2d9xrp6v',
      publishedManifest,
      internationalCatalog,
    )

    expect(record.id).toBe('q-7m4k2d9xrp6v')
    expect(record.publicImage).toBe('q-7m4k2d9xrp6v.webp')
  })

  it('rejects a catalog-backed year with no allowed tournament edition', () => {
    const invalidScope = {
      ...publishedManifest,
      choices: {
        ...publishedManifest.choices,
        years: [2024, 2099],
      },
    }

    expect(() =>
      createClientQuestionRecord('q-7m4k2d9xrp6v', invalidScope, internationalCatalog),
    ).toThrow('catalog choice scope has no tournament for 2099')
  })
})
