#!/usr/bin/env node
/**
 * Verifies that every SRI hash advertised in the repo matches the built widget.
 *
 * SRI only protects embedders if the hash is regenerated whenever embed.js
 * changes. This script fails the build when a snippet, the demo page, or the
 * tests still advertise a stale digest.
 *
 * Usage: npm run check:sri   (run after npm run build)
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EMBED_FILE = path.join(ROOT, 'packages/embed/dist/embed.js')

const SOURCES = [
  'README.md',
  'apps/site/index.html',
  'apps/site/app.js',
  'apps/site/__tests__/app.test.js',
  'packages/embed/src/index.ts',
]

/** Returns the `sha384-…` integrity value for a buffer. */
export function sriFor(buffer) {
  return `sha384-${createHash('sha384').update(buffer).digest('base64')}`
}

/** Extracts every `sha384-…` token from a piece of text. */
export function extractSriHashes(text) {
  return Array.from(text.matchAll(/sha384-[A-Za-z0-9+/=]+/g), (match) => match[0])
}

async function main() {
  let embed
  try {
    embed = await readFile(EMBED_FILE)
  } catch {
    console.error(`Could not read ${EMBED_FILE}. Run npm run build first.`)
    process.exit(1)
  }

  const expected = sriFor(embed)
  let failed = false

  console.log(`Expected SRI hash: ${expected}`)
  for (const file of SOURCES) {
    let text
    try {
      text = await readFile(path.join(ROOT, file), 'utf8')
    } catch {
      console.error(`✗ ${file}: file not found`)
      failed = true
      continue
    }

    const hashes = [...new Set(extractSriHashes(text))]
    if (hashes.length === 0) {
      console.error(`✗ ${file}: no SRI hash found`)
      failed = true
      continue
    }

    for (const hash of hashes) {
      if (hash === expected) {
        console.log(`✓ ${file}: ${hash}`)
      } else {
        console.error(`✗ ${file}: ${hash} (expected ${expected})`)
        failed = true
      }
    }
  }

  if (failed) {
    console.error('\nSRI hashes are stale. Rebuild the widget and update every snippet.')
    process.exit(1)
  }

  console.log('\nAll SRI hashes match the built embed.js.')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
