import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { figures, toBillboard, toSummary } from '../lib/data.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('portrait seeding and monogram fallbacks (issue #32)', () => {
  it('fetch-images.mjs contains Fair Use license rejection logic (issue #95)', async () => {
    const script = await readFile(path.join(ROOT, 'scripts/fetch-images.mjs'), 'utf8')
    expect(script).toContain('/fair/i.test(license.license)')
    expect(script).toContain('unlink(dest)')
  })

  it('fetch-images.mjs supports --slug and --limit flags', async () => {
    const script = await readFile(path.join(ROOT, 'scripts/fetch-images.mjs'), 'utf8')
    expect(script).toContain('--slug')
    expect(script).toContain('--limit')
  })

  it('figures without seeded portraits cleanly fallback to image: null (for SVG monograms)', () => {
    const figuresWithoutPortraits = figures.filter((f) => f.image === null)
    expect(figuresWithoutPortraits.length).toBeGreaterThanOrEqual(70)

    for (const f of figuresWithoutPortraits) {
      const billboard = toBillboard(f)
      expect(billboard.image).toBeNull()

      const summary = toSummary(f)
      expect(summary.image).toBeNull()
    }
  })

  it('figures with seeded portraits carry valid image file and attribution', () => {
    const figuresWithPortraits = figures.filter((f) => f.image !== null)
    expect(figuresWithPortraits.length).toBe(63)

    for (const f of figuresWithPortraits) {
      expect(f.image?.file).toBeTruthy()
      const billboard = toBillboard(f)
      expect(billboard.image?.url).toContain('/images/')
    }
  })
})
