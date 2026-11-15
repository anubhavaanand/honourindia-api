import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from '../index.js'
import { setSubmissionsFile, resetSubmissionsFile } from '../lib/submissions.js'

// A figure submission is a few kilobytes of JSON. Without a cap a single
// request could ask the server to buffer an arbitrarily large body.
describe('request body size limit (issue #79)', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'honourindia-body-limit-'))
    // Keep the accepted submission out of the real moderation queue.
    setSubmissionsFile(path.join(tempDir, 'submissions.json'))
  })

  afterAll(() => {
    resetSubmissionsFile()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('accepts a normal-sized submission', async () => {
    const body = JSON.stringify({
      name: 'Test Figure',
      born: 1900,
      field: 'Physics',
      tagline: 'A tagline.',
      summary: 'A summary.',
      wiki: 'Test Figure',
    })

    const res = await app.request('/api/v1/figures/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })

    expect(res.status).toBe(201)
  })

  it('rejects a body over the limit with 413', async () => {
    const body = JSON.stringify({ name: 'x'.repeat(100 * 1024) })

    const res = await app.request('/api/v1/figures/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })

    expect(res.status).toBe(413)
    const payload: any = await res.json()
    expect(payload.error).toContain('too large')
  })

  it('rejects an oversized body that does not declare its length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(100 * 1024)))
        controller.close()
      },
    })

    const res = await app.request('/api/v1/figures/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    })

    expect(res.status).toBe(413)
  })

  it('leaves GET requests untouched', async () => {
    const res = await app.request('/api/v1/meta')
    expect(res.status).toBe(200)
  })
})
