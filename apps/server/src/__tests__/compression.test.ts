import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { compress } from 'hono/compress'

describe('compression middleware', () => {
  it('compresses JSON response when Accept-Encoding gzip is requested', async () => {
    const testApp = new Hono()
    testApp.use('*', compress())
    testApp.get('/test', (c) => c.json({ data: 'x'.repeat(2000) }))

    const res = await testApp.request('/test', {
      headers: { 'Accept-Encoding': 'gzip' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('gzip')
  })

  it('compresses JSON response when Accept-Encoding deflate is requested', async () => {
    const testApp = new Hono()
    testApp.use('*', compress())
    testApp.get('/test', (c) => c.json({ data: 'x'.repeat(2000) }))

    const res = await testApp.request('/test', {
      headers: { 'Accept-Encoding': 'deflate' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-encoding')).toBe('deflate')
  })
})
