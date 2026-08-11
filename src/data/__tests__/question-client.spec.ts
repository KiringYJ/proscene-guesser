import { describe, expect, it } from 'vitest'

import { internationalCatalog } from '@/data/catalog'
import { createGeneratedLocalQuestionBundle } from '@/data/question-client'
import type {
  QuestionManifest,
  ReadyQuestionManifest,
} from '@/data/question-manifest'
import { materializePlayableQuestionManifest } from '@/data/playable-question'

const readyManifest: ReadyQuestionManifest = {
  pool: 'classic',
  catalogEditionId: 'worlds-2024',
  imageAlt: 'A redacted broadcast frame.',
  archiveLabel: 'Archive',
  clue: 'Use the visible game state.',
  answer: {
    stage: 'Quarterfinal',
    blueTeamId: 'hanwha-life-esports',
    redTeamId: 'bilibili-gaming',
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
  rights: {
    reviewedAt: '2026-08-11',
    evidence: 'Permission record RIGHTS-001',
  },
}

const staticManifest: ReadyQuestionManifest = {
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
    years: [2024],
    tournaments: ['Example Invitational'],
    stages: ['Final'],
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
    reviewedAt: '2026-08-11',
    evidence: 'Test-only fixture',
  },
}

describe('local question bundle projection', () => {
  it('resolves stable catalog IDs into the selected answer and scoped choices', () => {
    const bundle = createGeneratedLocalQuestionBundle(
      'q-7m4k2d9xrp6v',
      readyManifest,
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
    expect(bundle.disclosure.solution.answer).toEqual({
      year: 2024,
      tournament: 'World Championship',
      stage: 'Quarterfinal',
      blueTeamId: 'hanwha-life-esports',
      redTeamId: 'bilibili-gaming',
      gameNumber: 4,
    })
    expect(bundle.prompt.choices.teams).toContainEqual({
      id: 'hanwha-life-esports',
      name: 'Hanwha Life Esports',
    })
    expect(bundle.prompt.choices.teams).toContainEqual({
      id: 'bilibili-gaming',
      name: 'Bilibili Gaming',
    })
  })

  it('keeps curation, solution, source, and rights fields out of the pre-reveal prompt', () => {
    const generated = createGeneratedLocalQuestionBundle(
      'q-7m4k2d9xrp6v',
      readyManifest,
      internationalCatalog,
    )

    expect(generated.prompt.id).toBe('q-7m4k2d9xrp6v')
    expect(generated.prompt).not.toHaveProperty('pool')
    expect(generated.prompt).not.toHaveProperty('publicImage')
    expect(generated.prompt).not.toHaveProperty('answer')
    expect(generated.prompt).not.toHaveProperty('solution')
    expect(generated.prompt).not.toHaveProperty('source')
    expect(generated.disclosure.source).toEqual(readyManifest.source)
    expect(generated).not.toHaveProperty('rights')
    expect(JSON.stringify(generated)).not.toContain('"pool"')
    expect(JSON.stringify(generated)).not.toContain('Permission record RIGHTS-001')
  })

  it('preserves explicit IDs and labels for a non-catalog question', () => {
    const bundle = createGeneratedLocalQuestionBundle(
      'q-9n7m5k3j1h2g',
      staticManifest,
      internationalCatalog,
    )

    expect(bundle.disclosure.solution.answer).toEqual(staticManifest.answer)
    expect(bundle.prompt.choices.teams).toEqual(staticManifest.choices.teams)
    expect(bundle.prompt).not.toHaveProperty('catalogEditionIds')
    expect(bundle.disclosure.solution).not.toHaveProperty('catalogEditionId')
  })

  it('materializes safe presentation and choice defaults for a catalog question', () => {
    const minimalManifest: QuestionManifest = {
      pool: 'classic',
      catalogEditionId: 'worlds-2017',
      answer: {
        stage: 'Group Stage',
        blueTeamId: 'edward-gaming',
        redTeamId: 'sk-telecom-t1',
        gameNumber: 1,
      },
      source: readyManifest.source,
      rights: readyManifest.rights,
    }
    const playable = materializePlayableQuestionManifest(
      'q-1a3ad3vz4whk',
      minimalManifest,
      internationalCatalog,
    )

    expect(playable.archiveLabel).toBe('Pro match archive')
    expect(playable.imageAlt).toContain('redacted professional League of Legends')
    expect(playable.choices.games).toEqual([1, 2, 3, 4, 5])
    expect(playable.choices.years).toContain(2017)
    expect(playable.choices.tournaments).toEqual({ source: 'international-series' })
  })

  it('rejects a catalog-backed year with no allowed tournament edition', () => {
    const invalidScope = {
      ...readyManifest,
      choices: {
        ...readyManifest.choices,
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
