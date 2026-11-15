import { describe, it, expect } from 'vitest'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from '../index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

// Static files are streamed straight from disk instead of being buffered in
// memory first (issue #65).
describe('static file responses are streamed', () => {
  it('serves the demo site with the right content type', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain('Honour India')
  })

  it('serves a portrait with its length and type', async () => {
    const res = await app.request('/images/anna-mani.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')

    const onDisk = await stat(path.join(ROOT, 'public/images/anna-mani.jpg'))
    expect(res.headers.get('content-length')).toBe(String(onDisk.size))
  })

  it('serves the same bytes as the file on disk', async () => {
    const res = await app.request('/images/anna-mani.jpg')
    const served = Buffer.from(await res.arrayBuffer())
    const { readFile } = await import('node:fs/promises')
    const onDisk = await readFile(path.join(ROOT, 'public/images/anna-mani.jpg'))
    expect(served.length).toBe(onDisk.length)
    expect(served.equals(onDisk)).toBe(true)
  })

  it('still answers 404 for a file that is not there', async () => {
    const res = await app.request('/images/not-a-real-figure.jpg')
    expect(res.status).toBe(404)
  })

  it('still answers 403 for a path that tries to escape the images directory', async () => {
    const res = await app.request('/images/....//....//package.json')
    expect(res.status).toBe(403)
  })
})
