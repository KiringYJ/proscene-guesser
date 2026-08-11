import { resolve } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

describe('public game import boundary', () => {
  it('rejects extensionless and extension-bearing local question imports', async () => {
    const eslint = new ESLint({ cwd: process.cwd() })
    const [result] = await eslint.lintText(
      [
        "import '@/data/questions'",
        "import '@/data/questions.ts'",
      ].join('\n'),
      { filePath: resolve('src/game/import-boundary-fixture.ts') },
    )
    const restrictedImports = result?.messages.filter(
      (message) => message.ruleId === 'no-restricted-imports',
    )

    expect(restrictedImports).toHaveLength(2)
    expect(restrictedImports?.map((message) => message.message)).toEqual([
      expect.stringContaining('@/data/questions'),
      expect.stringContaining('@/data/questions.ts'),
    ])
  })
})
