import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from '../index.js'
import { setSubmissionsFile, resetSubmissionsFile } from '../lib/submissions.js'
import { getExpectedAdminKey } from '../lib/admin-auth.js'

const ADMIN_KEY = getExpectedAdminKey()

let tempDir: string

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'honourindia-integration-'))
  // Keep the integration run out of the real moderation queue.
  setSubmissionsFile(path.join(tempDir, 'submissions.json'))
})

afterAll(() => {
  resetSubmissionsFile()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('API integration', () => {
  it('serves the endpoint index with the mission', async () => {
    const res = await app.request('/api/v1')
    expect(res.status).toBe(200)

    const body: any = await res.json()
    expect(body.name).toBe('Honour India API')
    expect(body.endpoints['GET /api/v1/figures']).toBeDefined()
    expect(body.figures).toBeGreaterThan(0)
  })

  it('serves the catalogue and one figure in full', async () => {
    const list = await app.request('/api/v1/figures')
    expect(list.status).toBe(200)
    const listBody: any = await list.json()
    expect(listBody.figures.length).toBeGreaterThan(0)

    const slug = listBody.figures[0].slug
    const detail = await app.request(`/api/v1/figures/${slug}`)
    expect(detail.status).toBe(200)

    const detailBody: any = await detail.json()
    expect(detailBody.slug).toBe(slug)
    expect(detailBody.summary).toBeTruthy()
    expect(detailBody.wikipedia).toContain('wikipedia.org')
  })

  it('answers an unknown figure with a JSON 404', async () => {
    const res = await app.request('/api/v1/figures/not-a-real-person')
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body: any = await res.json()
    expect(body.error).toContain('Unknown figure')
  })

  it('serves billboards in the shape the widget consumes', async () => {
    const res = await app.request('/api/v1/billboards/random?count=8')
    expect(res.status).toBe(200)

    const body: any = await res.json()
    expect(body.count).toBe(8)
    expect(body.billboards).toHaveLength(8)

    for (const billboard of body.billboards) {
      expect(billboard.slug).toBeTruthy()
      expect(billboard.name).toBeTruthy()
      expect(billboard.field).toBeTruthy()
      expect(billboard.tagline).toBeTruthy()
      expect(billboard.link).toContain('wikipedia.org')

      // The widget reads these off every billboard; JSON drops undefined
      // fields, so only the required ones are asserted as present.
      expect('years' in billboard).toBe(true)
      expect('quote' in billboard).toBe(true)
      if (billboard.quote) {
        expect(billboard.quote.text).toBeTruthy()
      }
      if (billboard.image) {
        expect(billboard.image.url).toBeTruthy()
        if (billboard.image.credit !== undefined)
          expect(typeof billboard.image.credit).toBe('string')
        if (billboard.image.license !== undefined)
          expect(typeof billboard.image.license).toBe('string')
      }
    }
  })

  it('accepts the batch size the widget asks for', async () => {
    // The widget fetches a batch of 14 billboards at a time; the API's range
    // has to keep covering it or the widget silently gets fewer than it needs.
    const res = await app.request('/api/v1/billboards/random?count=14')
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.billboards).toHaveLength(14)
  })

  it('rejects a count outside the documented range', async () => {
    const res = await app.request('/api/v1/billboards/random?count=99')
    expect(res.status).toBe(400)
    const body: any = await res.json()
    expect(body.error).toContain('count must be an integer between 1 and 24')
  })

  it('reports the caller tier and the rate-limit budget', async () => {
    const anonymous = await app.request('/api/v1/whoami')
    const anonymousBody: any = await anonymous.json()
    expect(anonymousBody.tier).toBe('anonymous')
    expect(anonymousBody.rateLimit.max).toBe(120)

    const keyed = await app.request('/api/v1/whoami', {
      headers: { Authorization: 'Bearer hi_not_a_real_key' },
    })
    expect(keyed.status).toBe(401)
  })

  it('serves the dataset metadata', async () => {
    const res = await app.request('/api/v1/meta')
    const body: any = await res.json()
    expect(body.name).toBe('Honour India')
    expect(body.figures).toBeGreaterThan(0)
    expect(body.dataVersion).toBeTruthy()
  })

  it('answers a conditional request with 304', async () => {
    const first = await app.request('/api/v1/figures')
    const etag = first.headers.get('ETag')
    expect(etag).toBeTruthy()

    const second = await app.request('/api/v1/figures', {
      headers: { 'If-None-Match': etag! },
    })
    expect(second.status).toBe(304)
  })

  it('puts the security headers and a request id on every response', async () => {
    const res = await app.request('/api/v1/meta')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(res.headers.get('Permissions-Policy')).toContain('camera=()')
    expect(res.headers.get('X-Request-ID')).toBeTruthy()
  })

  it('echoes an inbound request id', async () => {
    const res = await app.request('/api/v1/meta', {
      headers: { 'X-Request-ID': 'integration-test-id' },
    })
    expect(res.headers.get('X-Request-ID')).toBe('integration-test-id')
  })
})

describe('figure submission and moderation journey', () => {
  it('takes a submission through review to approval', async () => {
    const submitted = await app.request('/api/v1/figures/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Figure',
        born: 1910,
        died: 1980,
        field: 'Physics',
        tagline: 'A tagline for the integration test.',
        summary: 'A summary for the integration test.',
        wiki: 'Integration Figure',
      }),
    })
    expect(submitted.status).toBe(201)

    const submittedBody: any = await submitted.json()
    const id = submittedBody.submission.id
    expect(submittedBody.submission.status).toBe('pending')

    // The moderation queue lists it.
    const queue = await app.request('/api/v1/admin/submissions?status=pending', {
      headers: { 'x-admin-key': ADMIN_KEY },
    })
    expect(queue.status).toBe(200)
    const queueBody: any = await queue.json()
    expect(queueBody.submissions.some((s: any) => s.id === id)).toBe(true)

    // A reviewer approves it.
    const reviewed = await app.request(`/api/v1/admin/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-key': ADMIN_KEY },
      body: JSON.stringify({
        status: 'approved',
        reviewNote: 'Looks good',
        reviewer: 'integration',
      }),
    })
    expect(reviewed.status).toBe(200)
    const reviewedBody: any = await reviewed.json()
    expect(reviewedBody.submission.status).toBe('approved')
    expect(reviewedBody.submission.reviewedBy).toBe('integration')
  })

  it('refuses a submission that is missing its name', async () => {
    const res = await app.request('/api/v1/figures/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ born: 1900 }),
    })
    expect(res.status).toBe(400)
    const body: any = await res.json()
    expect(body.error).toContain('"name" is required')
  })

  it('keeps the moderation queue behind the admin key', async () => {
    const withoutKey = await app.request('/api/v1/admin/submissions')
    expect(withoutKey.status).toBe(401)

    const wrongKey = await app.request('/api/v1/admin/submissions', {
      headers: { 'x-admin-key': 'not-the-admin-key' },
    })
    expect(wrongKey.status).toBe(401)

    const withKey = await app.request('/api/v1/admin/submissions', {
      headers: { 'x-admin-key': ADMIN_KEY },
    })
    expect(withKey.status).toBe(200)
  })
})
