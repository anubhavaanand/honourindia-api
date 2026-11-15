import { describe, it, expect } from 'vitest'
import { requestId } from '../lib/request-id.js'

function makeContext(path: string) {
  const headers: Record<string, string> = {}
  const c: any = {
    req: { path, header: (name: string) => (name === 'x-request-id' ? headers['x-request-id'] : undefined) },
    res: { headers: new Headers() },
    header: () => {},
  }
  return { c, headers }
}

describe('requestId', () => {
  it('generates a request id when none is provided', async () => {
    const { c } = makeContext('/api/v1/meta')
    let nextCalled = false
    await requestId()(c, () => {
      nextCalled = true
      return Promise.resolve()
    })
    expect(nextCalled).toBe(true)
    const id = c.res.headers.get('X-Request-ID')
    expect(id).toBeTruthy()
    expect(/^[0-9a-f]{16}$/.test(id!)).toBe(true)
  })

  it('echoes an inbound request id', async () => {
    const { c } = makeContext('/')
    c.req.header = (name: string) => (name === 'x-request-id' ? 'abc123' : undefined)
    await requestId()(c, () => Promise.resolve())
    expect(c.res.headers.get('X-Request-ID')).toBe('abc123')
  })
})