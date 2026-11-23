import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hashKey, setKeyFile, resetKeyFile, closeKeyWatcher } from '../lib/auth.js'
import { app } from '../index.js'

// These tests simulate distinct callers via the x-forwarded-for header, which
// clientIp only honors behind a trusted proxy.
process.env.TRUST_PROXY = '1'

const VALID_KEY = 'hi_valid_test_key'

function useTempKeyFile(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-throttle-keys-'))
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

function attempt(ip: string, key: string) {
  return app.request('/api/v1/whoami', {
    headers: { 'x-forwarded-for': ip, Authorization: `Bearer ${key}` },
  })
}

describe('failed API key attempts are throttled (issue #46)', () => {
  afterEach(() => {
    closeKeyWatcher()
    resetKeyFile()
  })

  it('answers a wrong key with 401 while the client is under the limit', async () => {
    const res = await attempt('10.0.0.1', 'hi_wrong_key')
    expect(res.status).toBe(401)
  })

  it('locks a client out after too many wrong keys', async () => {
    const ip = '10.0.0.2'
    for (let i = 0; i < 10; i++) {
      const res = await attempt(ip, 'hi_wrong_key')
      expect(res.status).toBe(401)
    }

    const res = await attempt(ip, 'hi_wrong_key')
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('locks out even a correct key once the client is locked out', async () => {
    useTempKeyFile()
    const ip = '10.0.0.3'
    for (let i = 0; i < 11; i++) {
      await attempt(ip, 'hi_wrong_key')
    }

    const res = await attempt(ip, VALID_KEY)
    expect(res.status).toBe(429)
  })

  it('keeps one noisy client from locking out another', async () => {
    for (let i = 0; i < 12; i++) {
      await attempt('10.0.0.4', 'hi_wrong_key')
    }

    const res = await attempt('10.0.0.5', 'hi_wrong_key')
    expect(res.status).toBe(401)
  })

  it('does not throttle anonymous callers', async () => {
    const ip = '10.0.0.6'
    for (let i = 0; i < 12; i++) {
      const res = await app.request('/api/v1/whoami', { headers: { 'x-forwarded-for': ip } })
      expect(res.status).toBe(200)
    }
  })

  it('clears the failure count once the client authenticates', async () => {
    useTempKeyFile()
    const ip = '10.0.0.7'
    for (let i = 0; i < 5; i++) {
      await attempt(ip, 'hi_wrong_key')
    }

    const ok = await attempt(ip, VALID_KEY)
    expect(ok.status).toBe(200)

    // The counter is back to zero, so a few more mistakes are tolerated.
    for (let i = 0; i < 5; i++) {
      const res = await attempt(ip, 'hi_wrong_key')
      expect(res.status).toBe(401)
    }
  })
})
