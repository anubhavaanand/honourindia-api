import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { etag } from 'hono/etag'
import {
  figures,
  findBySlug,
  filterFigures,
  sampleRandom,
  toBillboard,
  toSummary,
  figuresVersion,
  ROOT,
} from '../lib/data.js'
import type { Env } from '../lib/auth.js'
import {
  createSubmission,
  listSubmissions,
  getSubmissionById,
  updateSubmissionStatus,
  type SubmissionStatus,
} from '../lib/submissions.js'
import { adminAuth } from '../lib/admin-auth.js'

const OPENAPI_JSON = path.join(ROOT, 'docs/openapi.json')
const OPENAPI_YAML = path.join(ROOT, 'docs/openapi.yaml')

let openapiDoc: unknown = null
function loadOpenApi(): unknown {
  if (openapiDoc) return openapiDoc
  if (existsSync(OPENAPI_JSON)) {
    try {
      openapiDoc = JSON.parse(readFileSync(OPENAPI_JSON, 'utf8'))
    } catch {
      openapiDoc = null
    }
  }
  return openapiDoc
}

export const api = new Hono<Env>()

api.use('*', etag())

api.get('/', (c) =>
  c.json({
    name: 'Honour India API',
    version: 'v1',
    mission: 'A billboard network for the minds that built India.',
    figures: figures.length,
    auth: 'Keyless for everyone. Optional keys (Authorization: Bearer) unlock higher rate limits.',
    endpoints: {
      'GET /api/v1/billboards/random?count=8':
        'Random billboards for the embed widget (count 1–24).',
      'GET /api/v1/figures': 'The full catalogue of honoured figures.',
      'GET /api/v1/figures/:slug': 'Full record for one figure.',
      'POST /api/v1/figures/submit':
        'Submit a new figure for moderation and inclusion in the catalogue.',
      'GET /api/v1/admin/submissions':
        'Admin: List candidate submissions with optional ?status= filter.',
      'PATCH /api/v1/admin/submissions/:id':
        'Admin: Update moderation status (approve/reject/pending).',
      'GET /api/v1/whoami': 'Shows your tier (anonymous/keyed) and rate-limit budget.',
      'GET /api/v1/meta': 'Dataset and licensing metadata.',
      'GET /api/v1/openapi':
        'OpenAPI 3.1 specification (also available as /openapi.json or /openapi.yaml).',
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
    dataVersion: figuresVersion,
    figures: figures.length,
    living: figures.filter((f) => f.died === null).length,
    dataLicense:
      'Facts are not copyrightable; summaries compiled by contributors (see repository).',
    imagesLicense:
      'Portraits come from Wikipedia/Wikimedia Commons; per-image credit and license are returned with each billboard and must be preserved.',
    source: 'https://en.wikipedia.org/',
  }),
)

api.get('/billboards/random', (c) => {
  const raw = c.req.query('count')
  let count = 8
  if (raw !== undefined) {
    if (!/^\d+$/.test(raw))
      return c.json({ error: 'count must be an integer between 1 and 24' }, 400)
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > 24) {
      return c.json({ error: 'count must be an integer between 1 and 24' }, 400)
    }
    count = n
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
    if (enduringRaw !== 'true' && enduringRaw !== 'false')
      return c.json({ error: 'enduring must be "true" or "false"' }, 400)
    enduring = enduringRaw === 'true'
  }
  let limit: number | undefined
  if (limitRaw !== undefined) {
    // Reject partial input like "12abc" or "1e3": require digits only, then
    // convert, so parseInt's silent prefix-parsing can't slip through.
    const n = /^\d+$/.test(limitRaw) ? Number(limitRaw) : NaN
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return c.json({ error: 'limit must be an integer between 1 and 100' }, 400)
    }
    limit = n
  }
  let offset: number | undefined
  if (offsetRaw !== undefined) {
    const n = /^\d+$/.test(offsetRaw) ? Number(offsetRaw) : NaN
    if (!Number.isInteger(n) || n < 0) {
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
  if (!f)
    return c.json({ error: 'Unknown figure. Try GET /api/v1/figures for the catalogue.' }, 404)
  c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return c.json({
    ...toBillboard(f),
    born: f.born,
    died: f.died,
    summary: f.summary,
    wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(f.wiki.replace(/ /g, '_'))}`,
  })
})

api.post('/figures/submit', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400)
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return c.json({ error: 'Request body must be an object' }, 400)
  }

  const { name, born, died, field, tagline, summary, wiki, quote, submitterName, submitterEmail } =
    body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return c.json({ error: 'Field "name" is required and must be a non-empty string' }, 400)
  }
  if (born === undefined || born === null || typeof born !== 'number') {
    return c.json({ error: 'Field "born" is required and must be a number' }, 400)
  }
  if (died !== undefined && died !== null && typeof died !== 'number') {
    return c.json({ error: 'Field "died" must be a number or null' }, 400)
  }
  if (!field || typeof field !== 'string' || field.trim() === '') {
    return c.json({ error: 'Field "field" is required and must be a non-empty string' }, 400)
  }
  if (!tagline || typeof tagline !== 'string' || tagline.trim() === '') {
    return c.json({ error: 'Field "tagline" is required and must be a non-empty string' }, 400)
  }
  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return c.json({ error: 'Field "summary" is required and must be a non-empty string' }, 400)
  }
  if (!wiki || typeof wiki !== 'string' || wiki.trim() === '') {
    return c.json({ error: 'Field "wiki" is required and must be a non-empty string' }, 400)
  }

  const submission = createSubmission({
    name: name.trim(),
    born,
    died: died ?? null,
    field: field.trim(),
    tagline: tagline.trim(),
    summary: summary.trim(),
    wiki: wiki.trim(),
    quote:
      quote && typeof quote.text === 'string' ? { text: quote.text, source: quote.source } : null,
    submitterName: typeof submitterName === 'string' ? submitterName.trim() : null,
    submitterEmail: typeof submitterEmail === 'string' ? submitterEmail.trim() : null,
  })

  return c.json(
    {
      message: 'Figure submission received for moderation',
      submission,
    },
    201,
  )
})

// Admin moderation endpoints
api.use('/admin/*', adminAuth())

api.get('/admin/submissions', (c) => {
  const statusParam = c.req.query('status')
  if (statusParam && !['pending', 'approved', 'rejected'].includes(statusParam)) {
    return c.json(
      { error: 'Invalid status filter. Must be "pending", "approved", or "rejected"' },
      400,
    )
  }
  const submissions = listSubmissions(
    statusParam ? { status: statusParam as SubmissionStatus } : undefined,
  )
  return c.json({
    total: submissions.length,
    submissions,
  })
})

api.get('/admin/submissions/:id', (c) => {
  const id = c.req.param('id')
  const submission = getSubmissionById(id)
  if (!submission) {
    return c.json({ error: `Submission "${id}" not found` }, 404)
  }
  return c.json({ submission })
})

api.patch('/admin/submissions/:id', async (c) => {
  const id = c.req.param('id')
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Request body must be valid JSON' }, 400)
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return c.json({ error: 'Request body must be an object' }, 400)
  }

  const { status, reviewNote, reviewer } = body
  if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
    return c.json(
      { error: 'Field "status" is required and must be "pending", "approved", or "rejected"' },
      400,
    )
  }

  const updated = updateSubmissionStatus(id, status as SubmissionStatus, reviewNote, reviewer)
  if (!updated) {
    return c.json({ error: `Submission "${id}" not found` }, 404)
  }

  return c.json({
    message: `Submission status updated to ${status}`,
    submission: updated,
  })
})

api.get('/openapi', (c) => {
  const doc = loadOpenApi()
  if (!doc) return c.json({ error: 'OpenAPI specification not found' }, 404)
  c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  return c.json(doc)
})

api.get('/openapi.json', (c) => {
  const doc = loadOpenApi()
  if (!doc) return c.json({ error: 'OpenAPI specification not found' }, 404)
  c.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
  return c.json(doc)
})

api.get('/openapi.yaml', (c) => {
  if (!existsSync(OPENAPI_YAML)) return c.text('Not found', 404)
  const yamlContent = readFileSync(OPENAPI_YAML, 'utf8')
  return c.text(yamlContent, 200, {
    'Content-Type': 'text/yaml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
  })
})
