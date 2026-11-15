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

const DELETE = process.argv.includes('--delete')

async function main() {
  const figures = JSON.parse(await readFile(DATA_FILE, 'utf8')).figures
  const figureSlugs = new Set(figures.map((f) => f.slug))

  let images = {}
  if (existsSync(IMAGES_FILE)) {
    images = JSON.parse(await readFile(IMAGES_FILE, 'utf8'))
  }

  const orphanEntries = []
  const missingFiles = []
  for (const [slug, img] of Object.entries(images)) {
    if (!figureSlugs.has(slug)) orphanEntries.push(slug)
    if (img.file && !existsSync(path.join(IMAGES_DIR, img.file))) missingFiles.push(`${slug} (${img.file})`)
  }

  const diskFiles = await readdir(IMAGES_DIR)

  if (DELETE) {
    for (const slug of orphanEntries) delete images[slug]
    const referencedFiles = new Set(Object.values(images).map((img) => img.file).filter(Boolean))
    const orphanFiles = diskFiles.filter((f) => !referencedFiles.has(f))
    for (const f of orphanFiles) await unlink(path.join(IMAGES_DIR, f))
    if (orphanEntries.length) {
      await writeFile(IMAGES_FILE, JSON.stringify(images, null, 2) + '\n')
    }
    console.log(`\nDeleted ${orphanEntries.length} images.json entr(y/ies) and ${orphanFiles.length} file(s).`)
  } else {
    const referencedFiles = new Set(Object.values(images).map((img) => img.file).filter(Boolean))
    const orphanFiles = diskFiles.filter((f) => !referencedFiles.has(f))
    console.log(`  unreferenced files on disk: ${orphanFiles.length}`)
    for (const f of orphanFiles) console.log(`    - public/images/${f}`)
    console.log('\nPass --delete to remove the orphans above.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})