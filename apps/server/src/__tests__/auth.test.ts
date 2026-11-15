import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashKey, setKeyFile, resetKeyFile, getKeyRecord, reloadKeys, closeKeyWatcher } from '../lib/auth.js'

describe('auth.ts', () => {
  afterEach(() => {
    closeKeyWatcher()
    resetKeyFile()
  })

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

  it('picks up newly added keys dynamically without server restart', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-keys-test-'))
    const tempKeyFile = path.join(tempDir, 'keys.json')

    try {
      const key1 = 'test-key-alpha'
      const hash1 = hashKey(key1)
      const initialData = {
        keys: [
          { id: 'partner-1', name: 'Partner One', hash: hash1, createdAt: '2026-01-01', enabled: true },
        ],
      }
      fs.writeFileSync(tempKeyFile, JSON.stringify(initialData), 'utf8')

      setKeyFile(tempKeyFile)

      // Initial key is found
      const rec1 = getKeyRecord(hash1)
      expect(rec1).toBeDefined()
      expect(rec1?.name).toBe('Partner One')

      // Key 2 is not known yet
      const key2 = 'test-key-beta'
      const hash2 = hashKey(key2)
      expect(getKeyRecord(hash2)).toBeUndefined()

      // Add Key 2 to keys.json (simulating npm run issue-key)
      // Slight sleep to ensure mtime changes
      await new Promise((r) => setTimeout(r, 20))
      const updatedData = {
        keys: [
          ...initialData.keys,
          { id: 'partner-2', name: 'Partner Two', hash: hash2, createdAt: '2026-01-02', enabled: true },
        ],
      }
      fs.writeFileSync(tempKeyFile, JSON.stringify(updatedData), 'utf8')

      // Key 2 should now be recognized immediately
      const rec2 = getKeyRecord(hash2)
      expect(rec2).toBeDefined()
      expect(rec2?.name).toBe('Partner Two')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
