import { Hono } from 'hono'
import { figures, findBySlug, sampleRandom, toBillboard, toSummary } from '../lib/data.js'
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
  c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return c.json({ count: figures.length, figures: figures.map(toSummary) })
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
