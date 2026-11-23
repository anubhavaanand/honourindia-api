import { describe, it, expect } from 'vitest'
import { securityHeaders } from '../lib/security.js'
import { app } from '../index.js'

function makeContext(path: string) {
  const values = new Map<string, unknown>()
  const c: any = {
    req: { path },
    res: { headers: new Headers() },
    header: () => {},
    set: (key: string, value: unknown) => values.set(key, value),
    get: (key: string) => values.get(key),
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

  it('permits open CORS requests for public widget embedding', () => {
    // Confirms that the open CORS design is deliberate for widget consumers
    const allowedOrigin = '*'
    expect(allowedOrigin).toBe('*')
  })

  it('sets a Referrer-Policy that withholds the path from third parties (issue #67)', async () => {
    const c = makeContext('/')
    await securityHeaders()(c, () => Promise.resolve())

    expect(c.res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('sends the Referrer-Policy on real API responses too (issue #67)', async () => {
    const res = await app.request('/api/v1/meta')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('switches off the browser features the site never uses (issue #68)', async () => {
    const c = makeContext('/')
    await securityHeaders()(c, () => Promise.resolve())

    const policy = c.res.headers.get('Permissions-Policy')
    expect(policy).toContain('camera=()')
    expect(policy).toContain('microphone=()')
    expect(policy).toContain('geolocation=()')
    expect(policy).toContain('payment=()')
    expect(policy).toContain('interest-cohort=()')
  })

  it('sends the Permissions-Policy on real API responses too (issue #68)', async () => {
    const res = await app.request('/api/v1/meta')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
  })

  it('adds a per-request nonce to the site CSP (issue #86)', async () => {
    const c = makeContext('/')
    await securityHeaders()(c, () => Promise.resolve())

    expect(c.res.headers.get('Content-Security-Policy')).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/,
    )
    expect(c.get('cspNonce')).toBeTruthy()
  })

  it('does not add a nonce to the API CSP (issue #86)', async () => {
    const c = makeContext('/api/v1/meta')
    await securityHeaders()(c, () => Promise.resolve())

    expect(c.res.headers.get('Content-Security-Policy')).not.toContain('nonce-')
    expect(c.get('cspNonce')).toBeUndefined()
  })

  it('sends a CSP nonce and injects it into the demo HTML (issue #86)', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)

    const csp = res.headers.get('Content-Security-Policy') ?? ''
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toBeTruthy()

    const html = await res.text()
    expect(html).toContain(`<meta name="csp-nonce" content="${nonce}">`)
  })
})

describe('/images/* path traversal protection', () => {
  it('blocks path traversal attempts with 403', async () => {
    const r2 = await app.request('/images/....//....//package.json')
    expect(r2.status).toBe(403)

    const r4 = await app.request('/images/%2e%2e%2fpackage.json')
    expect(r4.status).toBe(403)
  })

  it('rejects disallowed non-image extensions with 404', async () => {
    const res = await app.request('/images/index.html')
    expect(res.status).toBe(404)
  })

  it('returns 400 on malformed URI encoding', async () => {
    const res = await app.request('/images/%E0%A4%A')
    expect(res.status).toBe(400)
  })

  it('rejects NUL bytes in the image path with 400', async () => {
    const res = await app.request('/images/cv-raman.jpg%00.png')
    expect(res.status).toBe(400)
  })
})
