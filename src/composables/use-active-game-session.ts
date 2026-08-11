import {
  inject,
  onScopeDispose,
  readonly,
  shallowRef,
  type InjectionKey,
} from 'vue'

import type {
  ActiveGameSessionPort,
  ActiveGameSnapshot,
} from '@/game/session'

export const activeGameSessionKey: InjectionKey<ActiveGameSessionPort> = Symbol(
  'active-game-session',
)

export function useActiveGameSession() {
  const session = inject(activeGameSessionKey)

  if (!session) {
    throw new Error('Active game session was not provided')
  }

  const snapshot = shallowRef<ActiveGameSnapshot>(session.getSnapshot())
  const unsubscribe = session.subscribe((nextSnapshot) => {
    snapshot.value = nextSnapshot
  })

  onScopeDispose(unsubscribe)

  return {
    session,
    snapshot: readonly(snapshot),
  }
}
