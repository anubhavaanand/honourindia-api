#!/usr/bin/env node
/**
 * Keeps the widget bundle inside its budget.
 *
 * embed.js is the one asset every embedder downloads, so its size is a
 * product decision rather than an implementation detail. The build fails when
 * it grows past BUDGET_BYTES, which forces the tradeoff to be a deliberate
 * one instead of an accident.
 *
 * Usage: npm run check:size
 */

import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BUNDLE = path.join(ROOT, 'packages/embed/dist/embed.js')

/** Widget budget in bytes. Raise this deliberately, in its own commit. */
const BUDGET_BYTES = 24 * 1024

function format(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`
}

const raw = await readFile(BUNDLE)
const gzipped = gzipSync(raw)

console.log(
  `embed.js: ${format(raw.length)} raw · ${format(gzipped.length)} gzipped · budget ${format(BUDGET_BYTES)}`,
)

if (raw.length > BUDGET_BYTES) {
  console.error(`✗ embed.js is ${format(raw.length - BUDGET_BYTES)} over budget.`)
  console.error(
    '  Trim the widget, or raise BUDGET_BYTES in scripts/check-bundle-size.mjs on purpose.',
  )
  process.exit(1)
}

console.log('✓ within budget')
