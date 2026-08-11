import { mountApp } from '@/bootstrap'
import { syntheticLocalQuestion } from '@/dev/synthetic-local-question'
import { LocalActiveGameSession } from '@/game/local/local-active-game-session'

mountApp(new LocalActiveGameSession([syntheticLocalQuestion]))
