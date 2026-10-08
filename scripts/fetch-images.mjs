#!/usr/bin/env node
/**
 * Seeds public/images with portraits for every figure in data/figures.json.
 *
 * For each figure it:
 *   1. asks the English Wikipedia API for the article's lead image (640px thumbnail),
 *   2. downloads it to public/images/<slug>.<ext>,
 *   3. asks Wikimedia Commons for the file's author and license,
 *   4. records everything in data/images.json (used by the API for attribution).
 *
 * Idempotent: skips figures whose file already exists and has a data/images.json entry.
 * Usage: npm run seed:images
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public/images')
const DATA_FILE = path.join(ROOT, 'data/figures.json')
const OUT_FILE = path.join(ROOT, 'data/images.json')

const UA = 'HonourIndia-seed/0.1 (billboard project honouring Indian scientists; contact via repository)'
const THUMB_SIZE = 640

const ENWIKI = 'https://en.wikipedia.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'

function decodeEntities(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Commons templates sometimes emit the same segment twice (e.g. "Unknown authorUnknown author")
    .replace(/(Unknown author|Unknown|Not mentioned)(\s*\1)+/gi, '$1')
    // some Artist fields hold a bare URL — unusable as on-billboard credit
    .replace(/^https?:\/\/\S+$/i, 'Wikimedia Commons')
    .replace(/\s+/g, ' ')
    .trim()
}

async function apiGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function fetchJsonRetry(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      return await apiGet(url)
    } catch (err) {
      if (i === tries - 1) throw err
      // Wikipedia rate-limits bursty traffic (429); back off generously.
      const wait = err.message.includes('429') ? 12000 * (i + 1) : 1500 * (i + 1)
      console.log(`    …retrying in ${wait / 1000}s (${err.message})`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

async function getLeadImage(wikiTitle) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    redirects: 1,
    prop: 'pageimages',
    piprop: 'thumbnail|name',
    pithumbsize: String(THUMB_SIZE),
    titles: wikiTitle,
  })
  const data = await fetchJsonRetry(`${ENWIKI}?${params}`)
  const pages = data?.query?.pages ?? {}
  const page = Object.values(pages)[0]
  if (!page || page.missing !== undefined) {
    return { thumb: null, file: null }
  }
  return {
    thumb: page.thumbnail?.source ?? null,
    file: page.pageimage ?? null, // File:Name.ext (without the File: prefix)
  }
}

/** Direct file lookup for figures whose article has no flagged lead image. Tries Commons, then local enwiki files. */
async function getCommonsFile(fileName) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(THUMB_SIZE),
    titles: `File:${fileName}`,
  })
  for (const host of [COMMONS, ENWIKI]) {
    const data = await fetchJsonRetry(`${host}?${params}`)
    const page = Object.values(data?.query?.pages ?? {})[0]
    const info = page?.imageinfo?.[0]
    if (!info) continue
    const meta = info.extmetadata ?? {}
    return {
      thumb: info.thumburl ?? info.url ?? null,
      file: fileName,
      credit: meta.Artist?.value ? decodeEntities(meta.Artist.value) : undefined,
      license: meta.LicenseShortName?.value ? decodeEntities(meta.LicenseShortName.value) : undefined,
      source: meta.Credit?.value ? decodeEntities(meta.Credit.value) : undefined,
    }
  }
  return null
}

async function getLicense(fileName) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'extmetadata',
    titles: `File:${fileName}`,
  })
  try {
    const data = await fetchJsonRetry(`${COMMONS}?${params}`)
    const pages = data?.query?.pages ?? {}
    const page = Object.values(pages)[0]
    const meta = page?.imageinfo?.[0]?.extmetadata
    if (!meta) return {}
    return {
      credit: meta.Artist?.value ? decodeEntities(meta.Artist.value) : undefined,
      license: meta.LicenseShortName?.value ? decodeEntities(meta.LicenseShortName.value) : undefined,
      source: meta.Credit?.value ? decodeEntities(meta.Credit.value) : undefined,
    }
  } catch {
    return {} // attribution falls back to "Wikimedia Commons" in the widget
  }
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const figures = JSON.parse(await readFile(DATA_FILE, 'utf8')).figures
  await mkdir(IMAGES_DIR, { recursive: true })

  let existing = {}
  if (await exists(OUT_FILE)) {
    existing = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  }

  const results = { ...existing }
  let ok = 0
  let skipped = 0
  let failed = []

  for (const f of figures) {
    const prev = existing[f.slug]
    if (prev && (await exists(path.join(IMAGES_DIR, prev.file)))) {
      results[f.slug] = prev
      skipped++
      continue
    }

    try {
      let thumb, file, preset
      if (f.commonsFile) {
        preset = await getCommonsFile(f.commonsFile)
        if (!preset) throw new Error(`commonsFile not found: ${f.commonsFile}`)
        ;({ thumb, file } = preset)
      } else {
        ;({ thumb, file } = await getLeadImage(f.wiki))
      }
      if (!thumb || !file) throw new Error('no lead image found')

      const ext = (path.extname(new URL(thumb).pathname) || '.jpg').toLowerCase()
      const name = `${f.slug}${ext}`
      const dest = path.join(IMAGES_DIR, name)

      const imgRes = await fetch(thumb, { headers: { 'User-Agent': UA } })
      if (!imgRes.ok) throw new Error(`image download HTTP ${imgRes.status}`)
      const buf = Buffer.from(await imgRes.arrayBuffer())
      if (buf.length < 1000) throw new Error('image suspiciously small')
      await writeFile(dest, buf)

      const license = preset
        ? { credit: preset.credit, license: preset.license, source: preset.source }
        : await getLicense(file)
      results[f.slug] = { file: name, ...license }
      ok++
      console.log(`  ✓ ${f.slug} (${name}, ${license.license ?? 'license unknown'})`)
    } catch (err) {
      failed.push(f.slug)
      console.error(`  ✗ ${f.slug}: ${err.message}`)
    }

    // be polite to the APIs
    await new Promise((r) => setTimeout(r, 500))
  }

  await writeFile(OUT_FILE, JSON.stringify(results, null, 2) + '\n')

  console.log(`\nDone: ${ok} downloaded, ${skipped} already present, ${failed.length} failed.`)
  if (failed.length) {
    console.log(`Failed (widget will show initials fallback): ${failed.join(', ')}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
