import type { Question } from '@/types/question'

const demoChoices = {
  years: [2022, 2023, 2024, 2025],
  tournaments: ['World Championship', 'Mid-Season Invitational', 'First Stand'],
  stages: ['Swiss Stage', 'Quarterfinal', 'Semifinal', 'Final'],
  teams: ['Blue Comets', 'Crimson Foxes', 'Golden Owls', 'Silver Wolves'],
  games: [1, 2, 3, 4, 5],
} as const

export const questions = [
  {
    id: 'demo-001',
    image: `${import.meta.env.BASE_URL}questions/demo-redacted.svg`,
    imageAlt:
      'Synthetic competitive game broadcast with team and player identifiers visibly redacted.',
    archiveLabel: 'Synthetic archive · 001',
    clue: 'Use the broadcast package, map state, and side composition. Direct identifiers are gone.',
    answer: {
      year: 2024,
      tournament: 'World Championship',
      stage: 'Semifinal',
      blueTeam: 'Blue Comets',
      redTeam: 'Crimson Foxes',
      gameNumber: 3,
    },
    choices: demoChoices,
  },
] as const satisfies readonly Question[]
