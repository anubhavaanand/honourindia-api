import { describe, it, expect } from 'vitest'
import { api } from '../routes/api.js'

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await api.request(path)
  return { status: res.status, body: await res.json() }
}

describe('GET /billboards/random count validation', () => {
  it('defaults to 8 billboards when count is omitted', async () => {
    const { status, body } = await get('/billboards/random')
    expect(status).toBe(200)
    expect(body.count).toBe(8)
    expect(body.billboards).toHaveLength(8)
  })

  it('accepts the documented range 1–24', async () => {
    const one = await get('/billboards/random?count=1')
    expect(one.status).toBe(200)
    expect(one.body.count).toBe(1)

    const max = await get('/billboards/random?count=24')
    expect(max.status).toBe(200)
    expect(max.body.count).toBe(24)
    expect(max.body.billboards).toHaveLength(24)
  })

  it.each(['0', '25', '-1', '2.5', '8abc', ' 8', ''])('rejects %p with 400', async (count) => {
    const { status, body } = await get(`/billboards/random?count=${encodeURIComponent(count)}`)
    expect(status).toBe(400)
    expect(body.error).toBe('count must be an integer between 1 and 24')
  })
})

describe('GET /openapi', () => {
  it('serves openapi JSON specification', async () => {
    const res = await api.request('/openapi')
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.openapi).toBe('3.1.0')
    expect(body.info.title).toBe('Honour India API')
    expect(body.paths['/billboards/random']).toBeDefined()
  })

  it('serves openapi YAML specification', async () => {
    const res = await api.request('/openapi.yaml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/yaml')
    const text = await res.text()
    expect(text).toContain('openapi: 3.1.0')
  })

  it('GET /meta returns metadata with dataVersion (issue #64)', async () => {
    const res = await api.request('/meta')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.name).toBe('Honour India')
    expect(body.dataVersion).toBe('1.2.0')
    expect(body.figures).toBeGreaterThan(0)
  })
})

describe('ETag and conditional requests', () => {
  it('returns ETag header on API responses', async () => {
    const res = await api.request('/figures')
    expect(res.status).toBe(200)
    const etag = res.headers.get('ETag')
    expect(etag).toBeTruthy()
  })

  it('returns 304 Not Modified when If-None-Match matches ETag', async () => {
    const first = await api.request('/figures')
    const etag = first.headers.get('ETag')!
    expect(etag).toBeTruthy()

    const second = await api.request('/figures', {
      headers: { 'If-None-Match': etag },
    })
    expect(second.status).toBe(304)
  })
})
