import { describe, it, expect } from 'vitest'
import { auth } from '../lib/auth.js'
import { app } from '../index.js'

function makeContext(authHeader?: string, queryKey?: string) {
  const headers: Record<string, string> = {}
  let captured: { body: any; status: number; httpHeaders: Record<string, string> } | null = null
  const c: any = {
    req: {
      header: (name: string) => {
        if (name === 'authorization') return authHeader
        return undefined
      },
      query: (name: string) => (name === 'key' ? queryKey : undefined),
    },
    get: (name: string) => (name === 'authKey' ? c.authKey : undefined),
    set: (name: string, value: unknown) => {
      c.authKey = value
    },
    header: (name: string, value: string) => {
      headers[name] = value
    },
    json: (body: unknown, status: number, httpHeaders: Record<string, string>) => {
      captured = { body, status, httpHeaders }
      return captured
    },
  }
  return { c, getCaptured: () => captured, headers: () => headers }
}

describe('auth middleware', () => {
  it('passes through with authKey null when no key is provided', async () => {
    const { c } = makeContext(undefined)
    let nextCalled = false
    const res = await auth()(c, () => {
      nextCalled = true
      return Promise.resolve()
    })
    expect(res).toBeUndefined()
    expect(nextCalled).toBe(true)
    expect(c.authKey).toBeNull()
  })

  it('passes through with an empty bearer token (treated as anonymous)', async () => {
    const { c } = makeContext('Bearer')
    let nextCalled = false
    const res = await auth()(c, () => {
      nextCalled = true
      return Promise.resolve()
    })
    expect(res).toBeUndefined()
    expect(nextCalled).toBe(true)
    expect(c.authKey).toBeNull()
  })

  it('rejects an unknown API key with 401', async () => {
    const { c, getCaptured } = makeContext('Bearer wrong-wrong-wrong')
    const res = await auth()(c, () => Promise.resolve())
    expect(res!.status).toBe(401)
    expect(getCaptured()!.body.error).toContain('Unknown API key')
  })

  it('rejects a non-bearer authorization header as anonymous', async () => {
    const { c } = makeContext('Basic abc123')
    let nextCalled = false
    const res = await auth()(c, () => {
      nextCalled = true
      return Promise.resolve()
    })
    expect(res).toBeUndefined()
    expect(nextCalled).toBe(true)
    expect(c.authKey).toBeNull()
  })

  it('sets Deprecation and Warning headers when API key is passed via query string', async () => {
    const { c, headers } = makeContext(undefined, 'some-key')
    await auth()(c, () => Promise.resolve())
    expect(headers()['Deprecation']).toBe('true')
    expect(headers()['Warning']).toContain('query parameter is deprecated')
  })

  it('does not mark the Authorization header as deprecated', async () => {
    const { c, headers } = makeContext('Bearer some-key')
    await auth()(c, () => Promise.resolve())
    expect(headers()['Deprecation']).toBeUndefined()
    expect(headers()['Warning']).toBeUndefined()
  })

  it('announces the deprecation whenever the key appears in the URL', async () => {
    const { c, headers } = makeContext('Bearer header-key', 'query-key')
    await auth()(c, () => Promise.resolve())
    // The key is in the URL either way — that is what leaks.
    expect(headers()['Deprecation']).toBe('true')
    expect(headers()['Warning']).toContain('query parameter is deprecated')
  })

  it('prefers the Authorization header over a query-string key', async () => {
    const { c, headers } = makeContext('Bearer wrong-key', 'some-key')
    const res = await auth()(c, () => Promise.resolve())
    // The header key is the one that counts — and it is invalid.
    expect(res!.status).toBe(401)
    expect(headers()['Deprecation']).toBe('true')
  })
})

describe('query-string key deprecation (issue #44)', () => {
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
})
