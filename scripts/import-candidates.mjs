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
 *   era        — estimated from the birth year
 *   enduring   — false by default (needs human review)
 *   stillUsed  — null (needs human review)
 *   wiki       — the enwiki sitelink title
 *   commonsFile — the Wikimedia Commons file (portrait), if any
 *
 * Output: data/figures-new-candidates.json — review before merging into
 * data/figures.json. No source files are modified.
 *
 * Usage: node scripts/import-candidates.mjs   (or npm run import:candidates)
 * Requires: data/wikidata-candidates.json (from scripts/research-wikidata.mjs)
 */

import { readFile, writeFile } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CANDIDATES_FILE = path.join(ROOT, 'data', 'wikidata-candidates.json')
const DATA_FILE = path.join(ROOT, 'data', 'figures.json')
const OUT_FILE = path.join(ROOT, 'data', 'figures-new-candidates.json')

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function estimateEra(born) {
  if (born === null || born === undefined) return null
  if (born < 500) return 'Ancient'
  if (born < 1500) return 'Medieval'
  if (born < 1900) return 'Early Modern'
  if (born < 2000) return 'Modern'
  return 'Contemporary'
}

function truncateWords(value, maxChars = 180) {
  if (!value) return null
  if (value.length <= maxChars) return value
  const cut = value.slice(0, maxChars)
  const idx = cut.lastIndexOf(' ')
  return idx > 0 ? cut.slice(0, idx) : cut
}

async function main() {
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

    newCandidates.push({
      slug,
      name: c.name,
      born: c.born,
      died: c.died,
      field: c.field,
      tagline: truncateWords(c.description, 180),
      summary: c.description || null,
      quote: null,
      wiki: c.wiki,
      era: estimateEra(c.born),
      enduring: false,
      stillUsed: null,
      commonsFile: c.commonsFile,
    })
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
  console.log(`Review at ${OUT_FILE}, then merge into data/figures.json by hand.`)
}

import { createWriteStream } from 'node:fs'

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
