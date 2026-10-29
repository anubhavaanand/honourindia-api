import { describe, it, expect } from 'vitest'
import { hashKey } from '../lib/auth.js'

describe('auth.ts', () => {
  it('hashKey returns a 64-char lowercase hex string', () => {
    const h = hashKey('abc')
    expect(typeof h).toBe('string')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic (same input -> same hash)', () => {
    expect(hashKey('abc')).toBe(hashKey('abc'))
  })

  it('different inputs produce different hashes', () => {
    expect(hashKey('abc')).not.toBe(hashKey('abd'))
  })
})
