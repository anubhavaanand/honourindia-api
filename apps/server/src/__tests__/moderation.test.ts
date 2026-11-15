import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { api } from '../routes/api.js'
import { loadSubmissions, saveSubmissions, getSubmissionById } from '../lib/submissions.js'
import { getExpectedAdminKey } from '../lib/admin-auth.js'

describe('Figure moderation workflow (issue #83)', () => {
  const originalSubmissions = loadSubmissions()
  const ADMIN_KEY = getExpectedAdminKey()

  beforeEach(() => {
    saveSubmissions([
      {
        id: 'sub_test_pending_1',
        name: 'Test Figure 1',
        born: 1900,
        died: 1980,
        field: 'Chemistry',
        tagline: 'A great chemist',
        summary: 'Pioneered research in organic chemistry.',
        wiki: 'Test Figure 1',
        status: 'pending',
        submittedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewNote: null,
        reviewedBy: null,
      },
      {
        id: 'sub_test_approved_1',
        name: 'Test Figure 2',
        born: 1920,
        died: 2000,
        field: 'Physics',
        tagline: 'A great physicist',
        summary: 'Pioneered research in nuclear physics.',
        wiki: 'Test Figure 2',
        status: 'approved',
        submittedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewNote: 'Approved for inclusion',
        reviewedBy: 'admin',
      },
      {
        id: 'sub_test_rejected_1',
        name: 'Test Figure 3',
        born: 1950,
        died: null,
        field: 'Biology',
        tagline: 'A biologist',
        summary: 'Study of plants.',
        wiki: 'Test Figure 3',
        status: 'rejected',
        submittedAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewNote: 'Duplicate entry',
        reviewedBy: 'admin',
      },
    ])
  })

  afterEach(() => {
    saveSubmissions(originalSubmissions)
  })

  describe('Authentication for admin endpoints', () => {
    it('returns 401 when no admin key is provided', async () => {
      const res = await api.request('/admin/submissions')
      expect(res.status).toBe(401)
      const data = (await res.json()) as any
      expect(data.error).toContain('Unauthorized')
    })

    it('returns 401 when wrong admin key is provided', async () => {
      const res = await api.request('/admin/submissions', {
        headers: { 'x-admin-key': 'wrong-key-12345' },
      })
      expect(res.status).toBe(401)
    })

    it('authenticates via x-admin-key header', async () => {
      const res = await api.request('/admin/submissions', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
    })

    it('authenticates via Authorization: Bearer header', async () => {
      const res = await api.request('/admin/submissions', {
        headers: { authorization: `Bearer ${ADMIN_KEY}` },
      })
      expect(res.status).toBe(200)
    })

    it('authenticates via ?adminKey query param', async () => {
      const res = await api.request(`/admin/submissions?adminKey=${ADMIN_KEY}`)
      expect(res.status).toBe(200)
    })
  })

  describe('GET /admin/submissions', () => {
    it('lists all submissions when no filter is supplied', async () => {
      const res = await api.request('/admin/submissions', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.total).toBe(3)
      expect(data.submissions).toHaveLength(3)
    })

    it('filters by status=pending', async () => {
      const res = await api.request('/admin/submissions?status=pending', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.total).toBe(1)
      expect(data.submissions[0].id).toBe('sub_test_pending_1')
      expect(data.submissions[0].status).toBe('pending')
    })

    it('filters by status=approved', async () => {
      const res = await api.request('/admin/submissions?status=approved', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.total).toBe(1)
      expect(data.submissions[0].id).toBe('sub_test_approved_1')
      expect(data.submissions[0].status).toBe('approved')
    })

    it('filters by status=rejected', async () => {
      const res = await api.request('/admin/submissions?status=rejected', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.total).toBe(1)
      expect(data.submissions[0].id).toBe('sub_test_rejected_1')
      expect(data.submissions[0].status).toBe('rejected')
    })

    it('returns 400 for invalid status filter', async () => {
      const res = await api.request('/admin/submissions?status=invalid_status', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toContain('Invalid status filter')
    })
  })

  describe('GET /admin/submissions/:id', () => {
    it('returns 200 with the submission detail', async () => {
      const res = await api.request('/admin/submissions/sub_test_pending_1', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.submission.name).toBe('Test Figure 1')
      expect(data.submission.status).toBe('pending')
    })

    it('returns 404 for unknown submission id', async () => {
      const res = await api.request('/admin/submissions/unknown_id', {
        headers: { 'x-admin-key': ADMIN_KEY },
      })
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /admin/submissions/:id', () => {
    it('approves a pending submission with review note', async () => {
      const res = await api.request('/admin/submissions/sub_test_pending_1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          status: 'approved',
          reviewNote: 'Looks great! High historical significance.',
          reviewer: 'lead-editor',
        }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.message).toContain('approved')
      expect(data.submission.status).toBe('approved')
      expect(data.submission.reviewNote).toBe('Looks great! High historical significance.')
      expect(data.submission.reviewedBy).toBe('lead-editor')
      expect(data.submission.reviewedAt).toBeTruthy()

      // Confirm persisted
      const persisted = getSubmissionById('sub_test_pending_1')
      expect(persisted?.status).toBe('approved')
    })

    it('rejects a submission with reason note', async () => {
      const res = await api.request('/admin/submissions/sub_test_pending_1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          status: 'rejected',
          reviewNote: 'Not verifiable on Wikipedia.',
        }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.submission.status).toBe('rejected')
      expect(data.submission.reviewNote).toBe('Not verifiable on Wikipedia.')
    })

    it('resets an approved submission back to pending', async () => {
      const res = await api.request('/admin/submissions/sub_test_approved_1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          status: 'pending',
          reviewNote: 'Needs re-review',
        }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.submission.status).toBe('pending')
      expect(data.submission.reviewNote).toBe('Needs re-review')
    })

    it('returns 400 for missing or invalid status', async () => {
      const res = await api.request('/admin/submissions/sub_test_pending_1', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          status: 'unknown_status',
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as any
      expect(data.error).toContain('Field "status" is required')
    })

    it('returns 404 for unknown submission id', async () => {
      const res = await api.request('/admin/submissions/sub_does_not_exist', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': ADMIN_KEY,
        },
        body: JSON.stringify({
          status: 'approved',
        }),
      })

      expect(res.status).toBe(404)
    })
  })
})
