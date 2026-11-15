import { describe, it, expect } from 'vitest'
import { securityHeaders } from '../lib/security.js'

function makeContext(path: string) {
  const c: any = {
    req: { path },
    res: { headers: new Headers() },
    header: () => {},
  }
  return c
}

describe('securityHeaders', () => {
  it('sets nosniff, frame denial and a JSON-only CSP on API routes', async () => {
    const c = makeContext('/api/v1/figures')
    let nextCalled = false
    await securityHeaders()(c, () => {
      nextCalled = true
      return Promise.resolve()
    })

    expect(nextCalled).toBe(true)
    expect(c.res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(c.res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(c.res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
  })

  it('sets a self-hosting CSP on site routes', async () => {
    const c = makeContext('/')
    await securityHeaders()(c, () => Promise.resolve())

    expect(c.res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(c.res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(c.res.headers.get('Content-Security-Policy')).toContain('fonts.googleapis.com')
  })
})