import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashKey, setKeyFile, resetKeyFile, closeKeyWatcher } from '../lib/auth.js'
import { app } from '../index.js'

const VALID_KEY = 'hi_valid_test_key'

/** Point the auth module at a throwaway key file holding exactly VALID_KEY. */
function useTempKeyFile(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-middleware-keys-'))
  const file = path.join(dir, 'keys.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      keys: [
        {
          id: 'partner-test',
          name: 'Partner Test',
          hash: hashKey(VALID_KEY),
          createdAt: '2026-01-01',
          enabled: true,
        },
      ],
    }),
    'utf8',
  )
  setKeyFile(file)
}

describe('query-string key deprecation (issue #44)', () => {
  afterEach(() => {
    closeKeyWatcher()
    resetKeyFile()
  })

  it('announces the deprecation on a real API response', async () => {
    const res = await app.request('/api/v1/whoami?key=hi_not_a_real_key')
    expect(res.status).toBe(401)
    expect(res.headers.get('Deprecation')).toBe('true')
    expect(res.headers.get('Warning')).toContain('query parameter is deprecated')
  })

  it('leaves header-authenticated requests unflagged', async () => {
    const res = await app.request('/api/v1/whoami', {
      headers: { Authorization: 'Bearer hi_not_a_real_key' },
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('Deprecation')).toBeNull()
    expect(res.headers.get('Warning')).toBeNull()
  })

  it('announces the deprecation on a successful query-string request', async () => {
    useTempKeyFile()
    const res = await app.request(`/api/v1/whoami?key=${VALID_KEY}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Deprecation')).toBe('true')
    expect(res.headers.get('Warning')).toContain('query parameter is deprecated')
  })

  it('authenticates with the header even when an invalid key sits in the query string', async () => {
    useTempKeyFile()
    const res = await app.request(`/api/v1/whoami?key=hi_wrong_key`, {
      headers: { Authorization: `Bearer ${VALID_KEY}` },
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.tier).toBe('keyed')
  })

  it('rejects an invalid header even when a valid key sits in the query string', async () => {
    useTempKeyFile()
    const res = await app.request(`/api/v1/whoami?key=${VALID_KEY}`, {
      headers: { Authorization: 'Bearer hi_wrong_key' },
    })
    expect(res.status).toBe(401)
  })
})
