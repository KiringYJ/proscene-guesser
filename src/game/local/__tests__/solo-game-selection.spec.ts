import { describe, expect, it } from 'vitest'

import type { LocalQuestionBundle } from '@/game/authority/question-bundle'
import {
  createSoloGameSelection,
  getSoloGameAvailability,
} from '@/game/local/solo-game-selection'
import { QUICK_PLAY_CONFIG, type SoloGameConfig } from '@/game/solo'

function makeBundle(id: string, pool: 'classic' | 'deep-cut'): LocalQuestionBundle {
  return {
    prompt: {
      id,
      pool,
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
  makeBundle('q-000000000001', 'classic'),
  makeBundle('q-000000000002', 'deep-cut'),
  makeBundle('q-000000000003', 'classic'),
  makeBundle('q-000000000004', 'deep-cut'),
  makeBundle('q-000000000005', 'classic'),
  makeBundle('q-000000000006', 'deep-cut'),
]

describe('solo game selection', () => {
  it('uses Mixed, five requested rounds, and 90 seconds for Quick Play', () => {
    expect(QUICK_PLAY_CONFIG).toEqual({
      pool: 'mixed',
      rounds: 5,
      timerSeconds: 90,
    })
  })

  it('reports availability for the complete catalog and each authored pool', () => {
    expect(getSoloGameAvailability(catalog)).toEqual({
      total: 6,
      byPool: {
        classic: 3,
        'deep-cut': 3,
      },
    })
  })

  it('filters by pool and selects unique questions with an injected random source', () => {
    const config: SoloGameConfig = {
      pool: 'classic',
      rounds: 5,
      timerSeconds: 60,
    }
    const selection = createSoloGameSelection(catalog, config, () => 0)
    const ids = selection.bundles.map((bundle) => bundle.prompt.id)

    expect(ids).toEqual([
      'q-000000000003',
      'q-000000000005',
      'q-000000000001',
    ])
    expect(new Set(ids).size).toBe(ids.length)
    expect(selection.plan).toMatchObject({
      config,
      eligibleQuestionCount: 3,
      roundCount: 3,
      constrainedByAvailability: true,
    })
  })

  it('uses every eligible question exactly once for All', () => {
    const selection = createSoloGameSelection(
      catalog,
      { pool: 'deep-cut', rounds: 'all', timerSeconds: 'none' },
      () => 0.5,
    )

    expect(selection.bundles).toHaveLength(3)
    expect(selection.bundles.every((bundle) => bundle.prompt.pool === 'deep-cut')).toBe(true)
    expect(new Set(selection.bundles.map((bundle) => bundle.prompt.id)).size).toBe(3)
    expect(selection.plan.constrainedByAvailability).toBe(false)
  })

  it('returns an empty selection when the chosen pool has no playable questions', () => {
    const selection = createSoloGameSelection(
      [makeBundle('q-000000000001', 'classic')],
      { pool: 'deep-cut', rounds: 5, timerSeconds: 90 },
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
