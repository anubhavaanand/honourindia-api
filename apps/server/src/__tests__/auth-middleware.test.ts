import { describe, it, expect, vi } from 'vitest'
import { auth } from '../lib/auth.js'

function makeContext(authHeader?: string) {
  const headers: Record<string, string> = {}
  let captured: { body: unknown; status: number; httpHeaders: Record<string, string> } | null = null
  const c: any = {
    req: {
      header: (name: string) => {
        if (name === 'authorization') return authHeader
        return undefined
      },
      query: () => undefined,
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
})