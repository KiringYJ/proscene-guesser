import { describe, expect, it } from 'vitest'

import {
  applyCatalogEditionSelection,
  applyYearSelection,
  excludeOpposingTeam,
} from '@/lib/answer-cascade'
import type { PlayerAnswer } from '@/types/question'

const selectedAnswer: PlayerAnswer = {
  year: 2024,
  catalogEditionId: 'worlds-2024',
  tournament: 'World Championship',
  stage: 'Quarterfinal',
  blueTeam: 'Bilibili Gaming',
  redTeam: 'Hanwha Life Esports',
  gameNumber: 4,
}

describe('answer cascade', () => {
  it('clears event-dependent fields when a catalog year changes', () => {
    expect(applyYearSelection(selectedAnswer, 2025, true)).toEqual({
      year: 2025,
      catalogEditionId: null,
      tournament: null,
      stage: null,
      blueTeam: null,
      redTeam: null,
      gameNumber: 4,
    })
  })

  it('preserves static question selections when only the year changes', () => {
    expect(applyYearSelection(selectedAnswer, 2025, false)).toEqual({
      ...selectedAnswer,
      year: 2025,
    })
  })

  it('clears stage and teams when the selected edition changes', () => {
    expect(
      applyCatalogEditionSelection(
        selectedAnswer,
        'msi-2024',
        'Mid-Season Invitational',
      ),
    ).toEqual({
      year: 2024,
      catalogEditionId: 'msi-2024',
      tournament: 'Mid-Season Invitational',
      stage: null,
      blueTeam: null,
      redTeam: null,
      gameNumber: 4,
    })
  })

  it('removes the selected opposing team from the other side', () => {
    expect(
      excludeOpposingTeam(['Bilibili Gaming', 'Hanwha Life Esports', 'T1'], 'T1'),
    ).toEqual(['Bilibili Gaming', 'Hanwha Life Esports'])
  })
})
