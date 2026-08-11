import type { Question } from '@/types/question'

import { internationalTournamentNames } from './catalog'
import { publishedQuestionManifests } from './questions.generated'
import type {
  InternationalTournamentChoiceSource,
  PublishedQuestionManifest,
} from './question-manifest'

function resolveTournamentChoices(
  choices: readonly string[] | InternationalTournamentChoiceSource,
): readonly string[] {
  return Array.isArray(choices) ? choices : internationalTournamentNames
}

function createQuestion(manifest: PublishedQuestionManifest): Question {
  return {
    id: manifest.id,
    image: `${import.meta.env.BASE_URL}questions/${manifest.publicImage}`,
    imageAlt: manifest.imageAlt,
    archiveLabel: manifest.archiveLabel,
    clue: manifest.clue,
    answer: manifest.answer,
    choices: {
      years: manifest.choices.years,
      tournaments: resolveTournamentChoices(manifest.choices.tournaments),
      stages: manifest.choices.stages,
      teams: manifest.choices.teams,
      games: manifest.choices.games,
    },
    ...(manifest.source ? { source: manifest.source } : {}),
  }
}

export const questions = publishedQuestionManifests.map(createQuestion)
