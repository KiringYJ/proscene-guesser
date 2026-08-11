import { describe, expect, it } from 'vitest'

import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import {
  createSoloGameSelection,
  getSoloGameAvailability,
} from '@/game/local/solo-game-selection'
import { QUICK_PLAY_CONFIG, type SoloGameConfig } from '@/game/solo'

function makeBundle(id: string): LocalQuestionBundle {
  return {
    prompt: {
      id,
      image: `/questions/${id}.webp`,
      imageAlt: 'A redacted broadcast frame.',
      archiveLabel: id,
      clue: 'Use the visible game state.',
      choices: {
        years: [2024],
        tournaments: ['World Championship'],
        stages: ['Final'],
        teams: [
          { id: 'blue-comets', name: 'Blue Comets' },
          { id: 'red-meteors', name: 'Red Meteors' },
        ],
        games: [1],
      },
    },
    disclosure: {
      solution: {
        answer: {
          year: 2024,
          tournament: 'World Championship',
          stage: 'Final',
          blueTeamId: 'blue-comets',
          redTeamId: 'red-meteors',
          gameNumber: 1,
        },
      },
    },
  }
}

const catalog = [
  makeBundle('q-000000000001'),
  makeBundle('q-000000000002'),
  makeBundle('q-000000000003'),
  makeBundle('q-000000000004'),
  makeBundle('q-000000000005'),
  makeBundle('q-000000000006'),
]

describe('solo game selection', () => {
  it('uses five requested rounds and 90 seconds for Quick Play', () => {
    expect(QUICK_PLAY_CONFIG).toEqual({
      rounds: 5,
      timerSeconds: 90,
    })
  })

  it('reports availability for the complete catalog without exposing curation groups', () => {
    expect(getSoloGameAvailability(catalog)).toEqual({
      total: 6,
    })
  })

  it('selects unique questions from the complete catalog with an injected random source', () => {
    const config: SoloGameConfig = {
      rounds: 5,
      timerSeconds: 60,
    }
    const selection = createSoloGameSelection(catalog, config, () => 0)
    const ids = selection.bundles.map((bundle) => bundle.prompt.id)

    expect(ids).toEqual([
      'q-000000000002',
      'q-000000000003',
      'q-000000000004',
      'q-000000000005',
      'q-000000000006',
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(selection.plan).toMatchObject({
      config,
      eligibleQuestionCount: 6,
      roundCount: 5,
      constrainedByAvailability: false,
    })
  })

  it('uses every question exactly once for All', () => {
    const selection = createSoloGameSelection(
      catalog,
      { rounds: 'all', timerSeconds: 'none' },
      () => 0.5,
    )

    expect(selection.bundles).toHaveLength(6)
    expect(new Set(selection.bundles.map((bundle) => bundle.prompt.id)).size).toBe(6)
    expect(selection.plan.constrainedByAvailability).toBe(false)
  })

  it('ignores an injected legacy pool value and still uses the complete catalog', () => {
    const config = {
      pool: 'classic',
      rounds: 'all',
      timerSeconds: 'none',
    } as const satisfies SoloGameConfig & { pool: string }
    const selection = createSoloGameSelection(catalog, config, () => 0.5)

    expect(selection.bundles).toHaveLength(catalog.length)
    expect(new Set(selection.bundles.map((bundle) => bundle.prompt.id)).size).toBe(catalog.length)
    expect(selection.plan.config).toEqual({ rounds: 'all', timerSeconds: 'none' })
    expect(selection.plan.config).not.toHaveProperty('pool')
  })

  it('returns an empty selection when there are no playable questions', () => {
    const selection = createSoloGameSelection(
      [],
      { rounds: 5, timerSeconds: 90 },
      () => 0,
    )

    expect(selection.bundles).toEqual([])
    expect(selection.plan).toMatchObject({
      eligibleQuestionCount: 0,
      roundCount: 0,
      constrainedByAvailability: true,
    })
  })
})
