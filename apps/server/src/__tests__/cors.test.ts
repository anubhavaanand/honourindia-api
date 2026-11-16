import { describe, it, expect } from 'vitest'
import { app } from '../index.js'

// The widget now sends its API key as an Authorization header, which makes
// cross-origin requests non-simple: the browser sends a preflight first.
// These tests pin the behaviour that keeps those embeds working.
describe('CORS preflight for keyed cross-origin embeds (issue #44)', () => {
  it('allows a cross-origin preflight that requests the Authorization header', async () => {
    const res = await app.request('/api/v1/billboards/random', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://embedder.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    )
    // Browsers cache the preflight, so a keyed widget does not preflight every fetch.
    expect(res.headers.get('Access-Control-Max-Age')).toBe('600')
  })

  it('allows a cross-origin keyed request', async () => {
    const res = await app.request('/api/v1/billboards/random', {
      headers: { Origin: 'https://embedder.example', Authorization: 'Bearer hi_not_a_real_key' },
    })

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.status).toBe(401)
  })

  it('keeps the CORS headers on the 401 response of a bad key', async () => {
    const res = await app.request('/api/v1/billboards/random', {
      headers: { Origin: 'https://embedder.example', Authorization: 'Bearer hi_not_a_real_key' },
    })

    // Without this the embedder sees an opaque network error, not the 401.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('exposes the deprecation headers to embedder JavaScript', async () => {
    const res = await app.request('/api/v1/whoami?key=hi_not_a_real_key', {
      headers: { Origin: 'https://embedder.example' },
    })

    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Deprecation')
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Warning')
  })
})

describe('CORS for the embed script (issue #87)', () => {
  it('allows a cross-origin /embed.js request so SRI can be enforced', async () => {
    const res = await app.request('/embed.js', {
      headers: { Origin: 'https://embedder.example' },
    })

    // The browser refuses to enforce integrity on a cross-origin script without
    // CORS, so this header is required for the SRI snippet to work.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
