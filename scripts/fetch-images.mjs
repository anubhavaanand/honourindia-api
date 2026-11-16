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
 * API lookups are batched (up to 50 titles per request) and image downloads run
 * through a bounded worker pool, so seeding a large catalogue does not spend
 * minutes sleeping between requests. Idempotent: skips figures whose file
 * already exists and has a data/images.json entry.
 *
 * Usage:
 *   npm run seed:images
 *   node scripts/fetch-images.mjs --concurrency 6 --delay 100
 *   node scripts/fetch-images.mjs --slug cv-raman --limit 10
 */

import { mkdir, readFile, writeFile, access, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const IMAGES_DIR = path.join(ROOT, 'public/images')
const DATA_FILE = path.join(ROOT, 'data', 'figures.json')
const OUT_FILE = path.join(ROOT, 'data/images.json')

const UA =
  'HonourIndia-seed/0.1 (billboard project honouring Indian scientists; contact via repository)'
const THUMB_SIZE = 640
const API_BATCH_SIZE = 50
const DEFAULT_CONCURRENCY = 4
const DEFAULT_DELAY_MS = 250

const ENWIKI = 'https://en.wikipedia.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'

const HELP = `Usage: node scripts/fetch-images.mjs [options]

Options:
  --slug <slug>       Only seed the figure with this slug.
  --limit <n>         Process at most n new figures.
  --concurrency <n>   Parallel image downloads (1-16, default ${DEFAULT_CONCURRENCY}).
  --delay <ms>        Courtesy delay between Wikipedia API batches (0-60000, default ${DEFAULT_DELAY_MS}).
  -h, --help          Show this help.
`

function decodeEntities(s) {
  return (
    s
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
  )
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Splits an array into fixed-size batches. */
export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new Error('batch size must be a positive integer')
  const batches = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

/**
 * Runs `fn` over `items` with at most `limit` calls in flight, preserving the
 * input order in the returned array.
 */
export async function mapLimit(items, limit, fn) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer')
  const results = new Array(items.length)
  let next = 0

  const worker = async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function parsePositiveInt(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

/**
 * Builds a resolver for Wikipedia's `normalized`/`redirects` maps so a batch
 * response can be matched back to the titles we asked for.
 */
export function buildTitleAliasMap(data, requested = []) {
  const aliases = new Map()
  for (const entry of data?.query?.normalized ?? []) aliases.set(entry.from, entry.to)
  for (const entry of data?.query?.redirects ?? []) aliases.set(entry.from, entry.to)

  const resolve = (title) => {
    let current = title
    const seen = new Set()
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current)
      const next = aliases.get(current)
      if (next === undefined) break
      current = next
    }
    return current
  }

  for (const title of requested) aliases.set(title, resolve(title))
  return { aliases, resolve }
}

/** Extracts the lead-image fields used by the seeder from a pageimages page. */
export function pageImageFromPage(page) {
  return {
    thumb: page?.thumbnail?.source ?? null,
    file: page?.pageimage ?? null,
  }
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
      await sleep(wait)
    }
  }
}

/**
 * Fetches lead images for many articles in one request per 50 titles.
 * Returns a Map keyed by both the requested title and the resolved page title.
 */
export async function fetchLeadImages(
  wikiTitles,
  { delayMs = 0, batchSize = API_BATCH_SIZE } = {},
) {
  const byTitle = new Map()
  const titles = [...new Set(wikiTitles.filter(Boolean))]

  for (const batch of chunk(titles, batchSize)) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      redirects: 1,
      prop: 'pageimages',
      piprop: 'thumbnail|name',
      pithumbsize: String(THUMB_SIZE),
      titles: batch.join('|'),
    })
    const data = await fetchJsonRetry(`${ENWIKI}?${params}`)
    const { resolve } = buildTitleAliasMap(data, batch)

    for (const page of Object.values(data?.query?.pages ?? {})) {
      const value = pageImageFromPage(page)
      if (page.title) byTitle.set(page.title, value)
      const resolved = resolve(page.title)
      if (resolved) byTitle.set(resolved, value)
    }

    // Make the exact titles we asked for resolve even when Wikipedia
    // normalized or redirected them.
    for (const title of batch) {
      const value = byTitle.get(resolve(title)) ?? byTitle.get(title)
      if (value) byTitle.set(title, value)
    }

    if (delayMs > 0) await sleep(delayMs)
  }

  return byTitle
}

async function fetchImageInfo(host, fileNames, { delayMs = 0, batchSize = API_BATCH_SIZE } = {}) {
  const info = new Map()
  const names = [...new Set(fileNames.filter(Boolean))]

  for (const batch of chunk(names, batchSize)) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: String(THUMB_SIZE),
      titles: batch.map((name) => `File:${name}`).join('|'),
    })
    const data = await fetchJsonRetry(`${host}?${params}`)
    const requested = batch.map((name) => `File:${name}`)
    const { resolve } = buildTitleAliasMap(data, requested)

    for (const page of Object.values(data?.query?.pages ?? {})) {
      const imageInfo = page.imageinfo?.[0]
      if (!imageInfo || !page.title) continue
      const meta = imageInfo.extmetadata ?? {}
      const value = {
        thumb: imageInfo.thumburl ?? imageInfo.url ?? null,
        file: page.title.replace(/^File:/i, ''),
        credit: meta.Artist?.value ? decodeEntities(meta.Artist.value) : undefined,
        license: meta.LicenseShortName?.value
          ? decodeEntities(meta.LicenseShortName.value)
          : undefined,
        source: meta.Credit?.value ? decodeEntities(meta.Credit.value) : undefined,
      }
      const resolved = resolve(page.title).replace(/^File:/i, '')
      info.set(value.file, value)
      if (resolved !== value.file) info.set(resolved, value)
    }

    for (const name of batch) {
      const resolved = resolve(`File:${name}`).replace(/^File:/i, '')
      const value = info.get(resolved) ?? info.get(name)
      if (value) info.set(name, value)
    }

    if (delayMs > 0) await sleep(delayMs)
  }

  return info
}

/** Looks up file metadata on Commons, falling back to English Wikipedia. */
export async function fetchCommonsFiles(fileNames, options = {}) {
  const info = await fetchImageInfo(COMMONS, fileNames, options)
  const missing = [...new Set(fileNames.filter(Boolean))].filter(
    (name) => !info.has(name) || !info.get(name)?.thumb,
  )
  if (missing.length === 0) return info

  const fallback = await fetchImageInfo(ENWIKI, missing, options)
  for (const [name, value] of fallback) {
    if (!info.has(name) || !info.get(name)?.thumb) info.set(name, value)
  }
  return info
}

/** Batch license/author lookup for files that came from a lead image. */
export async function fetchLicenses(fileNames, options = {}) {
  const info = await fetchImageInfo(COMMONS, fileNames, options)
  const licenses = new Map()
  for (const [name, value] of info) {
    licenses.set(name, { credit: value.credit, license: value.license, source: value.source })
  }
  return licenses
}

/** Downloads an image with a few retries for transient network failures. */
export async function downloadImage(url, tries = 3) {
  let lastError
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`image download HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      lastError = err
      if (i < tries - 1) await sleep(500 * (i + 1))
    }
  }
  throw lastError
}

async function getLicense(fileName) {
  try {
    const info = await fetchLicenses([fileName])
    return info.get(fileName) ?? {}
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

function optionValue(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function parseOptions(args) {
  const slug = optionValue(args, '--slug')
  const limitRaw = optionValue(args, '--limit')
  const concurrencyRaw = optionValue(args, '--concurrency')
  const delayRaw = optionValue(args, '--delay')

  return {
    slug: slug ?? null,
    limit: limitRaw === undefined ? Infinity : parsePositiveInt(limitRaw, '--limit'),
    concurrency:
      concurrencyRaw === undefined
        ? DEFAULT_CONCURRENCY
        : parsePositiveInt(concurrencyRaw, '--concurrency', { min: 1, max: 16 }),
    delayMs:
      delayRaw === undefined
        ? DEFAULT_DELAY_MS
        : parsePositiveInt(delayRaw, '--delay', { min: 0, max: 60000 }),
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    console.log(HELP)
    return
  }

  let options
  try {
    options = parseOptions(args)
  } catch (err) {
    console.error(err.message)
    console.error(HELP)
    process.exit(1)
  }

  const { slug: targetSlug, limit, concurrency, delayMs } = options

  let figures = JSON.parse(await readFile(DATA_FILE, 'utf8')).figures
  if (targetSlug) {
    figures = figures.filter((f) => f.slug === targetSlug)
    if (!figures.length) {
      console.error(`Target slug "${targetSlug}" not found in figures.json`)
      process.exit(1)
    }
  }

  const figureSlugs = new Set(figures.map((f) => f.slug))
  await mkdir(IMAGES_DIR, { recursive: true })

  let existing = {}
  if (await exists(OUT_FILE)) {
    existing = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  }

  // Prune any orphan entries from existing whose figure was removed from figures.json (fixes #31)
  let cleaned = 0
  for (const slug of Object.keys(existing)) {
    if (!targetSlug && !figureSlugs.has(slug)) {
      delete existing[slug]
      cleaned++
    }
  }
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} orphaned image entry/entries from images.json`)
    await writeFile(OUT_FILE, JSON.stringify(existing, null, 2) + '\n')
  }

  const results = { ...existing }
  let skipped = 0
  const pending = []

  for (const figure of figures) {
    if (pending.length >= limit) break
    const prev = existing[figure.slug]
    if (prev && (await exists(path.join(IMAGES_DIR, prev.file)))) {
      results[figure.slug] = prev
      skipped++
      continue
    }
    pending.push(figure)
  }

  if (pending.length === 0) {
    console.log(`\nDone: 0 downloaded, ${skipped} already present, 0 failed/skipped.`)
    return
  }

  console.log(
    `Seeding ${pending.length} figure(s) with ${concurrency} parallel download(s), ${delayMs}ms between API batches…`,
  )

  // One pageimages request per 50 titles instead of one request per figure.
  const wikiTitles = pending.filter((f) => !f.commonsFile && f.wiki).map((f) => f.wiki)
  const leadImages = wikiTitles.length ? await fetchLeadImages(wikiTitles, { delayMs }) : new Map()

  const commonsFiles = pending.filter((f) => f.commonsFile).map((f) => f.commonsFile)
  const presets = commonsFiles.length
    ? await fetchCommonsFiles(commonsFiles, { delayMs })
    : new Map()

  const tasks = pending.map((figure) => {
    if (figure.commonsFile) {
      const preset = presets.get(figure.commonsFile)
      if (!preset) return { figure, error: `commonsFile not found: ${figure.commonsFile}` }
      return { figure, thumb: preset.thumb, file: preset.file, preset }
    }

    const lead = figure.wiki ? leadImages.get(figure.wiki) : undefined
    if (!lead?.thumb || !lead.file) return { figure, error: 'no lead image found' }
    return { figure, thumb: lead.thumb, file: lead.file, preset: null }
  })

  const licenseFiles = [
    ...new Set(tasks.filter((task) => !task.preset && !task.error).map((task) => task.file)),
  ]
  const licenses = licenseFiles.length ? await fetchLicenses(licenseFiles, { delayMs }) : new Map()

  let ok = 0
  const failed = []
  let saveChain = Promise.resolve()

  // Persist after every figure so the script is resumable across interruptions.
  const persist = () => {
    const snapshot = JSON.stringify(results, null, 2) + '\n'
    saveChain = saveChain.then(() => writeFile(OUT_FILE, snapshot)).catch(() => {})
    return saveChain
  }

  await mapLimit(tasks, concurrency, async (task) => {
    if (task.error) {
      failed.push(task.figure.slug)
      console.error(`  ✗ ${task.figure.slug}: ${task.error}`)
      await persist()
      return
    }

    try {
      const ext = (path.extname(new URL(task.thumb).pathname) || '.jpg').toLowerCase()
      const name = `${task.figure.slug}${ext}`
      const dest = path.join(IMAGES_DIR, name)

      const buf = await downloadImage(task.thumb)
      if (buf.length < 1000) throw new Error('image suspiciously small')
      await writeFile(dest, buf)

      let license
      if (task.preset) {
        license = {
          credit: task.preset.credit,
          license: task.preset.license,
          source: task.preset.source,
        }
      } else {
        license = licenses.get(task.file) ?? {}
        if (!license.license) license = await getLicense(task.file)
      }

      if (license.license && /fair/i.test(license.license)) {
        await unlink(dest).catch(() => {})
        throw new Error(`license "${license.license}" is Fair use — must not be served (see #95)`)
      }

      results[task.figure.slug] = { file: name, ...license }
      ok++
      console.log(`  ✓ ${task.figure.slug} (${name}, ${license.license ?? 'license unknown'})`)
    } catch (err) {
      failed.push(task.figure.slug)
      console.error(`  ✗ ${task.figure.slug}: ${err.message}`)
    }

    await persist()
  })

  await saveChain

  console.log(
    `\nDone: ${ok} downloaded, ${skipped} already present, ${failed.length} failed/skipped.`,
  )
  if (failed.length) {
    console.log(`Fallback (widget displays initial monograms): ${failed.join(', ')}`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
