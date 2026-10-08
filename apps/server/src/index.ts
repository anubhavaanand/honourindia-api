import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { api } from './routes/api.js'
import { auth, type Env } from './lib/auth.js'
import { rateLimit } from './lib/ratelimit.js'
import { ROOT } from './lib/data.js'

const IMAGES_DIR = path.join(ROOT, 'public/images')
const SITE_DIR = path.join(ROOT, 'apps/site')
const EMBED_JS = path.join(ROOT, 'packages/embed/dist/embed.js')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function serveFile(filePath: string, cacheControl: string): Promise<Response> {
  try {
    const data = await readFile(filePath)
    const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(new Uint8Array(data), {
      headers: { 'content-type': type, 'cache-control': cacheControl },
    })
  } catch {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }
}

const app = new Hono<Env>()

// Public API: open CORS, optional-key auth, key-aware rate limiting.
app.use('/api/*', auth())
app.use('/api/*', rateLimit())
app.use('/api/*', cors({ origin: '*' }))
app.route('/api/v1', api)

// The embeddable widget script — usable from any origin.
app.get('/embed.js', (c) => serveFile(EMBED_JS, 'public, max-age=600, stale-while-revalidate=3600'))

// Portraits (seeded from Wikimedia Commons; per-image license in data/images.json).
app.get('/images/*', (c) => {
  const rel = c.req.path.replace(/^\/images\//, '')
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
  return serveFile(
    path.join(IMAGES_DIR, safe),
    'public, max-age=86400, stale-while-revalidate=604800',
  )
})

// Demo + docs site.
app.get('/', (c) => serveFile(path.join(SITE_DIR, 'index.html'), 'no-cache'))
app.get('/styles.css', (c) => serveFile(path.join(SITE_DIR, 'styles.css'), 'public, max-age=600'))
app.get('/app.js', (c) => serveFile(path.join(SITE_DIR, 'app.js'), 'public, max-age=600'))

app.get('/healthz', (c) => c.json({ ok: true }))

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found. See GET /api/v1 for the endpoint list.' }, 404)
  }
  return c.text('Not found', 404)
})

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`सम्मान · Honour India — serving on http://localhost:${info.port}`)
  console.log(`  demo & docs : http://localhost:${info.port}/`)
  console.log(`  api         : http://localhost:${info.port}/api/v1`)
  console.log(`  embed       : http://localhost:${info.port}/embed.js`)
})
