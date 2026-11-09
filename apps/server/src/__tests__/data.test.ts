import { describe, it, expect } from 'vitest'
import { figures, findBySlug, filterFigures, toBillboard, toSummary, sampleRandom } from '../lib/data.js'

describe('data.ts', () => {
  describe('figures', () => {
    it('is non-empty (catalogue scaled to 100+ figures)', () => {
      expect(figures.length).toBeGreaterThanOrEqual(100)
      expect(figures.length).toBeGreaterThan(0)
    })
  })

  describe('findBySlug', () => {
    it('returns the C. V. Raman record', () => {
      const f = findBySlug('cv-raman')
      expect(f).toBeDefined()
      expect(f!.slug).toBe('cv-raman')
      expect(f!.name).toBe('C. V. Raman')
    })

    it('returns undefined for an unknown slug', () => {
      expect(findBySlug('nope')).toBeUndefined()
    })
  })

  describe('toBillboard', () => {
    it('produces the full billboard shape', () => {
      const f = findBySlug('cv-raman')!
      const b = toBillboard(f)
      expect(b.slug).toBe('cv-raman')
      expect(b.name).toBe('C. V. Raman')
      expect(b.years).toBe('1888–1970')
      expect(b.field).toBe('Physics')
      expect(b.tagline).toBeTruthy()
      expect(b.quote).toEqual({ text: expect.any(String), source: 'widely attributed' })
      expect(b.link).toBe('https://en.wikipedia.org/wiki/C._V._Raman')
      expect(b.image).toMatchObject({ url: expect.any(String), credit: expect.any(String), license: expect.any(String) })
    })

    it('years for a living figure (died null) shows b. <born>', () => {
      const f = findBySlug('tessy-thomas')!
      expect(f.died).toBeNull()
      expect(toBillboard(f).years).toBe('b. 1963')
    })

    it('image is null when no image meta exists', () => {
      const noImage = figures.find((f) => f.image === null)
      expect(noImage).toBeDefined()
      expect(toBillboard(noImage!).image).toBeNull()
      expect(toSummary(noImage!).image).toBeNull()
    })
  })

  describe('toSummary', () => {
    it('produces the lighter summary shape', () => {
      const f = findBySlug('cv-raman')!
      const s = toSummary(f)
      expect(s.slug).toBe('cv-raman')
      expect(s.name).toBe('C. V. Raman')
      expect(s.years).toBe('1888–1970')
      expect(s.field).toBe('Physics')
      expect(s.tagline).toBeTruthy()
      expect(s.image).toMatchObject({ url: expect.any(String) })
      expect(Object.keys(s.image!)).toEqual(['url'])
      expect(s.link).toBe('https://en.wikipedia.org/wiki/C._V._Raman')
    })
  })

  describe('sampleRandom', () => {
    it('returns exactly n items when n <= figures.length', () => {
      const n = 5
      expect(sampleRandom(n).length).toBe(n)
    })

    it('has no duplicates when n <= figures.length', () => {
      const out = sampleRandom(10)
      const slugs = out.map((f) => f.slug)
      expect(new Set(slugs).size).toBe(slugs.length)
    })

    it('all items are members of figures', () => {
      const out = sampleRandom(10)
      const slugs = new Set(figures.map((f) => f.slug))
      out.forEach((f) => expect(slugs.has(f.slug)).toBe(true))
    })

    it('returns figures.length items (capped) when n > figures.length', () => {
      const out = sampleRandom(figures.length + 5)
      expect(out.length).toBe(figures.length)
    })

    it('sampleRandom(0) returns []', () => {
      expect(sampleRandom(0)).toEqual([])
    })
  })

  describe('filterFigures', () => {
    it('filter by field returns matching figures only', () => {
      const out = filterFigures({ field: 'physics' })
      expect(out.length).toBeGreaterThan(0)
      expect(out.every((f) => f.field.toLowerCase().includes('physics'))).toBe(true)
    })

    it('search matches name/tagline/summary', () => {
      const out = filterFigures({ search: 'Raman' })
      expect(out.some((f) => f.name.toLowerCase().includes('raman'))).toBe(true)
    })

    it('enduring=true returns only enduring figures', () => {
      const out = filterFigures({ enduring: true })
      expect(out.every((f) => f.enduring === true)).toBe(true)
    })

    it('enduring=false returns only non-enduring figures', () => {
      const out = filterFigures({ enduring: false })
      expect(out.every((f) => f.enduring === false)).toBe(true)
    })

    it('limit caps results', () => {
      const out = filterFigures({ limit: 5 })
      expect(out.length).toBeLessThanOrEqual(5)
    })

    it('offset skips results', () => {
      const full = filterFigures({})
      const out = filterFigures({ offset: full.length - 1 })
      expect(out.length).toBe(1)
    })

    it('combined filters work', () => {
      const out = filterFigures({ field: 'mathematics', enduring: true, limit: 10, offset: 0 })
      expect(out.length).toBeLessThanOrEqual(10)
      expect(out.every((f) => f.field.toLowerCase().includes('mathematics') && f.enduring === true)).toBe(true)
    })
  })
})
