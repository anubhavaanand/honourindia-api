import { describe, it, expect } from 'vitest'
import { rateLimit } from '../lib/ratelimit.js'

type AuthKey = { id: string; name: string }

function makeContext(authKey: AuthKey | null = null, ip = '1.2.3.4') {
  const c: any = {
    headers: {},
    req: {
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
      c.lastJson = { body, status, headers: { ...headersObj } }
      return c.lastJson
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
    expect(res!.headers['Retry-After']).toBeDefined()
    expect(res!.headers['X-RateLimit-Remaining']).toBe('0')
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
})
