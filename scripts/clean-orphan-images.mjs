#!/usr/bin/env node
/**
 * Reports (and optionally removes) orphaned images.
 *
 * Orphans:
 *   * entries in data/images.json whose slug is not in data/figures.json
 *   * entries whose image file is missing from public/images/
 *   * files in public/images/ not referenced by any images.json entry
 *
 * Defaults to a dry-run report. Pass --delete to remove orphan files and
 * rewrite data/images.json without its orphan entries.
 *
 * Usage:
 *   node scripts/clean-orphan-images.mjs        # dry-run report
 *   node scripts/clean-orphan-images.mjs --delete  # remove orphans
 */
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, 'data/figures.json')
const IMAGES_FILE = path.join(ROOT, 'data/images.json')
const IMAGES_DIR = path.join(ROOT, 'public/images')

export async function findOrphanImages({
  dataFile = DATA_FILE,
  imagesFile = IMAGES_FILE,
  imagesDir = IMAGES_DIR,
} = {}) {
  const figures = JSON.parse(await readFile(dataFile, 'utf8')).figures
  const figureSlugs = new Set(figures.map((f) => f.slug))

  let images = {}
  if (existsSync(imagesFile)) {
    images = JSON.parse(await readFile(imagesFile, 'utf8'))
  }

  const orphanEntries = []
  const missingFiles = []
  for (const [slug, img] of Object.entries(images)) {
    if (!figureSlugs.has(slug)) orphanEntries.push(slug)
    if (img.file && !existsSync(path.join(imagesDir, img.file)))
      missingFiles.push(`${slug} (${img.file})`)
  }

  let diskFiles = []
  if (existsSync(imagesDir)) {
    diskFiles = await readdir(imagesDir)
  }
  const referencedFiles = new Set(
    Object.values(images)
      .map((img) => img.file)
      .filter(Boolean),
  )
  const orphanFiles = diskFiles.filter((f) => !referencedFiles.has(f))

  return { orphanEntries, missingFiles, orphanFiles, images }
}

export async function cleanOrphans({
  dataFile = DATA_FILE,
  imagesFile = IMAGES_FILE,
  imagesDir = IMAGES_DIR,
  deleteFiles = false,
} = {}) {
  const { orphanEntries, missingFiles, orphanFiles, images } = await findOrphanImages({
    dataFile,
    imagesFile,
    imagesDir,
  })

  if (deleteFiles) {
    for (const slug of orphanEntries) delete images[slug]
    for (const f of orphanFiles) await unlink(path.join(imagesDir, f))
    if (orphanEntries.length) {
      await writeFile(imagesFile, JSON.stringify(images, null, 2) + '\n')
    }
  }

  return {
    deletedEntries: deleteFiles ? orphanEntries.length : 0,
    deletedFiles: deleteFiles ? orphanFiles.length : 0,
    orphanEntries,
    missingFiles,
    orphanFiles,
  }
}

async function main() {
  const DELETE = process.argv.includes('--delete')
  const result = await cleanOrphans({ deleteFiles: DELETE })

  console.log(`Report:`)
  console.log(`  orphan entries in images.json: ${result.orphanEntries.length}`)
  for (const slug of result.orphanEntries) console.log(`    - ${slug}`)
  console.log(`  missing files referenced: ${result.missingFiles.length}`)
  for (const f of result.missingFiles) console.log(`    - ${f}`)
  console.log(`  unreferenced files on disk: ${result.orphanFiles.length}`)
  for (const f of result.orphanFiles) console.log(`    - public/images/${f}`)

  if (DELETE) {
    console.log(
      `\nDeleted ${result.deletedEntries} images.json entr(y/ies) and ${result.deletedFiles} file(s).`,
    )
  } else if (result.orphanEntries.length || result.orphanFiles.length) {
    console.log('\nPass --delete to remove the orphans above.')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
