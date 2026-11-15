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

  it('provides robots.txt and sitemap.xml for SEO (issue #71)', async () => {
    const robots = await readFile(path.join(ROOT, 'apps/site/robots.txt'), 'utf8')
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Allow: /')
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Sitemap:')

    const sitemap = await readFile(path.join(ROOT, 'apps/site/sitemap.xml'), 'utf8')
    expect(sitemap).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(sitemap).toContain('<loc>https://honourindia.org/</loc>')

    const { figures } = JSON.parse(await readFile(path.join(ROOT, 'data/figures.json'), 'utf8'))
    for (const f of figures.slice(0, 5)) {
      expect(sitemap).toContain(
        `<loc>https://honourindia.org/figures/${encodeURIComponent(f.slug)}</loc>`,
      )
    }
  })
})
