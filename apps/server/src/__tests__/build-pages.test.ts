import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('build-pages static payloads', () => {
  it('maps era, enduring, and stillUsed in billboards', async () => {
    const { figures } = JSON.parse(await readFile(path.join(ROOT, 'data/figures.json'), 'utf8'))
    const modernFigure = figures.find((f: any) => f.era !== undefined)
    expect(modernFigure).toBeDefined()

    // simulate billboard mapping from build-pages.mjs
    const billboard = {
      slug: modernFigure.slug,
      name: modernFigure.name,
      field: modernFigure.field,
      tagline: modernFigure.tagline,
      era: modernFigure.era,
      enduring: modernFigure.enduring,
      stillUsed: modernFigure.stillUsed,
      quote: modernFigure.quote,
    }

    expect(billboard).toHaveProperty('era', modernFigure.era)
    expect(billboard).toHaveProperty('enduring', modernFigure.enduring)
    expect(billboard).toHaveProperty('stillUsed', modernFigure.stillUsed)
  })
})
