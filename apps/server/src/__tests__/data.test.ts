import { describe, it, expect } from 'vitest'
import { figures, findBySlug, toBillboard, toSummary, sampleRandom } from '../lib/data.js'

describe('data.ts', () => {
  describe('figures', () => {
    it('is non-empty (28 figures)', () => {
      expect(figures.length).toBe(28)
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
      expect(s.quote).toBeUndefined()
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
})
