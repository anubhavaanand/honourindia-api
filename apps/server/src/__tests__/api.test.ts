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

  it.each(['0', '25', '-1', '2.5', '8abc', ' 8', ''])(
    'rejects %p with 400',
    async (count) => {
      const { status, body } = await get(`/billboards/random?count=${encodeURIComponent(count)}`)
      expect(status).toBe(400)
      expect(body.error).toBe('count must be an integer between 1 and 24')
    },
  )
})