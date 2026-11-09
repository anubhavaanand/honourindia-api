import { Hono } from 'hono'
import { figures, findBySlug, filterFigures, sampleRandom, toBillboard, toSummary } from '../lib/data.js'
import type { FigureFilter } from '../lib/data.js'
import type { Env } from '../lib/auth.js'

export const api = new Hono<Env>()

api.get('/', (c) =>
  c.json({
    name: 'Honour India API',
    version: 'v1',
    mission: 'A billboard network for the minds that built India.',
    figures: figures.length,
    auth: 'Keyless for everyone. Optional keys (Authorization: Bearer) unlock higher rate limits.',
    endpoints: {
      'GET /api/v1/billboards/random?count=8': 'Random billboards for the embed widget (count 1–24).',
      'GET /api/v1/figures': 'The full catalogue of honoured figures.',
      'GET /api/v1/figures/:slug': 'Full record for one figure.',
      'GET /api/v1/whoami': 'Shows your tier (anonymous/keyed) and rate-limit budget.',
      'GET /api/v1/meta': 'Dataset and licensing metadata.',
    },
    docs: '/',
  }),
)

api.get('/whoami', (c) => {
  const key = c.get('authKey')
  return c.json({
    tier: key ? 'keyed' : 'anonymous',
    key: key ? { id: key.id, name: key.name } : null,
    rateLimit: key
      ? { max: 1200, window: '1 minute', scope: 'per key' }
      : { max: 120, window: '1 minute', scope: 'per IP' },
  })
})

api.get('/meta', (c) =>
  c.json({
    name: 'Honour India',
    version: 'v1',
    figures: figures.length,
    living: figures.filter((f) => f.died === null).length,
    dataLicense: 'Facts are not copyrightable; summaries compiled by contributors (see repository).',
    imagesLicense: 'Portraits come from Wikipedia/Wikimedia Commons; per-image credit and license are returned with each billboard and must be preserved.',
    source: 'https://en.wikipedia.org/',
  }),
)

api.get('/billboards/random', (c) => {
  const raw = c.req.query('count')
  let count = 8
  if (raw !== undefined) {
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return c.json({ error: 'count must be an integer' }, 400)
    count = Math.min(24, Math.max(1, n))
  }
  const billboards = sampleRandom(count).map(toBillboard)
  c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
  return c.json({ count: billboards.length, billboards })
})

api.get('/figures', (c) => {
  const field = c.req.query('field')
  const search = c.req.query('search')
  const enduringRaw = c.req.query('enduring')
  const limitRaw = c.req.query('limit')
  const offsetRaw = c.req.query('offset')

  let enduring: boolean | undefined
  if (enduringRaw !== undefined) {
    enduring = enduringRaw === 'true'
  }
  let limit: number | undefined
  if (limitRaw !== undefined) {
    const n = Number.parseInt(limitRaw, 10)
    if (!Number.isFinite(n) || n < 1 || n > 100) {
      return c.json({ error: 'limit must be an integer between 1 and 100' }, 400)
    }
    limit = n
  }
  let offset: number | undefined
  if (offsetRaw !== undefined) {
    const n = Number.parseInt(offsetRaw, 10)
    if (!Number.isFinite(n) || n < 0) {
      return c.json({ error: 'offset must be a non-negative integer' }, 400)
    }
    offset = n
  }

  const filtered = filterFigures({ field, search, enduring, limit, offset })
  c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return c.json({
    count: filtered.length,
    total: figures.length,
    filters: { field, search, enduring, limit, offset },
    figures: filtered.map(toSummary),
  })
})

api.get('/figures/:slug', (c) => {
  const f = findBySlug(c.req.param('slug'))
  if (!f) return c.json({ error: 'Unknown figure. Try GET /api/v1/figures for the catalogue.' }, 404)
  c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return c.json({
    ...toBillboard(f),
    born: f.born,
    died: f.died,
    summary: f.summary,
    wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(f.wiki.replace(/ /g, '_'))}`,
  })
})
