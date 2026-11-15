import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { rateLimit, FileRateLimitStore, type RateLimitStore } from '../lib/ratelimit.js'

type AuthKey = { id: string; name: string }

function makeContext(authKey: AuthKey | null = null, ip = '1.2.3.4', reqPath = '/api/v1/test') {
  const c: any = {
    headers: {},
    req: {
      path: reqPath,
      header: (name: string) => {
        if (name === 'x-forwarded-for') return ip
        return undefined
      },
    },
    get: (name: string) => (name === 'authKey' ? authKey : undefined),
    header: (name: string, value: string) => {
      c.headers[name] = String(value)
    },
    json: (body: unknown, status: number, headersObj: Record<string, string>) => {
      const h = new Headers()
      for (const [k, v] of Object.entries(headersObj)) h.set(k, v)
      c.lastJson = { body, status, headers: h }
      return c.lastJson
    },
    text: (text: string, status: number, headersObj: Record<string, string>) => {
      const h = new Headers()
      for (const [k, v] of Object.entries(headersObj)) h.set(k, v)
      c.lastText = { text, status, headers: h }
      return c.lastText
    },
  }
  return { c }
}

describe('rateLimit', () => {
  it('allows up to anonymousMax anonymous requests, then returns 429', async () => {
    const max = 3
    const mw = rateLimit({ anonymousMax: max, keyedMax: 100 })
    const { c } = makeContext(null, '1.2.3.4')

    let passed = 0
    for (let i = 0; i < max; i++) {
      const res = await mw(c, () => Promise.resolve())
      if (res === undefined) passed++
    }
    expect(passed).toBe(max)
    // remaining decrements to 0 on the last allowed request
    expect(c.headers['X-RateLimit-Limit']).toBe(String(max))
    expect(c.headers['X-RateLimit-Remaining']).toBe('0')

    const res = await mw(c, () => Promise.resolve())
    expect(res!.status).toBe(429)
    expect(res!.headers.get('Retry-After')).toBeDefined()
    expect(res!.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('keyed callers use key:<id> and keyedMax, separate from anonymous', async () => {
    const keyedMax = 2
    const mw = rateLimit({ anonymousMax: 1, keyedMax })
    const keyA = { id: 'key-a', name: 'A' }
    const keyB = { id: 'key-b', name: 'B' }

    const ca = makeContext(keyA, '1.2.3.4')
    const cb = makeContext(keyB, '1.2.3.4')
    const anonymous = makeContext(null, '1.2.3.4')

    // key A uses up its own window
    await mw(ca.c, () => Promise.resolve())
    await mw(ca.c, () => Promise.resolve())
    const blockedA = await mw(ca.c, () => Promise.resolve())
    expect(blockedA!.status).toBe(429)

    // key B still has its own window (keyed identity)
    const passB = await mw(cb.c, () => Promise.resolve())
    expect(passB).toBeUndefined()

    // anonymous is tracked separately from keyed
    const passAnon = await mw(anonymous.c, () => Promise.resolve())
    expect(passAnon).toBeUndefined()
  })

  it('evicts the oldest identities instead of clearing every limit when the map is full', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      const mw = rateLimit({ anonymousMax: 1, keyedMax: 100, maxEntries: 2 })
      const a = makeContext(null, '10.0.0.1')
      const b = makeContext(null, '10.0.0.2')
      const c = makeContext(null, '10.0.0.3')

      expect(await mw(a.c, () => Promise.resolve())).toBeUndefined()
      vi.advanceTimersByTime(1)
      expect(await mw(b.c, () => Promise.resolve())).toBeUndefined()
      vi.advanceTimersByTime(1)

      // A is still inside its window and blocked.
      expect((await mw(a.c, () => Promise.resolve()))!.status).toBe(429)
      vi.advanceTimersByTime(1)

      // Adding C exceeds maxEntries=2 and evicts A (oldest last hit).
      expect(await mw(c.c, () => Promise.resolve())).toBeUndefined()
      expect(await mw(a.c, () => Promise.resolve())).toBeUndefined()

      // C's active window survives the eviction that re-admitted A; B was evicted.
      expect((await mw(c.c, () => Promise.resolve()))!.status).toBe(429)
      expect(await mw(b.c, () => Promise.resolve())).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('FileRateLimitStore survives store recreation (simulated restart)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratelimit-test-'))
    const tempFile = path.join(tempDir, 'ratelimit.json')

    try {
      const store1 = new FileRateLimitStore(tempFile)
      const mw1 = rateLimit({ anonymousMax: 2, keyedMax: 10, windowMs: 60_000, store: store1 })
      const { c } = makeContext(null, '9.9.9.9')

      // Use up 2 hits
      await mw1(c, () => Promise.resolve())
      await mw1(c, () => Promise.resolve())

      // Check file was written to disk
      expect(fs.existsSync(tempFile)).toBe(true)

      // Simulate server restart by creating a new store reading the same file
      const store2 = new FileRateLimitStore(tempFile)
      const mw2 = rateLimit({ anonymousMax: 2, keyedMax: 10, windowMs: 60_000, store: store2 })

      // Next hit should be blocked (429) because state was restored
      const blocked = await mw2(c, () => Promise.resolve())
      expect(blocked).toBeDefined()
      expect(blocked!.status).toBe(429)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('supports custom pluggable RateLimitStore implementations', async () => {
    const customHits: Record<string, number[]> = {}
    const customStore: RateLimitStore = {
      getHits: (id) => customHits[id] ?? [],
      recordHit: (id, now) => {
        if (!customHits[id]) customHits[id] = []
        customHits[id]!.push(now)
      },
    }

    const mw = rateLimit({ anonymousMax: 1, keyedMax: 5, store: customStore })
    const { c } = makeContext(null, '8.8.8.8')

    const first = await mw(c, () => Promise.resolve())
    expect(first).toBeUndefined()
    expect(customHits['ip:8.8.8.8']?.length).toBe(1)

    const second = await mw(c, () => Promise.resolve())
    expect(second!.status).toBe(429)
  })

  it('rate limits non-API routes with text 429 response', async () => {
    const mw = rateLimit({ anonymousMax: 2, keyedMax: 10 })
    const { c } = makeContext(null, '7.7.7.7', '/embed.js')

    expect(await mw(c, () => Promise.resolve())).toBeUndefined()
    expect(await mw(c, () => Promise.resolve())).toBeUndefined()

    const blocked = await mw(c, () => Promise.resolve())
    expect(blocked).toBeDefined()
    expect(blocked!.status).toBe(429)
    expect(blocked!.headers.get('Retry-After')).toBeDefined()
    expect(c.lastText?.text).toContain('Too many requests')
  })
})

describe('documented rate limits (issue #40)', () => {
  it('gives anonymous callers 120 requests a minute and keyed callers 1200', async () => {
    const mw = rateLimit()

    const anonymous = makeContext(null, '1.2.3.4')
    await mw(anonymous.c, () => Promise.resolve())
    expect(anonymous.c.headers['X-RateLimit-Limit']).toBe('120')
    expect(anonymous.c.headers['X-RateLimit-Remaining']).toBe('119')

    const keyed = makeContext({ id: 'key-a', name: 'A' }, '1.2.3.4')
    await mw(keyed.c, () => Promise.resolve())
    expect(keyed.c.headers['X-RateLimit-Limit']).toBe('1200')
    expect(keyed.c.headers['X-RateLimit-Remaining']).toBe('1199')
  })

  it('gives every address its own anonymous window', async () => {
    const mw = rateLimit({ anonymousMax: 1, keyedMax: 10 })

    const first = makeContext(null, '10.0.0.1')
    const second = makeContext(null, '10.0.0.2')

    expect(await mw(first.c, () => Promise.resolve())).toBeUndefined()
    expect((await mw(first.c, () => Promise.resolve()))!.status).toBe(429)

    // A different address still has its full window.
    expect(await mw(second.c, () => Promise.resolve())).toBeUndefined()
  })

  it('gives every key its own window, even from the same address', async () => {
    const mw = rateLimit({ anonymousMax: 1, keyedMax: 1 })

    const keyA = makeContext({ id: 'key-a', name: 'A' }, '10.0.0.3')
    const keyB = makeContext({ id: 'key-b', name: 'B' }, '10.0.0.3')

    expect(await mw(keyA.c, () => Promise.resolve())).toBeUndefined()
    expect((await mw(keyA.c, () => Promise.resolve()))!.status).toBe(429)

    expect(await mw(keyB.c, () => Promise.resolve())).toBeUndefined()
  })

  it('does not spend the anonymous window of an address on a keyed request', async () => {
    const mw = rateLimit({ anonymousMax: 1, keyedMax: 10 })

    const keyed = makeContext({ id: 'key-a', name: 'A' }, '10.0.0.4')
    expect(await mw(keyed.c, () => Promise.resolve())).toBeUndefined()

    const anonymous = makeContext(null, '10.0.0.4')
    expect(await mw(anonymous.c, () => Promise.resolve())).toBeUndefined()
  })
})
