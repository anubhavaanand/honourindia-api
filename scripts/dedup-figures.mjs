#!/usr/bin/env node
/**
 * Detects duplicates in data/figures.json so they can be reviewed before the
 * catalogue is scaled.
 *
 * Checks:
 *   1. Duplicate slugs (exact match on the stable id)
 *   2. Same Wikipedia title (wiki field) → likely the same person
 *   3. Same name + birth year → likely the same person
 *
 * No records are modified or merged — this is a review-only report.
 *
 * Usage: node scripts/dedup-figures.mjs   (or npm run dedup:figures)
 */

import { readFile, writeFile } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, 'data', 'figures.json')
const REPORT_FILE = path.join(ROOT, 'data', 'duplicates-report.json')

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function main() {
  const { figures } = JSON.parse(await readFile(DATA_FILE, 'utf8'))

  const slugSeen = new Map()
  const wikiSeen = new Map()
  const nameBornSeen = new Map()

  const dupSlugs = []
  const dupWiki = []
  const dupNameBorn = []

  for (const f of figures) {
    const slug = f.slug || slugify(f.name)
    if (slugSeen.has(slug)) {
      dupSlugs.push({ slug, name: f.name, firstSeenAs: slugSeen.get(slug) })
    } else {
      slugSeen.set(slug, f.name)
    }

    if (f.wiki) {
      if (wikiSeen.has(f.wiki)) {
        dupWiki.push({ wiki: f.wiki, name: f.name, firstSeenAs: wikiSeen.get(f.wiki) })
      } else {
        wikiSeen.set(f.wiki, f.name)
      }
    }

    const key = `${String(f.name ?? '').trim().toLowerCase()}|${f.born ?? ''}`
    if (nameBornSeen.has(key)) {
      dupNameBorn.push({ name: f.name, born: f.born, firstSeenAs: nameBornSeen.get(key) })
    } else {
      nameBornSeen.set(key, f.name)
    }
  }

  const report = {
    source: DATA_FILE,
    totalFigures: figures.length,
    duplicateSlugs: dupSlugs,
    duplicateWikiTitles: dupWiki,
    duplicateNameAndBirthYear: dupNameBorn,
  }

  console.log(`Duplicate report for ${DATA_FILE}`)
  console.log(`Total figures: ${figures.length}`)
  console.log(`Duplicate slugs: ${dupSlugs.length}`)
  for (const d of dupSlugs) {
    console.log(`  - slug "${d.slug}": "${d.name}" (first seen as "${d.firstSeenAs}")`)
  }
  console.log(`Potential duplicates — same wiki title: ${dupWiki.length}`)
  for (const d of dupWiki) {
    console.log(`  - wiki "${d.wiki}": "${d.name}" (first seen as "${d.firstSeenAs}")`)
  }
  console.log(`Potential duplicates — same name + birth year: ${dupNameBorn.length}`)
  for (const d of dupNameBorn) {
    console.log(`  - "${d.name}" born ${d.born} (first seen as "${d.firstSeenAs}")`)
  }
  const total = dupSlugs.length + dupWiki.length + dupNameBorn.length
  console.log(`\n${total} potential duplicate group(s) flagged. No records were changed. Review ${REPORT_FILE} before merging.`)

  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
