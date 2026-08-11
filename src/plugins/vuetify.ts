import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'

export const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  theme: {
    defaultTheme: 'proscene',
    themes: {
      proscene: {
        dark: true,
        colors: {
          background: '#090d12',
          surface: '#111821',
          'surface-bright': '#1b2632',
          primary: '#c6ff3d',
          secondary: '#42d6ff',
          error: '#ff5c6c',
          success: '#66e6a2',
          warning: '#ffca5c',
          info: '#7ba8ff',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
      elevation: 0,
    },
    VCard: {
      rounded: 'xl',
      elevation: 0,
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'lg',
    },
  },
})
