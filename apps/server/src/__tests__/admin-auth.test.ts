import { describe, it, expect, afterEach } from 'vitest'
import { Hono } from 'hono'
import { adminAuth, getExpectedAdminKey } from '../lib/admin-auth.js'

function adminApp() {
  const app = new Hono()
  app.use('/admin/*', adminAuth())
  app.get('/admin/ping', (c) => c.json({ ok: true }))
  return app
}

describe('admin key configuration (security)', () => {
  const savedAdmin = process.env.ADMIN_KEY
  const savedNodeEnv = process.env.NODE_ENV
  afterEach(() => {
    if (savedAdmin === undefined) delete process.env.ADMIN_KEY
    else process.env.ADMIN_KEY = savedAdmin
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedNodeEnv
  })

  it('falls back to a dev key outside production', () => {
    delete process.env.ADMIN_KEY
    process.env.NODE_ENV = 'development'
    expect(getExpectedAdminKey()).toBe('admin-secret-dev')
  })

  it('has no usable default in production (fails closed)', async () => {
    delete process.env.ADMIN_KEY
    process.env.NODE_ENV = 'production'
    expect(getExpectedAdminKey()).toBe('')

    // Even the old dev key must not unlock admin routes in production.
    const app = adminApp()
    const res = await app.request('/admin/ping', { headers: { 'x-admin-key': 'admin-secret-dev' } })
    expect(res.status).toBe(401)
  })

  it('accepts the configured key in production', async () => {
    process.env.ADMIN_KEY = 'a-real-configured-key'
    process.env.NODE_ENV = 'production'
    const app = adminApp()
    const res = await app.request('/admin/ping', {
      headers: { 'x-admin-key': 'a-real-configured-key' },
    })
    expect(res.status).toBe(200)
  })

  it('flags the deprecated ?adminKey= query parameter', async () => {
    process.env.ADMIN_KEY = 'k1'
    process.env.NODE_ENV = 'development'
    const app = adminApp()
    const res = await app.request('/admin/ping?adminKey=k1')
    expect(res.status).toBe(200)
    expect(res.headers.get('Deprecation')).toBe('true')
    expect(res.headers.get('Warning')).toContain('adminKey')
  })
})
