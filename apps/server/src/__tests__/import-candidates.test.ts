import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('import-candidates script (issue #34)', () => {
  let mod: any

  it('imports helper functions from import-candidates.mjs', async () => {
    mod = await import(path.join(ROOT, 'scripts/import-candidates.mjs'))
    expect(mod.estimateEra).toBeDefined()
    expect(mod.isLikelyEnduring).toBeDefined()
    expect(mod.transformCandidate).toBeDefined()
  })

  describe('estimateEra', () => {
    it('returns ancient for born <= 1200', () => {
      expect(mod.estimateEra(476, 550)).toBe('ancient')
      expect(mod.estimateEra(1200, 1260)).toBe('ancient')
    })

    it('returns medieval for 1201 <= born <= 1700', () => {
      expect(mod.estimateEra(1500, 1560)).toBe('medieval')
    })

    it('returns colonial for 1701 <= born <= 1920', () => {
      expect(mod.estimateEra(1888, 1970)).toBe('colonial')
    })

    it('returns living for born > 1920 with died null', () => {
      expect(mod.estimateEra(1963, null)).toBe('living')
    })

    it('returns modern for born > 1920 with died set', () => {
      expect(mod.estimateEra(1931, 2015)).toBe('modern')
    })
  })

  describe('isLikelyEnduring heuristics', () => {
    it('marks ancient figures as enduring', () => {
      const candidate = { name: 'Aryabhata', born: 476, description: 'Ancient Indian mathematician' }
      expect(mod.isLikelyEnduring(candidate, 'ancient')).toBe(true)
    })

    it('marks medieval figures as enduring', () => {
      const candidate = { name: 'Madhava', born: 1340, description: 'Medieval mathematician' }
      expect(mod.isLikelyEnduring(candidate, 'medieval')).toBe(true)
    })

    it('marks candidates with stillUsed data as enduring', () => {
      const candidate = {
        name: 'Scientist',
        born: 1930,
        died: 2000,
        stillUsed: 'Foundational laser method',
      }
      expect(mod.isLikelyEnduring(candidate, 'modern')).toBe(true)
    })

    it('marks candidates with discovery / theorem / prize keywords as enduring', () => {
      const candidate1 = {
        name: 'Physicist',
        born: 1930,
        died: 2010,
        description: 'Discovered novel scattering process and constant',
      }
      expect(mod.isLikelyEnduring(candidate1, 'modern')).toBe(true)

      const candidate2 = {
        name: 'Mathematician',
        born: 1940,
        died: null,
        description: 'Formulated famous theorem in algebraic geometry',
      }
      expect(mod.isLikelyEnduring(candidate2, 'living')).toBe(true)
    })

    it('leaves standard modern figures without enduring markers as false by default', () => {
      const candidate = {
        name: 'Researcher',
        born: 1950,
        died: 2020,
        description: 'Author and university professor of chemistry',
      }
      expect(mod.isLikelyEnduring(candidate, 'modern')).toBe(false)
    })

    it('forces enduring to true when allEnduring flag is set', () => {
      const candidate = {
        name: 'Researcher',
        born: 1950,
        died: 2020,
        description: 'Author and university professor of chemistry',
      }
      expect(mod.isLikelyEnduring(candidate, 'modern', { allEnduring: true })).toBe(true)
    })
  })

  describe('transformCandidate', () => {
    it('transforms candidate into full figure schema with correct era and enduring state', () => {
      const candidate = {
        name: 'Brahmagupta',
        born: 598,
        died: 668,
        field: 'Astronomy',
        description: 'Astronomer and mathematician who introduced zero rules',
        wiki: 'Brahmagupta',
        commonsFile: 'Brahmagupta.jpg',
      }
      const figure = mod.transformCandidate(candidate)
      expect(figure.slug).toBe('brahmagupta')
      expect(figure.name).toBe('Brahmagupta')
      expect(figure.era).toBe('ancient')
      expect(figure.enduring).toBe(true)
      expect(figure.stillUsed).toBeNull()
    })
  })
})
