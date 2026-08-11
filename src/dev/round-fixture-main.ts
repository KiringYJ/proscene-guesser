import { mountApp } from '@/bootstrap'
import { syntheticLocalQuestion } from '@/dev/synthetic-local-question'
import { LocalActiveGameSession } from '@/game/local/local-active-game-session'

const session = new LocalActiveGameSession([syntheticLocalQuestion])

await session.startGame({
  pool: 'mixed',
  rounds: 'all',
  timerSeconds: 'none',
})

mountApp(session)
