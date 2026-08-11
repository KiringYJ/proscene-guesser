import type { LocalQuestionBundle } from '@/game/authority/question-bundle'

export const syntheticLocalQuestion: LocalQuestionBundle = {
  prompt: {
    id: 'q-7y4t2r8m6w3k',
    image: '/dev/round-fixture.svg',
    imageAlt: 'A synthetic esports broadcast frame used for local interface testing.',
    archiveLabel: 'Interface test archive',
    clue: 'Use the side colors, timer, and map state to test the complete round flow.',
    choices: {
      years: [2023, 2024],
      tournaments: ['World Championship', 'Mid-Season Invitational'],
      stages: ['Semifinal', 'Final'],
      teams: [
        { id: 'blue-comets', name: 'Blue Comets' },
        { id: 'red-meteors', name: 'Red Meteors' },
        { id: 'silver-foxes', name: 'Silver Foxes' },
      ],
      games: [1, 2, 3, 4, 5],
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
        gameNumber: 3,
      },
    },
    source: {
      label: 'UI_FIXTURE_SOLUTION_MARKER',
      url: 'https://example.invalid/proscene-guesser-fixture',
    },
  },
}
