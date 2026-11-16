import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

let mod: any

beforeAll(async () => {
  mod = await import(path.join(ROOT, 'scripts/fetch-images.mjs'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetch-images batching and concurrency (issue #37)', () => {
  it('chunks arrays into fixed-size batches', () => {
    expect(mod.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(mod.chunk([], 50)).toEqual([])
    expect(() => mod.chunk([1], 0)).toThrow()
  })

  it('runs at most `limit` tasks concurrently and preserves input order', async () => {
    let active = 0
    let maxActive = 0

    const result = await mod.mapLimit([1, 2, 3, 4, 5], 2, async (value: number) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return value * 2
    })

    expect(result).toEqual([2, 4, 6, 8, 10])
    expect(maxActive).toBe(2)
  })

  it('parses and validates positive integer options', () => {
    expect(mod.parsePositiveInt('6', '--concurrency')).toBe(6)
    expect(() => mod.parsePositiveInt('0', '--concurrency')).toThrow()
    expect(() => mod.parsePositiveInt('2.5', '--concurrency')).toThrow()
    expect(() => mod.parsePositiveInt('17', '--concurrency', { min: 1, max: 16 })).toThrow()
  })

  it('resolves normalized and redirected Wikipedia titles back to the request', () => {
    const data = {
      query: {
        normalized: [{ from: 'cv_raman', to: 'C. V. Raman' }],
        redirects: [{ from: 'C.V. Raman', to: 'C. V. Raman' }],
      },
    }

    const { resolve } = mod.buildTitleAliasMap(data, ['cv_raman', 'C.V. Raman'])

    expect(resolve('cv_raman')).toBe('C. V. Raman')
    expect(resolve('C.V. Raman')).toBe('C. V. Raman')
  })

  it('extracts lead-image fields from a pageimages page', () => {
    expect(
      mod.pageImageFromPage({
        thumbnail: { source: 'https://example.test/raman.jpg' },
        pageimage: 'Raman.jpg',
      }),
    ).toEqual({ thumb: 'https://example.test/raman.jpg', file: 'Raman.jpg' })

    expect(mod.pageImageFromPage({})).toEqual({ thumb: null, file: null })
  })

  it('batches lead-image lookups into one API request per 50 titles', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      urls.push(url.toString())
      const titles = (url.searchParams.get('titles') ?? '').split('|').filter(Boolean)
      const pages: Record<string, unknown> = {}
      titles.forEach((title, index) => {
        pages[index + 1] = {
          title,
          thumbnail: { source: `https://example.test/${index}.jpg` },
          pageimage: `File:${title}.jpg`,
        }
      })
      return { ok: true, json: async () => ({ query: { pages } }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const titles = Array.from({ length: 60 }, (_, index) => `Figure ${index}`)
    const images = await mod.fetchLeadImages(titles, { delayMs: 0, batchSize: 50 })

    expect(urls).toHaveLength(2)
    expect(images.get('Figure 0')).toMatchObject({
      thumb: 'https://example.test/0.jpg',
      file: 'File:Figure 0.jpg',
    })
    expect(images.get('Figure 59')).toMatchObject({
      thumb: 'https://example.test/9.jpg',
      file: 'File:Figure 59.jpg',
    })
  })

  it('returns only attribution fields from batched license lookups', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      const titles = (url.searchParams.get('titles') ?? '').split('|').filter(Boolean)
      const pages: Record<string, unknown> = {}
      titles.forEach((title, index) => {
        pages[index + 1] = {
          title,
          imageinfo: [
            {
              url: `https://example.test/${index}.jpg`,
              extmetadata: {
                Artist: { value: 'A. Photographer' },
                LicenseShortName: { value: 'CC BY 4.0' },
                Credit: { value: 'Wikimedia Commons' },
              },
            },
          ],
        }
      })
      return { ok: true, json: async () => ({ query: { pages } }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const licenses = await mod.fetchLicenses(['One.jpg', 'Two.jpg'], { delayMs: 0 })

    expect(licenses.get('One.jpg')).toEqual({
      credit: 'A. Photographer',
      license: 'CC BY 4.0',
      source: 'Wikimedia Commons',
    })
    expect(licenses.get('One.jpg')).not.toHaveProperty('thumb')
    expect(licenses.get('One.jpg')).not.toHaveProperty('file')
  })

  it('retries transient image download failures', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('network blip')
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array(2048).buffer,
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const buffer = await mod.downloadImage('https://example.test/portrait.jpg')

    expect(buffer).toHaveLength(2048)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
