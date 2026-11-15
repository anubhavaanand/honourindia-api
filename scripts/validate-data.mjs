#!/usr/bin/env node
/**
 * Validates data/figures.json and data/images.json.
 *
 * Structural errors (missing required fields, wrong types, orphaned image
 * references) exit non-zero. Known data-quality drift (figures missing the
 * newer era/enduring/stillUsed fields, fair-use portraits, duplicates) is
 * reported as warnings so it can be reviewed without breaking the build.
 *
 * Usage: npm run validate:data
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, 'data/figures.json')
const IMAGES_FILE = path.join(ROOT, 'data/images.json')
const IMAGES_DIR = path.join(ROOT, 'public/images')

const VALID_ERAS = new Set(['ancient', 'medieval', 'colonial', 'modern', 'living'])

const errors = []
const warnings = []

function error(msg) { errors.push(msg); console.error(`✗ ${msg}`) }
function warn(msg) { warnings.push(msg); console.warn(`⚠ ${msg}`) }

function slugOk(s) { return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s) }

async function main() {
  let raw
  try {
    raw = JSON.parse(await readFile(DATA_FILE, 'utf8'))
  } catch (err) {
    error(`figures.json is not valid JSON: ${err.message}`)
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`)
    process.exit(1)
  }

  const version = raw.version
  const figures = raw.figures
  if (!Array.isArray(figures) || figures.length === 0) {
    error('figures.json must contain a non-empty "figures" array')
  } else {
    if (version !== 1) warn(`figures.json version is "${version}", expected 1`)
    const seenSlugs = new Set()
    const seenWiki = new Map()
    const seenNameBorn = new Set()

    for (const f of figures) {
      const where = `figure ${f.slug ?? JSON.stringify(f.name)}`
      if (typeof f.slug !== 'string' || !slugOk(f.slug)) error(`${where}: slug missing or invalid`)
      else {
        if (seenSlugs.has(f.slug)) error(`${where}: duplicate slug "${f.slug}"`)
        seenSlugs.add(f.slug)
      }
      if (typeof f.name !== 'string' || !f.name) error(`${where}: name missing`)
      if (typeof f.born !== 'number') error(`${where}: born missing or not a number`)
      if (f.died !== null && typeof f.died !== 'number') error(`${where}: died must be a number or null`)
      if (typeof f.field !== 'string' || !f.field) error(`${where}: field missing`)
      if (typeof f.tagline !== 'string' || !f.tagline) error(`${where}: tagline missing`)
      if (typeof f.summary !== 'string' || !f.summary) error(`${where}: summary missing`)
      if (typeof f.wiki !== 'string' || !f.wiki) error(`${where}: wiki missing`)
      if (f.era !== undefined && !VALID_ERAS.has(f.era)) error(`${where}: invalid era "${f.era}"`)
      if (f.era === undefined) warn(`${where}: missing era (see #29)`)
      if (f.enduring === undefined) warn(`${where}: missing enduring (see #29)`)
      if (f.stillUsed === undefined) warn(`${where}: missing stillUsed (see #29)`)
      if (f.quote !== null && f.quote !== undefined) {
        if (typeof f.quote.text !== 'string') error(`${where}: quote.text must be a string`)
      }
      if (f.wiki) {
        if (seenWiki.has(f.wiki)) warn(`${where}: duplicate wiki title "${f.wiki}" (see #96)`)
        seenWiki.set(f.wiki, f.slug)
      }
      const key = `${String(f.name).trim().toLowerCase()}|${f.born ?? ''}`
      if (seenNameBorn.has(key)) warn(`${where}: duplicate name + birth year (see #96)`)
      seenNameBorn.add(key)
    }
  }

  let images
  try {
    images = existsSync(IMAGES_FILE) ? JSON.parse(await readFile(IMAGES_FILE, 'utf8')) : {}
  } catch (err) {
    error(`images.json is not valid JSON: ${err.message}`)
    process.exit(1)
  }

  const figureSlugs = new Set((raw.figures ?? []).map((f) => f.slug))
  for (const [slug, img] of Object.entries(images ?? {})) {
    if (!figureSlugs.has(slug)) error(`images.json: orphan entry for unknown slug "${slug}"`)
    if (!img.license) warn(`images.json: ${slug} has no license`)
    else if (/fair/i.test(img.license)) warn(`images.json: ${slug} is "Fair use" — must not be served (see #95)`)
    if (img.file && !existsSync(path.join(IMAGES_DIR, img.file))) error(`images.json: ${slug} references missing file "${img.file}"`)
  }

  console.log(`\nValidated ${figures?.length ?? 0} figures and ${Object.keys(images ?? {}).length} image entries`)
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`)
  if (errors.length) {
    console.log('Fix the errors above, then re-run: npm run validate:data')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})