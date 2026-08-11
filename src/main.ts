import { mountApp } from '@/bootstrap'
import { localQuestionBundles } from '@/data/questions'
import { LocalActiveGameSession } from '@/game/local/local-active-game-session'

mountApp(new LocalActiveGameSession(localQuestionBundles))
