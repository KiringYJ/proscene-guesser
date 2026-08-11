import type { Question } from '@/types/question'

import { publishedQuestionRecords } from './questions.generated'
import type { ClientQuestionRecord } from './question-manifest'

function createQuestion(record: ClientQuestionRecord): Question {
  return {
    id: record.id,
    image: `${import.meta.env.BASE_URL}questions/${record.publicImage}`,
    imageAlt: record.imageAlt,
    archiveLabel: record.archiveLabel,
    clue: record.clue,
    answer: record.answer,
    choices: record.choices,
    ...(record.catalogEditionId
      ? {
          catalogEditionId: record.catalogEditionId,
          catalogEditionIds: record.catalogEditionIds,
        }
      : {}),
    ...(record.source ? { source: record.source } : {}),
  }
}

export const questions = publishedQuestionRecords.map(createQuestion)
