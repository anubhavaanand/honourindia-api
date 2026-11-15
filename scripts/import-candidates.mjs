#!/usr/bin/env node
/**
 * Imports Wikidata research candidates into the catalogue shape used by
 * data/figures.json, skipping anyone already present.
 *
 * For each candidate not already in figures.json (matched by slug or wiki
 * title) it generates:
 *   slug       — from the name
 *   tagline    — from the description, truncated to one billboard line
 *   summary    — from the description
 *   era        — estimated from the birth year (and death year for living)
 *   enduring   — auto-marked via heuristic (ancient/medieval, stillUsed, key terms)
 *                or forced true via --all-enduring / --enduring flag
 *   stillUsed  — from candidate if available, else null
 *   wiki       — the enwiki sitelink title
 *   commonsFile — the Wikimedia Commons file (portrait), if any
 *
 * Output: data/figures-new-candidates.json — review before merging into
 * data/figures.json. No source files are modified.
 *
 * Usage:
 *   node scripts/import-candidates.mjs                  # use smart heuristics
 *   node scripts/import-candidates.mjs --all-enduring   # mark all as enduring
 *   node scripts/import-candidates.mjs --dry-run        # preview without writing
 *
 * Requires: data/wikidata-candidates.json (from scripts/research-wikidata.mjs)
 */

import { readFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CANDIDATES_FILE = path.join(ROOT, 'data', 'wikidata-candidates.json')
const DATA_FILE = path.join(ROOT, 'data', 'figures.json')
const OUT_FILE = path.join(ROOT, 'data', 'figures-new-candidates.json')

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function estimateEra(born, died) {
  if (born === null || born === undefined) return null
  if (born <= 1200) return 'ancient'
  if (born <= 1700) return 'medieval'
  if (born <= 1920) return 'colonial'
  if (died === null || died === undefined) return 'living'
  return 'modern'
}

export function truncateWords(value, maxChars = 180) {
  if (!value) return null
  if (value.length <= maxChars) return value
  const cut = value.slice(0, maxChars)
  const idx = cut.lastIndexOf(' ')
  return idx > 0 ? cut.slice(0, idx) : cut
}

/**
 * Heuristic to auto-mark clearly enduring figures (fixes #34).
 * Auto-marks:
 *  - When --all-enduring or --enduring flag is set
 *  - Candidates with non-empty stillUsed data
 *  - Figures already marked enduring in the candidate source
 *  - Ancient or medieval figures whose contributions survived across centuries/millennia
 *  - Figures with key discovery, invention, theorem, or prize keywords in their description
 */
export function isLikelyEnduring(candidate, era, options = {}) {
  if (options.allEnduring) return true
  if (candidate.stillUsed) return true
  if (candidate.enduring === true) return true

  // Ancient & medieval figures recorded in history are enduring by definition
  if (era === 'ancient' || era === 'medieval') return true

  // Keyword heuristic on description / summary
  const text = `${candidate.description || ''} ${candidate.summary || ''}`.toLowerCase()
  if (
    /\b(discovered|invented|theorem|formula|constant|law of|founded|father of|mother of|pioneer|effect|nobel prize|bharat ratna)\b/i.test(
      text,
    )
  ) {
    return true
  }

  return false
}

export function transformCandidate(c, options = {}) {
  const era = estimateEra(c.born, c.died)
  const enduring = isLikelyEnduring(c, era, options)
  return {
    slug: slugify(c.name),
    name: c.name,
    born: c.born,
    died: c.died,
    field: c.field,
    tagline: truncateWords(c.description, 180),
    summary: c.description || null,
    quote: null,
    wiki: c.wiki,
    era,
    enduring,
    stillUsed: c.stillUsed ?? null,
    commonsFile: c.commonsFile,
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const allEnduring = process.argv.includes('--all-enduring') || process.argv.includes('--enduring')
  const candidates = JSON.parse(await readFile(CANDIDATES_FILE, 'utf8'))
  const existing = JSON.parse(await readFile(DATA_FILE, 'utf8'))

  const existingSlugs = new Set(existing.figures.map((f) => f.slug))
  const existingWiki = new Set(existing.figures.map((f) => f.wiki).filter(Boolean))

  const newCandidates = []
  let skipped = 0

  for (const c of candidates) {
    const slug = slugify(c.name)
    if (existingSlugs.has(slug) || (c.wiki && existingWiki.has(c.wiki))) {
      skipped++
      continue
    }

    newCandidates.push(transformCandidate(c, { allEnduring }))
  }

  if (dryRun) {
    console.log(`Dry run: would write ${newCandidates.length} new candidates to ${OUT_FILE}`)
    console.log(`Candidates in wikidata-candidates.json: ${candidates.length}`)
    console.log(`Already in figures.json (skipped):    ${skipped}`)
    const enduringCount = newCandidates.filter((c) => c.enduring).length
    console.log(`Auto-marked enduring:                 ${enduringCount}/${newCandidates.length}`)
    return
  }

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(OUT_FILE)
    stream.write(JSON.stringify(newCandidates, null, 2) + '\n')
    stream.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  console.log(`Candidates in wikidata-candidates.json: ${candidates.length}`)
  console.log(`Already in figures.json (skipped):    ${skipped}`)
  console.log(`New candidates written:               ${newCandidates.length}`)
  const enduringCount = newCandidates.filter((c) => c.enduring).length
  console.log(`Auto-marked enduring:                 ${enduringCount}/${newCandidates.length}`)
  console.log(`Review at ${OUT_FILE}, then merge into data/figures.json by hand.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
