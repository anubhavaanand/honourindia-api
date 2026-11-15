import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('orphan image cleanup (issue #31)', () => {
  let testDir: string
  let dataFile: string
  let imagesFile: string
  let imagesDir: string
  let findOrphanImages: any
  let cleanOrphans: any

  beforeEach(async () => {
    const mod = await import(path.join(ROOT, 'scripts/clean-orphan-images.mjs'))
    findOrphanImages = mod.findOrphanImages
    cleanOrphans = mod.cleanOrphans

    testDir = await mkdtemp(path.join(tmpdir(), 'orphan-test-'))
    dataFile = path.join(testDir, 'figures.json')
    imagesFile = path.join(testDir, 'images.json')
    imagesDir = path.join(testDir, 'images')
    await mkdir(imagesDir, { recursive: true })

    const sampleFigures = {
      version: 1,
      figures: [
        { slug: 'fig-1', name: 'Figure One', born: 1900 },
        { slug: 'fig-2', name: 'Figure Two', born: 1910 },
      ],
    }
    await writeFile(dataFile, JSON.stringify(sampleFigures, null, 2))

    // images.json has fig-1 (valid) and fig-deleted (orphan)
    const sampleImages = {
      'fig-1': { file: 'fig-1.jpg', credit: 'Commons', license: 'CC-BY-4.0' },
      'fig-deleted': { file: 'fig-deleted.jpg', credit: 'Old', license: 'CC0' },
    }
    await writeFile(imagesFile, JSON.stringify(sampleImages, null, 2))

    // Create corresponding files in imagesDir
    await writeFile(path.join(imagesDir, 'fig-1.jpg'), 'fake-image-1')
    await writeFile(path.join(imagesDir, 'fig-deleted.jpg'), 'fake-image-deleted')
    await writeFile(path.join(imagesDir, 'unreferenced.jpg'), 'fake-unreferenced')
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('detects orphan entries in images.json not present in figures.json', async () => {
    const { orphanEntries, orphanFiles } = await findOrphanImages({
      dataFile,
      imagesFile,
      imagesDir,
    })

    expect(orphanEntries).toEqual(['fig-deleted'])
    expect(orphanFiles).toEqual(['unreferenced.jpg'])
  })

  it('cleans up orphan entries and unreferenced files when deleteFiles is true', async () => {
    const result = await cleanOrphans({
      dataFile,
      imagesFile,
      imagesDir,
      deleteFiles: true,
    })

    expect(result.deletedEntries).toBe(1)
    expect(result.deletedFiles).toBe(1)
    expect(result.orphanEntries).toEqual(['fig-deleted'])

    const updatedImages = JSON.parse(await readFile(imagesFile, 'utf8'))
    expect(updatedImages).toHaveProperty('fig-1')
    expect(updatedImages).not.toHaveProperty('fig-deleted')
  })

  it('fetch-images.mjs seeder script contains pruning of orphan images', async () => {
    const script = await readFile(path.join(ROOT, 'scripts/fetch-images.mjs'), 'utf8')
    expect(script).toContain('!figureSlugs.has(slug)')
    expect(script).toContain('delete existing[slug]')
  })

  it('validate-data.mjs validation script contains --fix support for orphan images', async () => {
    const script = await readFile(path.join(ROOT, 'scripts/validate-data.mjs'), 'utf8')
    expect(script).toContain('--fix')
    expect(script).toContain('delete images[slug]')
  })
})
