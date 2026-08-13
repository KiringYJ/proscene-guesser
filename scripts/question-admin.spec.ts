import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  QuestionAdminConflictError,
  loadAdminQuestionIndex,
  readCaptureSummary,
  replaceQuestionOriginal,
  resolveCaptureCandidatePath,
  saveQuestionRedactions,
  updateQuestionAnswer,
} from './question-admin.ts'
import { createQuestionAdminServer } from './question-admin-server.ts'
import { createCaptureRequest } from './video-frame-selection.ts'

const questionId = 'q-0123456789ab'
const questionDirectory =
  'worlds-2025--final--t1--gen-g-esports--g1--0123456789ab'
const captureRequest = createCaptureRequest('https://www.youtube.com/watch?v=newvideo123', '75')
const captureId = captureRequest.captureId
const temporaryRoots: string[] = []

function png(width: number, height: number, marker: number): Buffer {
  const buffer = Buffer.alloc(32, marker)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function createFixture(options: { nextHeight?: number; nextWidth?: number } = {}): Promise<{
  currentOriginal: Buffer
  nextOriginal: Buffer
  questionPath: string
  repositoryRoot: string
}> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'proscene-question-admin-'))
  temporaryRoots.push(repositoryRoot)
  const questionPath = resolve(repositoryRoot, 'sources/questions', questionDirectory)
  const incomingPath = resolve(repositoryRoot, 'incoming')
  const catalogPath = resolve(repositoryRoot, 'src/data/catalog')
  const coarsePath = resolve(
    repositoryRoot,
    '.media/frame-selections',
    captureId,
    'coarse',
  )
  const finePath = resolve(repositoryRoot, '.media/frame-selections', captureId, 'fine')
  await Promise.all([
    mkdir(questionPath, { recursive: true }),
    mkdir(incomingPath, { recursive: true }),
    mkdir(catalogPath, { recursive: true }),
    mkdir(coarsePath, { recursive: true }),
    mkdir(finePath, { recursive: true }),
  ])
  await writeFile(
    resolve(catalogPath, 'international-catalog.json'),
    await readFile(resolve('src/data/catalog/international-catalog.json')),
  )

  const currentOriginal = png(1920, 1080, 0x11)
  const nextOriginal = png(options.nextWidth ?? 1920, options.nextHeight ?? 1080, 0x22)
  const nextSha256 = sha256(nextOriginal)
  await writeFile(resolve(questionPath, 'original.png'), currentOriginal)
  await writeFile(resolve(questionPath, 'redacted.webp'), Buffer.from('redacted'))
  await writeJson(resolve(questionPath, 'question.json'), {
    answer: {
      blueTeamId: 't1',
      gameNumber: 1,
      redTeamId: 'gen-g-esports',
      stage: 'Final',
      tournament: 'Worlds',
      year: 2025,
    },
    archiveLabel: 'Worlds 2025 Final',
    choices: {
      games: [1],
      stages: ['Final'],
      teams: [
        { id: 't1', name: 'T1' },
        { id: 'gen-g-esports', name: 'Gen.G Esports' },
      ],
      tournaments: ['Worlds'],
      years: [2025],
    },
    clue: 'Fixture clue',
    imageAlt: 'Fixture broadcast frame',
    pool: 'classic',
    rights: {
      evidence: 'Fixture rights evidence',
      reviewedAt: '2026-08-13',
    },
    source: {
      label: 'Existing broadcast source',
      url: 'https://www.youtube.com/watch?v=oldvideo123',
    },
  })
  await writeJson(resolve(questionPath, 'redaction.json'), {
    coordinateSpace: { height: 1080, width: 1920 },
    rectangles: [{ height: 10, id: 'event', purpose: 'event label', width: 10, x: 0, y: 0 }],
    reviewStatus: 'approved',
    schemaVersion: 1,
    source: { file: 'original.png', sha256: sha256(currentOriginal).toUpperCase() },
  })

  const coarseCandidate = {
    file: 'frame-01.png',
    number: 1,
    sampleSeconds: 0,
    sourceFrameIndex: 0,
    sourcePts: '0',
    sourcePtsTimeSeconds: 0,
    sourceRelativeSeconds: 0,
  }
  const fineCandidate = { ...coarseCandidate, file: 'frame-001.png' }
  await writeFile(resolve(coarsePath, coarseCandidate.file), nextOriginal)
  await writeFile(resolve(finePath, fineCandidate.file), nextOriginal)
  await writeFile(resolve(incomingPath, `${captureId}.png`), nextOriginal)
  await writeFile(
    resolve(repositoryRoot, '.media/frame-selections', captureId, 'selected.png'),
    nextOriginal,
  )
  await writeJson(resolve(incomingPath, `${captureId}.capture.json`), {
    artifacts: {
      coarseDirectory: `.media/frame-selections/${captureId}/coarse`,
      fineDirectory: `.media/frame-selections/${captureId}/fine`,
      selectedWorkspacePng: `.media/frame-selections/${captureId}/selected.png`,
      workspace: `.media/frame-selections/${captureId}`,
    },
    captureId,
    coarse: {
      candidates: [coarseCandidate],
      generationCommand: ['ffmpeg'],
      pickerPath: `.media/frame-selections/${captureId}/coarse/index.html`,
      selectedCandidateNumber: 1,
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    fine: {
      candidates: [fineCandidate],
      generationCommand: ['ffmpeg'],
      pickerPath: `.media/frame-selections/${captureId}/fine/index.html`,
      selectedCandidateNumber: 1,
    },
    output: {
      extractionCommand: ['ffmpeg'],
      height: options.nextHeight ?? 1080,
      path: `incoming/${captureId}.png`,
      pixelFormat: 'rgb24',
      selectedAt: '2026-08-13T00:00:00.000Z',
      selectedCandidatePngSha256: nextSha256,
      selectedFrame: fineCandidate,
      sha256: nextSha256,
      sizeBytes: nextOriginal.length,
      width: options.nextWidth ?? 1920,
    },
    request: {
      ...captureRequest,
    },
    schemaVersion: 1,
    updatedAt: '2026-08-13T00:00:00.000Z',
  })

  return { currentOriginal, nextOriginal, questionPath, repositoryRoot }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (path) => await rm(path, { force: true, recursive: true })),
  )
})

describe('question admin source replacement', () => {
  it('replaces the original and records capture provenance without blessing stale redactions', async () => {
    const fixture = await createFixture()
    const before = await loadAdminQuestionIndex(fixture.repositoryRoot)

    expect(before.issues).toEqual([])
    expect(before.questions[0]).toMatchObject({
      captureId: null,
      id: questionId,
      redactionMatchesOriginal: true,
    })

    const result = await replaceQuestionOriginal({
      allowDimensionChange: false,
      captureId,
      expectedOriginalSha256: sha256(fixture.currentOriginal),
      questionId,
      repositoryRoot: fixture.repositoryRoot,
    })

    expect(result).toMatchObject({
      captureId,
      dimensionsChanged: false,
      newOriginalSha256: sha256(fixture.nextOriginal),
      questionId,
      sourceUrl: 'https://www.youtube.com/watch?v=newvideo123',
    })
    expect(await readFile(resolve(fixture.questionPath, 'original.png'))).toEqual(
      fixture.nextOriginal,
    )
    const manifest = JSON.parse(
      await readFile(resolve(fixture.questionPath, 'question.json'), 'utf8'),
    ) as { source: { label: string; url: string } }
    expect(manifest.source).toEqual({
      label: 'Existing broadcast source',
      url: 'https://www.youtube.com/watch?v=newvideo123',
    })
    expect(JSON.parse(await readFile(resolve(fixture.questionPath, 'capture.json'), 'utf8'))).toMatchObject({
      captureId,
    })

    const after = await loadAdminQuestionIndex(fixture.repositoryRoot)
    expect(after.questions[0]).toMatchObject({
      captureId,
      originalSha256: sha256(fixture.nextOriginal),
      redactionMatchesOriginal: false,
    })
  })

  it('rejects a stale browser hash before changing any question file', async () => {
    const fixture = await createFixture()

    await expect(
      replaceQuestionOriginal({
        allowDimensionChange: false,
        captureId,
        expectedOriginalSha256: '0'.repeat(64),
        questionId,
        repositoryRoot: fixture.repositoryRoot,
      }),
    ).rejects.toBeInstanceOf(QuestionAdminConflictError)
    expect(await readFile(resolve(fixture.questionPath, 'original.png'))).toEqual(
      fixture.currentOriginal,
    )
  })

  it('requires an explicit opt-in before changing source dimensions', async () => {
    const fixture = await createFixture({ nextHeight: 720, nextWidth: 1280 })
    const request = {
      captureId,
      expectedOriginalSha256: sha256(fixture.currentOriginal),
      questionId,
      repositoryRoot: fixture.repositoryRoot,
    }

    await expect(
      replaceQuestionOriginal({ ...request, allowDimensionChange: false }),
    ).rejects.toThrow(/selected frame is 1280 x 720/i)
    await expect(
      replaceQuestionOriginal({ ...request, allowDimensionChange: true }),
    ).resolves.toMatchObject({ dimensionsChanged: true })
  })
})

describe('question admin answer updates', () => {
  it('updates catalog-backed answer fields and renames the directory without changing the ID or sibling assets', async () => {
    const fixture = await createFixture()
    const before = await loadAdminQuestionIndex(fixture.repositoryRoot)
    const question = before.questions[0]
    expect(question).toBeDefined()

    const result = await updateQuestionAnswer({
      blueTeamId: 'bilibili-gaming',
      catalogEditionId: 'worlds-2024',
      expectedDirectoryName: question?.directoryName ?? '',
      expectedManifestSha256: question?.manifestSha256 ?? '',
      gameNumber: 3,
      questionId,
      redTeamId: 't1',
      repositoryRoot: fixture.repositoryRoot,
      stage: 'Final',
    })

    expect(result.directoryName).toBe(
      'worlds-2024--final--bilibili-gaming--t1--g3--0123456789ab',
    )
    expect(result.directoryChanged).toBe(true)
    const renamedPath = resolve(fixture.repositoryRoot, 'sources/questions', result.directoryName)
    expect(await readFile(resolve(renamedPath, 'original.png'))).toEqual(fixture.currentOriginal)
    expect(await readFile(resolve(renamedPath, 'redacted.webp'), 'utf8')).toBe('redacted')
    const manifest = JSON.parse(await readFile(resolve(renamedPath, 'question.json'), 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({
      catalogEditionId: 'worlds-2024',
      answer: {
        blueTeamId: 'bilibili-gaming',
        gameNumber: 3,
        redTeamId: 't1',
        stage: 'Final',
      },
    })
    const after = await loadAdminQuestionIndex(fixture.repositoryRoot)
    expect(after.questions[0]).toMatchObject({ id: questionId, directoryName: result.directoryName })
  })

  it('rejects stale hashes, target collisions, and catalog-invalid answers before changing files', async () => {
    const fixture = await createFixture()
    const question = (await loadAdminQuestionIndex(fixture.repositoryRoot)).questions[0]
    expect(question).toBeDefined()
    const base = {
      blueTeamId: 'bilibili-gaming',
      catalogEditionId: 'worlds-2024',
      expectedDirectoryName: question?.directoryName ?? '',
      expectedManifestSha256: question?.manifestSha256 ?? '',
      gameNumber: 3,
      questionId,
      redTeamId: 't1',
      repositoryRoot: fixture.repositoryRoot,
      stage: 'Final',
    }

    await expect(updateQuestionAnswer({ ...base, expectedManifestSha256: '0'.repeat(64) })).rejects.toBeInstanceOf(QuestionAdminConflictError)
    await expect(updateQuestionAnswer({ ...base, catalogEditionId: 'not-an-edition' })).rejects.toThrow(/unknown international edition/i)

    const collisionName = 'worlds-2024--final--bilibili-gaming--t1--g3--0123456789ab'
    await mkdir(resolve(fixture.repositoryRoot, 'sources/questions', collisionName))
    await expect(updateQuestionAnswer(base)).rejects.toThrow(/already exists/i)
    expect(await readFile(resolve(fixture.questionPath, 'question.json'), 'utf8')).toContain('"tournament": "Worlds"')
  })
})

describe('question admin redaction saves', () => {
  it('preserves valid geometry, drops invalid or deleted geometry, and atomically installs renderer output', async () => {
    const fixture = await createFixture()
    const redactionPath = resolve(fixture.questionPath, 'redaction.json')
    await writeJson(redactionPath, {
      coordinateSpace: { height: 1080, width: 1920 },
      customField: 'preserved',
      geometryExceptions: [
        { id: 'keep-exception', reason: 'intentional', rectangleIds: ['a', 'b'] },
        { id: 'drop-exception', reason: 'deleted', rectangleIds: ['a', 'deleted'] },
      ],
      geometryGroups: [
        { id: 'keep-width', rectangleIds: ['a', 'b'], rule: 'uniform-width', width: 100 },
        { id: 'drop-mirror', rectangleIds: ['a', 'b'], rule: 'horizontal-mirror' },
        { id: 'drop-deleted', rectangleIds: ['a', 'deleted'], rule: 'uniform-width', width: 100 },
      ],
      rectangles: [
        { height: 20, id: 'a', purpose: 'old', width: 100, x: 100, y: 100 },
        { height: 20, id: 'b', purpose: 'old', width: 100, x: 300, y: 100 },
        { height: 20, id: 'deleted', purpose: 'old', width: 100, x: 500, y: 100 },
      ],
      reviewStatus: 'auto-applied',
      schemaVersion: 1,
      source: { file: 'original.png', sha256: sha256(fixture.currentOriginal) },
    })
    const before = (await loadAdminQuestionIndex(fixture.repositoryRoot)).questions[0]
    expect(before).toBeDefined()

    const result = await saveQuestionRedactions({
      expectedOriginalSha256: before?.originalSha256 ?? '',
      expectedRedactionManifestSha256: before?.redactionManifestSha256 ?? null,
      questionId,
      rectangles: [
        { height: 20, id: 'a', purpose: 'team', width: 100, x: 100, y: 100 },
        { height: 20, id: 'b', purpose: 'team', width: 100, x: 300, y: 100 },
      ],
      renderer: async ({ manifestPath, outputPath }) => {
        expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toMatchObject({ reviewStatus: 'approved' })
        await writeFile(outputPath, Buffer.from('new-webp'))
      },
      repositoryRoot: fixture.repositoryRoot,
    })

    expect(result).toMatchObject({
      droppedGeometryExceptionIds: ['drop-exception'],
      droppedGeometryGroupIds: ['drop-mirror', 'drop-deleted'],
      rectangleCount: 2,
      reviewStatus: 'approved',
    })
    expect(await readFile(resolve(fixture.questionPath, 'redacted.webp'), 'utf8')).toBe('new-webp')
    const manifest = JSON.parse(await readFile(redactionPath, 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({
      customField: 'preserved',
      geometryExceptions: [{ id: 'keep-exception', rectangleIds: ['a', 'b'] }],
      geometryGroups: [{ id: 'keep-width', rectangleIds: ['a', 'b'] }],
      reviewStatus: 'approved',
    })
  })

  it('rejects stale manifests, changed originals, out-of-bounds rectangles, and duplicate IDs', async () => {
    const fixture = await createFixture()
    const before = (await loadAdminQuestionIndex(fixture.repositoryRoot)).questions[0]
    expect(before).toBeDefined()
    const base = {
      expectedOriginalSha256: before?.originalSha256 ?? '',
      expectedRedactionManifestSha256: before?.redactionManifestSha256 ?? null,
      questionId,
      rectangles: [{ height: 10, id: 'one', purpose: 'test', width: 10, x: 0, y: 0 }],
      renderer: async ({ outputPath }: { outputPath: string }) => await writeFile(outputPath, 'rendered'),
      repositoryRoot: fixture.repositoryRoot,
    }

    await expect(saveQuestionRedactions({ ...base, expectedRedactionManifestSha256: '0'.repeat(64) })).rejects.toBeInstanceOf(QuestionAdminConflictError)
    await expect(saveQuestionRedactions({ ...base, expectedOriginalSha256: '0'.repeat(64) })).rejects.toBeInstanceOf(QuestionAdminConflictError)
    await expect(saveQuestionRedactions({ ...base, rectangles: [{ height: 10, id: 'one', purpose: 'test', width: 10, x: 1915, y: 0 }] })).rejects.toThrow(/exceeds/i)
    await expect(saveQuestionRedactions({ ...base, rectangles: [base.rectangles[0], base.rectangles[0]] })).rejects.toThrow(/unique/i)
  })

  it('leaves the installed manifest and derivative untouched when rendering fails', async () => {
    const fixture = await createFixture()
    const before = (await loadAdminQuestionIndex(fixture.repositoryRoot)).questions[0]
    expect(before).toBeDefined()
    const previousManifest = await readFile(resolve(fixture.questionPath, 'redaction.json'))
    const previousRedacted = await readFile(resolve(fixture.questionPath, 'redacted.webp'))

    await expect(saveQuestionRedactions({
      expectedOriginalSha256: before?.originalSha256 ?? '',
      expectedRedactionManifestSha256: before?.redactionManifestSha256 ?? null,
      questionId,
      rectangles: [{ height: 10, id: 'one', purpose: 'test', width: 10, x: 0, y: 0 }],
      renderer: async () => {
        throw new Error('synthetic renderer failure')
      },
      repositoryRoot: fixture.repositoryRoot,
    })).rejects.toThrow(/synthetic renderer failure/i)

    expect(await readFile(resolve(fixture.questionPath, 'redaction.json'))).toEqual(previousManifest)
    expect(await readFile(resolve(fixture.questionPath, 'redacted.webp'))).toEqual(previousRedacted)
    const files = await readdir(fixture.questionPath)
    expect(files.some((file) => file.startsWith('.redaction-'))).toBe(false)
  })
})

describe('question admin capture reads', () => {
  it('exposes only manifest-recorded candidate paths and absolute video timestamps', async () => {
    const fixture = await createFixture()
    const capture = await readCaptureSummary(fixture.repositoryRoot, captureId)

    expect(capture.coarse?.candidates[0]).toMatchObject({
      number: 1,
      videoTimestamp: '00:01:10.000',
    })
    await expect(
      resolveCaptureCandidatePath(
        fixture.repositoryRoot,
        captureId,
        'coarse',
        'frame-01.png',
      ),
    ).resolves.toContain('frame-01.png')
    await expect(
      resolveCaptureCandidatePath(
        fixture.repositoryRoot,
        captureId,
        'coarse',
        '../frame-01.png',
      ),
    ).rejects.toThrow(/invalid candidate file name/i)
  })
})

describe('question admin loopback authentication', () => {
  it('requires the launch token before accepting an admin session cookie', async () => {
    const { ready, server } = createQuestionAdminServer({ openBrowser: false, port: 0 })

    try {
      const addresses = await ready
      const unauthorized = await fetch(`${addresses.baseUrl}/api/health`)
      expect(unauthorized.status).toBe(401)

      const login = await fetch(addresses.authenticatedUrl, { redirect: 'manual' })
      expect(login.status).toBe(303)
      const cookie = login.headers.get('set-cookie')?.split(';')[0]
      expect(cookie).toBeTruthy()

      const health = await fetch(`${addresses.baseUrl}/api/health`, {
        headers: { Cookie: cookie ?? '' },
      })
      expect(await health.json()).toEqual({ localOnly: true, status: 'ok' })

      const crossSiteMutation = await fetch(`${addresses.baseUrl}/api/captures`, {
        body: JSON.stringify({ timestamp: '75', url: 'https://example.com/video.mp4' }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie ?? '',
        },
        method: 'POST',
      })
      expect(crossSiteMutation.status).toBe(403)

      const invalidCapture = await fetch(`${addresses.baseUrl}/api/captures`, {
        body: JSON.stringify({ timestamp: '75', url: 'https://example.com/video.mp4' }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie ?? '',
          Origin: addresses.baseUrl,
          'X-Question-Admin-Request': '1',
        },
        method: 'POST',
      })
      expect(invalidCapture.status).toBe(400)
      expect(await invalidCapture.json()).toEqual({
        error: 'The resumable frame picker currently requires a stable YouTube video URL',
      })
    } finally {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error === undefined ? resolvePromise() : reject(error)))
      })
    }
  })

  it('serves catalog edit data and protects answer and redaction mutation routes', async () => {
    const fixture = await createFixture()
    const { ready, server } = createQuestionAdminServer({
      catalogSync: async () => {
        throw new Error('synthetic sync warning')
      },
      openBrowser: false,
      port: 0,
      redactionRenderer: async ({ outputPath }) => await writeFile(outputPath, 'route-webp'),
      repositoryRoot: fixture.repositoryRoot,
    })

    try {
      const addresses = await ready
      const login = await fetch(addresses.authenticatedUrl, { redirect: 'manual' })
      const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
      const headers = {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: addresses.baseUrl,
        'X-Question-Admin-Request': '1',
      }
      const indexResponse = await fetch(`${addresses.baseUrl}/api/questions`, {
        headers: { Cookie: cookie },
      })
      const index = await indexResponse.json() as {
        editions: unknown[]
        questions: Array<Record<string, unknown>>
      }
      expect(index.editions.length).toBeGreaterThan(0)
      expect(index.questions[0]).toMatchObject({
        manifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        redactionManifest: expect.any(Object),
        redactionManifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      })

      const question = index.questions[0] ?? {}
      const answerResponse = await fetch(`${addresses.baseUrl}/api/questions/${questionId}/answer`, {
        body: JSON.stringify({
          blueTeamId: 'bilibili-gaming',
          catalogEditionId: 'worlds-2024',
          confirmation: questionId,
          expectedDirectoryName: question.directoryName,
          expectedManifestSha256: question.manifestSha256,
          gameNumber: 3,
          redTeamId: 't1',
          stage: 'Final',
        }),
        headers,
        method: 'POST',
      })
      expect(answerResponse.status).toBe(200)
      const answerPayload = await answerResponse.json() as {
        catalogSync: { log: string; ok: boolean }
        question: Record<string, unknown>
      }
      expect(answerPayload.catalogSync).toEqual({ log: 'synthetic sync warning', ok: false })

      const updatedQuestion = answerPayload.question
      const redactionsResponse = await fetch(`${addresses.baseUrl}/api/questions/${questionId}/redactions`, {
        body: JSON.stringify({
          confirmation: questionId,
          expectedOriginalSha256: updatedQuestion.originalSha256,
          expectedRedactionManifestSha256: updatedQuestion.redactionManifestSha256,
          rectangles: [
            { height: 20, id: 'route', purpose: 'route test', width: 20, x: 0, y: 0 },
          ],
        }),
        headers,
        method: 'POST',
      })
      expect(redactionsResponse.status).toBe(200)
      const redactionsPayload = await redactionsResponse.json() as {
        catalogSync: { ok: boolean }
        question: { rectangleCount: number }
      }
      expect(redactionsPayload).toMatchObject({
        catalogSync: { ok: false },
        question: { rectangleCount: 1 },
      })
    } finally {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => (error === undefined ? resolvePromise() : reject(error)))
      })
    }
  })

  it('ships the local admin interface required by the server command', async () => {
    const html = await readFile(resolve('QUESTION_REDACTION_AUDIT.html'), 'utf8')

    expect(html).toContain('<title>ProScene Question Admin</title>')
    expect(html).toContain('id="answerForm"')
    expect(html).toContain('id="answerYear"')
    expect(html).toContain('id="answerTournament"')
    expect(html).toContain('id="captureForm"')
    expect(html).toContain('id="redactionLayer"')
    expect(html).toContain('id="saveRedactions"')
    expect(html).toContain('X-Question-Admin-Request')
  })
})
