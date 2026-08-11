import 'vuetify/styles'
import '@/assets/main.css'

import { createApp } from 'vue'

import App from '@/App.vue'
import { activeGameSessionKey } from '@/composables/use-active-game-session'
import type { ActiveGameSessionPort } from '@/game/session'
import { vuetify } from '@/plugins/vuetify'

export function mountApp(session: ActiveGameSessionPort, mountTarget = '#app') {
  return createApp(App)
    .provide(activeGameSessionKey, session)
    .use(vuetify)
    .mount(mountTarget)
}
