import { describe, it, expect, afterEach } from 'vitest'
import { api } from '../routes/api.js'
import { loadSubmissions, saveSubmissions, getSubmissionById } from '../lib/submissions.js'

describe('Figure submission API (issue #62)', () => {
  const originalSubmissions = loadSubmissions()

  afterEach(() => {
    // Restore clean state after each test
    saveSubmissions(originalSubmissions)
  })

  it('submits a valid new figure and returns 201 with pending status', async () => {
    const payload = {
      name: 'Anna Mani',
      born: 1918,
      died: 2001,
      field: 'Meteorology',
      tagline: 'Pioneered meteorological instrumentation and solar radiation measurement in India.',
      summary:
        'Anna Mani was an Indian physicist and meteorologist who served as Deputy Director General of the IMD.',
      wiki: 'Anna Mani',
      submitterName: 'Contributor',
      submitterEmail: 'contributor@example.com',
    }

    const res = await api.request('/figures/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    expect(res.status).toBe(201)
    const data = (await res.json()) as any
    expect(data.message).toContain('moderation')
    expect(data.submission).toBeDefined()
    expect(data.submission.id).toMatch(/^sub_/)
    expect(data.submission.name).toBe('Anna Mani')
    expect(data.submission.status).toBe('pending')
    expect(data.submission.submittedAt).toBeTruthy()

    // Verify stored
    const stored = getSubmissionById(data.submission.id)
    expect(stored).toBeDefined()
    expect(stored?.field).toBe('Meteorology')
  })

  it('rejects submission with missing name', async () => {
    const res = await api.request('/figures/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        born: 1900,
        field: 'Physics',
        tagline: 'Tagline',
        summary: 'Summary',
        wiki: 'Wiki',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('"name" is required')
  })

  it('rejects submission with non-numeric born year', async () => {
    const res = await api.request('/figures/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Scientist',
        born: 'nineteen-hundred',
        field: 'Physics',
        tagline: 'Tagline',
        summary: 'Summary',
        wiki: 'Wiki',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('"born" is required and must be a valid year')
  })

  it('rejects a non-finite or out-of-range born year', async () => {
    for (const born of [1900.5, 999999, -9999]) {
      const res = await api.request('/figures/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Scientist',
          born,
          field: 'Physics',
          tagline: 'Tagline',
          summary: 'Summary',
          wiki: 'Wiki',
        }),
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toContain('valid year')
    }
  })

  it('rejects submission with missing summary or wiki', async () => {
    const res = await api.request('/figures/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Scientist',
        born: 1900,
        field: 'Physics',
        tagline: 'Tagline',
      }),
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('required')
  })

  it('rejects malformed non-JSON payload', async () => {
    const res = await api.request('/figures/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not a json',
    })
    expect(res.status).toBe(400)
    const data = (await res.json()) as any
    expect(data.error).toContain('JSON')
  })
})
