import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('research-wikidata script SPARQL query', () => {
  it('includes alternative paths for field of work (P101) and notable work (P800)', async () => {
    const script = await readFile(path.join(ROOT, 'scripts/research-wikidata.mjs'), 'utf8')

    // Verifies occupation path is present
    expect(script).toContain('?person wdt:P106 ?activity')

    // Verifies alternative field of work path is present for ancient figures lacking P106
    expect(script).toContain('?person wdt:P101 ?activity')
    expect(script).toContain('wd:Q11193') // Ayurveda
    expect(script).toContain('wd:Q395') // mathematics

    // Verifies alternative notable work path is present
    expect(script).toContain('?person wdt:P800 ?notableWork')
  })
})
