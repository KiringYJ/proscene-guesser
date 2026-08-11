import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    name: 'app/public-game-boundary',
    files: [
      'src/App.vue',
      'src/components/**/*.vue',
      'src/composables/**/*.ts',
      'src/game/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/data/questions',
              message: 'UI code must receive gameplay state through ActiveGameSessionPort.',
            },
            {
              name: '@/data/questions.ts',
              message: 'UI code must receive gameplay state through ActiveGameSessionPort.',
            },
          ],
          patterns: [
            {
              group: ['@/game/authority/**', '@/game/local/**'],
              message: 'UI and public game modules cannot import authority or local adapters.',
            },
            {
              group: ['./*', './**', '../*', '../**'],
              message: 'Use the @/ alias so restricted import boundaries cannot be bypassed.',
            },
          ],
        },
      ],
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
)
