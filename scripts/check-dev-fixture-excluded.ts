import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const distRoot = resolve(repositoryRoot, 'dist')
const productionEntry = resolve(distRoot, 'index.html')
const forbiddenMarkers = [
  'round-fixture',
  'q-7y4t2r8m6w3k',
  'UI_FIXTURE_SOLUTION_MARKER',
  'Regenerate original PNG',
  'X-Question-Admin-Request',
] as const
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.xml',
])

async function findTextFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)

      if (entry.isDirectory()) {
        return findTextFiles(path)
      }

      return entry.isFile() && textExtensions.has(extname(entry.name)) ? [path] : []
    }),
  )

  return nested.flat()
}

async function main(): Promise<void> {
  await access(productionEntry).catch(() => {
    throw new Error('dist/index.html is missing; run the production build before fixture:check')
  })

  const leaks: string[] = []

  for (const path of await findTextFiles(distRoot)) {
    const contents = await readFile(path, 'utf8')

    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) {
        leaks.push(`${relative(repositoryRoot, path)} contains ${marker}`)
      }
    }
  }

  if (leaks.length > 0) {
    throw new Error(`Local-only tooling leaked into the production build:\n- ${leaks.join('\n- ')}`)
  }

  console.log('Verified that the development fixture and question admin are absent from dist/.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
