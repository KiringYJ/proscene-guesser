import { describe, expect, it } from 'vitest'

import { internationalCatalog } from '@/data/catalog'
import { createGeneratedLocalQuestionBundle } from '@/data/question-client'
import type { PublishedQuestionManifest } from '@/data/question-manifest'
import { createLocalQuestionBundle } from '@/data/questions'

const publishedManifest: PublishedQuestionManifest = {
  pool: 'classic',
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

describe('local question bundle projection', () => {
  it('emits the selected edition and only editions in the configured year/event scope', () => {
    const bundle = createGeneratedLocalQuestionBundle(
      'q-7m4k2d9xrp6v',
      publishedManifest,
      internationalCatalog,
    )

    expect(bundle.disclosure.solution.catalogEditionId).toBe('worlds-2024')
    expect(bundle.prompt.catalogEditionIds).toEqual([
      'msi-2023',
      'worlds-2023',
      'msi-2024',
      'worlds-2024',
    ])
    expect(bundle.prompt.choices.stages).toEqual([
      'Play-In Stage',
      'Swiss Stage',
      'Knockout Stage',
      'Quarterfinal',
      'Semifinal',
      'Final',
    ])
    expect(bundle.prompt.choices.teams).toContain('Hanwha Life Esports')
    expect(bundle.prompt.choices.teams).toContain('Bilibili Gaming')
  })

  it('keeps solution and source fields out of the pre-reveal prompt', () => {
    const generated = createGeneratedLocalQuestionBundle(
      'q-7m4k2d9xrp6v',
      publishedManifest,
      internationalCatalog,
    )
    const runtime = createLocalQuestionBundle(generated, '/base/')

    expect(runtime.prompt.id).toBe('q-7m4k2d9xrp6v')
    expect(runtime.prompt.pool).toBe('classic')
    expect(runtime.prompt.image).toBe('/base/questions/q-7m4k2d9xrp6v.webp')
    expect(runtime.prompt).not.toHaveProperty('answer')
    expect(runtime.prompt).not.toHaveProperty('solution')
    expect(runtime.prompt).not.toHaveProperty('source')
    expect(runtime.disclosure.solution.answer).toEqual(publishedManifest.answer)
    expect(runtime.disclosure.source).toEqual(publishedManifest.source)
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
      createGeneratedLocalQuestionBundle(
        'q-7m4k2d9xrp6v',
        invalidScope,
        internationalCatalog,
      ),
    ).toThrow('catalog choice scope has no tournament for 2099')
  })
})
