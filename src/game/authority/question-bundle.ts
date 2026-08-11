import type {
  QuestionPrompt,
  RevealDisclosure,
} from '../../types/question.ts'

export type GeneratedQuestionPromptRecord = Omit<QuestionPrompt, 'image'>

export interface GeneratedLocalQuestionBundle {
  prompt: GeneratedQuestionPromptRecord
  disclosure: RevealDisclosure
}

export interface LocalQuestionBundle {
  prompt: QuestionPrompt
  disclosure: RevealDisclosure
}
