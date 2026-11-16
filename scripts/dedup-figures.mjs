#!/usr/bin/env node
/**
 * Detects duplicates in data/figures.json and, with --fix, merges the obvious
 * ones so the catalogue can be scaled safely.
 *
 * Checks:
 *   1. Duplicate slugs (exact match on the stable id)
 *   2. Same Wikipedia title (wiki field) → likely the same person
 *   3. Same name + birth year → likely the same person (report-only by default)
 *
 * --fix merges exact duplicates (same slug or same wiki title) into the first
 * record, filling missing fields from the later record. Name + birth-year
 * matches are only merged when --include-name-born is passed.
 *
 * Usage:
 *   node scripts/dedup-figures.mjs                  # review-only report
 *   node scripts/dedup-figures.mjs --fix            # merge obvious duplicates
 *   node scripts/dedup-figures.mjs --fix --dry-run  # show what would change
 *   node scripts/dedup-figures.mjs --include-name-born
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_FILE = path.join(ROOT, 'data', 'figures.json')
const REPORT_FILE = path.join(ROOT, 'data', 'duplicates-report.json')

const HELP = `Usage: node scripts/dedup-figures.mjs [options]

Options:
  --fix                 Merge exact duplicates (same slug or same wiki title).
  --dry-run             With --fix, report what would change without writing.
  --include-name-born   Also merge same name + birth year (less certain).
  -h, --help            Show this help.
`

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function nameBornKey(figure) {
  return `${String(figure.name ?? '')
    .trim()
    .toLowerCase()}|${figure.born ?? ''}`
}

function pushDuplicate(list, key, name, firstSeenAs) {
  list.push({ key, name, firstSeenAs })
}

export function findDuplicateGroups(figures) {
  const slugSeen = new Map()
  const wikiSeen = new Map()
  const nameBornSeen = new Map()

  const duplicateSlugs = []
  const duplicateWikiTitles = []
  const duplicateNameAndBirthYear = []

  for (const figure of figures) {
    const slug = figure.slug || slugify(figure.name)
    if (slugSeen.has(slug)) {
      pushDuplicate(duplicateSlugs, slug, figure.name, slugSeen.get(slug))
    } else {
      slugSeen.set(slug, figure.name)
    }

    if (figure.wiki) {
      if (wikiSeen.has(figure.wiki)) {
        pushDuplicate(duplicateWikiTitles, figure.wiki, figure.name, wikiSeen.get(figure.wiki))
      } else {
        wikiSeen.set(figure.wiki, figure.name)
      }
    }

    const nameBorn = nameBornKey(figure)
    if (nameBornSeen.has(nameBorn)) {
      pushDuplicate(duplicateNameAndBirthYear, nameBorn, figure.name, nameBornSeen.get(nameBorn))
    } else {
      nameBornSeen.set(nameBorn, figure.name)
    }
  }

  return {
    duplicateSlugs,
    duplicateWikiTitles,
    duplicateNameAndBirthYear,
  }
}

const MERGEABLE_FIELDS = [
  'born',
  'died',
  'field',
  'tagline',
  'summary',
  'quote',
  'wiki',
  'era',
  'enduring',
  'stillUsed',
  'attribution',
  'imageNote',
  'commonsFile',
]

/** Copies fields that are missing from `target` into it. Returns true if anything changed. */
function fillMissing(target, source) {
  let changed = false
  for (const field of MERGEABLE_FIELDS) {
    const value = source[field]
    if (value === undefined || value === null) continue
    const current = target[field]
    if (current === undefined || current === null || current === '') {
      target[field] = value
      changed = true
    }
  }
  return changed
}

/**
 * Merges exact duplicates into their first occurrence.
 *
 * A duplicate is:
 *   - the same slug, or
 *   - the same wiki title, or
 *   - the same name + birth year when `includeNameBorn` is true.
 *
 * The first record wins on conflicts; later records only fill fields that are
 * missing from it. The input array is not mutated.
 */
export function mergeDuplicates(figures, { includeNameBorn = false } = {}) {
  const output = []
  const merged = []
  const bySlug = new Map()
  const byWiki = new Map()
  const byNameBorn = new Map()

  const index = (figure) => {
    const slug = figure.slug || slugify(figure.name)
    bySlug.set(slug, figure)
    if (figure.wiki) byWiki.set(figure.wiki, figure)
    if (includeNameBorn) byNameBorn.set(nameBornKey(figure), figure)
  }

  for (const figure of figures) {
    const slug = figure.slug || slugify(figure.name)
    const wiki = figure.wiki || null
    const nameBorn = includeNameBorn ? nameBornKey(figure) : null

    let canonical = bySlug.get(slug)
    let reason = canonical ? 'duplicate slug' : null

    if (!canonical && wiki) {
      canonical = byWiki.get(wiki)
      if (canonical) reason = 'same wiki title'
    }

    if (!canonical && nameBorn) {
      canonical = byNameBorn.get(nameBorn)
      if (canonical) reason = 'same name and birth year'
    }

    if (!canonical) {
      const copy = { ...figure }
      output.push(copy)
      index(copy)
      continue
    }

    const fieldsMerged = fillMissing(canonical, figure)
    // The merged record may now carry a wiki/name the first one lacked.
    if (!byWiki.has(canonical.wiki) && canonical.wiki) byWiki.set(canonical.wiki, canonical)
    if (includeNameBorn && !byNameBorn.has(nameBornKey(canonical))) {
      byNameBorn.set(nameBornKey(canonical), canonical)
    }

    merged.push({
      slug: figure.slug || slug,
      name: figure.name,
      reason,
      kept: canonical.slug || slug,
      fieldsMerged,
    })
  }

  return { figures: output, merged }
}

export function parseArgs(argv) {
  const options = { fix: false, dryRun: false, includeNameBorn: false, help: false }
  for (const arg of argv) {
    switch (arg) {
      case '--fix':
        options.fix = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--include-name-born':
        options.includeNameBorn = true
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    console.error(HELP)
    process.exit(1)
  }

  if (options.help) {
    console.log(HELP)
    return
  }

  const data = JSON.parse(await readFile(DATA_FILE, 'utf8'))
  const figures = data.figures

  const groups = findDuplicateGroups(figures)
  const total =
    groups.duplicateSlugs.length +
    groups.duplicateWikiTitles.length +
    groups.duplicateNameAndBirthYear.length

  console.log(`Duplicate report for ${DATA_FILE}`)
  console.log(`Total figures: ${figures.length}`)
  console.log(`Duplicate slugs: ${groups.duplicateSlugs.length}`)
  for (const d of groups.duplicateSlugs) {
    console.log(`  - slug "${d.key}": "${d.name}" (first seen as "${d.firstSeenAs}")`)
  }
  console.log(`Potential duplicates — same wiki title: ${groups.duplicateWikiTitles.length}`)
  for (const d of groups.duplicateWikiTitles) {
    console.log(`  - wiki "${d.key}": "${d.name}" (first seen as "${d.firstSeenAs}")`)
  }
  console.log(
    `Potential duplicates — same name + birth year: ${groups.duplicateNameAndBirthYear.length}`,
  )
  for (const d of groups.duplicateNameAndBirthYear) {
    console.log(`  - "${d.name}" (${d.key}) (first seen as "${d.firstSeenAs}")`)
  }

  const report = {
    source: DATA_FILE,
    totalFigures: figures.length,
    ...groups,
  }

  if (!options.fix) {
    console.log(`\n${total} potential duplicate group(s) flagged. No records were changed.`)
    console.log(`Review ${REPORT_FILE} before merging, or re-run with --fix.`)
    await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n')
    return
  }

  const { figures: mergedFigures, merged } = mergeDuplicates(figures, {
    includeNameBorn: options.includeNameBorn,
  })

  report.merged = merged
  report.mergedCount = merged.length
  report.remainingFigures = mergedFigures.length

  if (merged.length === 0) {
    console.log('\nNo automatic duplicates to merge.')
    await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n')
    return
  }

  for (const m of merged) {
    console.log(`  - merged "${m.name}" (${m.reason}) into "${m.kept}"`)
  }

  if (options.dryRun) {
    console.log(`\nDry run: ${merged.length} figure(s) would be merged. No files changed.`)
  } else {
    data.figures = mergedFigures
    await writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
    console.log(
      `\nMerged ${merged.length} figure(s). ${mergedFigures.length} unique records remain.`,
    )
    console.log(`Updated ${DATA_FILE}`)
  }

  await writeFile(REPORT_FILE, JSON.stringify(report, null, 2) + '\n')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
