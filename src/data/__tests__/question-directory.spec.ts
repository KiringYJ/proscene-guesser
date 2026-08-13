import { describe, expect, it } from 'vitest'

import {
  createQuestionDirectoryName,
  parseQuestionDirectoryName,
} from '@/data/question-directory'
import type { QuestionManifest } from '@/data/question-manifest'

const catalogManifest: QuestionManifest = {
  pool: 'classic',
  catalogEditionId: 'worlds-2024',
  answer: {
    stage: 'Semifinal',
    blueTeamId: 'gen-g-esports',
    redTeamId: 't1',
    gameNumber: 4,
  },
}

describe('question directory names', () => {
  it('combines a readable match locator with the immutable question ID', () => {
    const directoryName = createQuestionDirectoryName('q-efd3q8g07jxb', catalogManifest)

    expect(directoryName).toBe(
      'worlds-2024--semifinal--gen-g-esports--t1--g4--efd3q8g07jxb',
    )
    expect(parseQuestionDirectoryName(directoryName)).toEqual({
      id: 'q-efd3q8g07jxb',
      locator: 'worlds-2024--semifinal--gen-g-esports--t1--g4',
    })
  })

  it('keeps otherwise identical screenshots distinct through their opaque IDs', () => {
    const first = createQuestionDirectoryName('q-9nmmp40pgdx5', catalogManifest)
    const second = createQuestionDirectoryName('q-t5h12699fxgp', catalogManifest)

    expect(first).not.toBe(second)
    expect(first.replace(/--[^-]+$/, '')).toBe(second.replace(/--[^-]+$/, ''))
  })

  it('creates an event locator for a non-catalog question', () => {
    const staticManifest: QuestionManifest = {
      pool: 'deep-cut',
      answer: {
        year: 2024,
        tournament: "Caster's Invitational",
        stage: 'Play-In Stage',
        blueTeamId: 'blue-comets',
        redTeamId: 'crimson-foxes',
        gameNumber: 3,
      },
    }

    expect(createQuestionDirectoryName('q-9n7m5k3j1h2g', staticManifest)).toBe(
      'casters-invitational-2024--play-in-stage--blue-comets--crimson-foxes--g3--9n7m5k3j1h2g',
    )
  })

  it('rejects legacy opaque-only and malformed directory names', () => {
    expect(parseQuestionDirectoryName('q-efd3q8g07jxb')).toBeNull()
    expect(
      parseQuestionDirectoryName(
        'worlds-2024--semifinal--gen-g-esports--t1--efd3q8g07jxb',
      ),
    ).toBeNull()
  })

  it('rejects an invalid runtime ID', () => {
    expect(() => createQuestionDirectoryName('question-1', catalogManifest)).toThrow(
      'Invalid question ID: question-1',
    )
  })
})
