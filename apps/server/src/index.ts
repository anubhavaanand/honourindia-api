import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { serve } from '@hono/node-server'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { compress } from 'hono/compress'
import { etag } from 'hono/etag'
import { bodyLimit } from 'hono/body-limit'
import { api } from './routes/api.js'
import { auth, type Env } from './lib/auth.js'
import { rateLimit } from './lib/ratelimit.js'
import { securityHeaders } from './lib/security.js'
import { log, requestLogger } from './lib/logger.js'
import { ROOT } from './lib/data.js'
import { requestId } from './lib/request-id.js'

const IMAGES_DIR = path.join(ROOT, 'public/images')
const SITE_DIR = path.join(ROOT, 'apps/site')
const EMBED_JS = path.join(ROOT, 'packages/embed/dist/embed.js')

/** Largest request body the API accepts, in bytes. */
const MAX_BODY_BYTES = 64 * 1024

function bodyTooLarge(c: Context) {
  return c.json({ error: 'Request body is too large. The limit is 64 KB.' }, 413)
}

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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

async function serveFile(filePath: string, cacheControl: string): Promise<Response> {
  let size: number
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return notFound()
    }
    size = info.size
  } catch {
    return notFound()
  }

  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  // Stream the file instead of buffering it: a portrait or the widget bundle
  // never has to sit in memory in full.
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
  return new Response(body, {
    headers: {
      'content-type': type,
      'cache-control': cacheControl,
      'content-length': String(size),
    },
  })
}

async function serveHtml(
  filePath: string,
  cacheControl: string,
  nonce?: string,
): Promise<Response> {
  let html: string
  try {
    html = await readFile(filePath, 'utf8')
  } catch {
    return notFound()
  }

  // Expose the per-request nonce to the page and any future inline scripts.
  // Inline scripts should use nonce="__CSP_NONCE__"; the placeholder is
  // replaced by the caller before the HTML is sent.
  if (nonce) {
    html = html.replaceAll('__CSP_NONCE__', nonce)
    html = html.replace(/<\/head>/i, `  <meta name="csp-nonce" content="${nonce}">\n  </head>`)
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cacheControl,
    },
  })
}

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
}

export const app = new Hono<Env>()

app.use('*', securityHeaders())
app.use('*', requestId())
app.use('*', requestLogger())

// Public API: compression, ETag, open CORS, optional-key auth, key-aware rate limiting.
// CORS runs first so that even the short-circuit responses (401 from auth, 429 from
// the rate limiter) carry the CORS headers — without them a browser embedder sees an
// opaque network error instead of the status code.
app.use('/api/*', compress())
app.use('/api/*', etag())
// Public API CORS: Wildcard origin ('*') is intentional and required by design
// because Honour India is a public embeddable billboard network. Restricting origins
// would break third-party website integrations. No user credentials/cookies are accepted.
// The widget sends its API key as an Authorization header, so that header is allowed
// explicitly; maxAge lets browsers cache the preflight instead of sending one per
// fetch; exposeHeaders lets embedders read the deprecation notice from JavaScript.
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    exposeHeaders: ['Deprecation', 'Warning'],
    maxAge: 600,
  }),
)
app.use('/api/*', auth())
app.use('/api/*', rateLimit())
// Cap the request body before any handler reads it. A figure submission is a
// few kilobytes of JSON; without a cap a single request could ask the server
// to buffer an arbitrarily large body.
app.use('/api/*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: bodyTooLarge }))
app.route('/api/v1', api)

// The widget is embedded on third-party origins. SRI with
// crossorigin="anonymous" makes the browser use a CORS request for the script,
// so the /embed.js response must allow any origin — otherwise the browser
// blocks the script before it can check its integrity hash.
app.use('/embed.js', cors({ origin: '*', maxAge: 600 }))

// Rate limiting for non-API endpoints (/embed.js, /images/*, /figures/*, and site routes).
// Generous limit (300 req/min) ensures normal browser asset loading and browsing isn't impacted
// while protecting against image scraping, DDoS floods, and endpoint enumeration.
const staticRateLimit = rateLimit({
  windowMs: 60_000,
  anonymousMax: 300,
  keyedMax: 1200,
})

app.use('/embed.js', staticRateLimit)
app.use('/images/*', staticRateLimit)
app.use('/figures/*', staticRateLimit)
app.use('/', staticRateLimit)
app.use('/styles.css', staticRateLimit)
app.use('/app.js', staticRateLimit)
app.use('/figure.js', staticRateLimit)
app.use('/admin', staticRateLimit)
app.use('/admin.js', staticRateLimit)

// The embeddable widget script — usable from any origin. Uncached outside
// production so local iteration isn't bitten by the browser cache.
app.get('/embed.js', () =>
  serveFile(EMBED_JS, isProd ? 'public, max-age=600, stale-while-revalidate=3600' : 'no-cache'),
)

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif', '.ico'])

// Portraits (seeded from Wikimedia Commons; per-image license in data/images.json).
app.get('/images/*', (c) => {
  let rel: string
  try {
    rel = decodeURIComponent(c.req.path.replace(/^\/images\//, ''))
  } catch {
    return c.text('Bad request', 400)
  }

  // Reject NUL bytes before resolving the path.
  if (rel.includes('\0')) return c.text('Bad request', 400)

  const target = path.resolve(IMAGES_DIR, rel)
  const relToImages = path.relative(IMAGES_DIR, target)

  // Disallow paths escaping IMAGES_DIR (e.g. ../, absolute paths, or self).
  // startsWith('..') is intentionally conservative: it may also reject an odd
  // entry whose name merely begins with "..", but it never lets a traversal
  // through.
  if (relToImages.startsWith('..') || path.isAbsolute(relToImages) || relToImages === '') {
    return c.text('Forbidden: invalid image path', 403)
  }

  const ext = path.extname(target).toLowerCase()
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    return c.text('Not found', 404)
  }

  return serveFile(target, 'public, max-age=86400, stale-while-revalidate=604800')
})

// Demo + docs site. Assets uncached outside production for fast iteration.
app.get('/', (c) => serveHtml(path.join(SITE_DIR, 'index.html'), 'no-cache', c.get('cspNonce')))
app.get('/styles.css', () =>
  serveFile(path.join(SITE_DIR, 'styles.css'), isProd ? 'public, max-age=600' : 'no-cache'),
)
app.get('/app.js', () =>
  serveFile(path.join(SITE_DIR, 'app.js'), isProd ? 'public, max-age=600' : 'no-cache'),
)
app.get('/figure.js', () =>
  serveFile(path.join(SITE_DIR, 'figure.js'), isProd ? 'public, max-age=600' : 'no-cache'),
)
app.get('/figures/:slug', (c) =>
  serveHtml(path.join(SITE_DIR, 'figure.html'), 'no-cache', c.get('cspNonce')),
)
app.get('/admin', (c) =>
  serveHtml(path.join(SITE_DIR, 'admin.html'), 'no-cache', c.get('cspNonce')),
)
app.get('/admin.js', () =>
  serveFile(path.join(SITE_DIR, 'admin.js'), isProd ? 'public, max-age=600' : 'no-cache'),
)
app.get('/favicon.svg', () =>
  serveFile(
    path.join(SITE_DIR, 'favicon.svg'),
    'public, max-age=86400, stale-while-revalidate=604800',
  ),
)
app.get('/apple-touch-icon.svg', () =>
  serveFile(
    path.join(SITE_DIR, 'favicon.svg'),
    'public, max-age=86400, stale-while-revalidate=604800',
  ),
)
app.get('/robots.txt', () => serveFile(path.join(SITE_DIR, 'robots.txt'), 'public, max-age=86400'))
app.get('/sitemap.xml', () =>
  serveFile(path.join(SITE_DIR, 'sitemap.xml'), 'public, max-age=86400'),
)

app.get('/healthz', (c) => c.json({ ok: true }))

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found. See GET /api/v1 for the endpoint list.' }, 404)
  }
  return c.text('Not found', 404)
})

const isProd = process.env.NODE_ENV === 'production'

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000)
  const server = serve({ fetch: app.fetch, port }, (info) => {
    log('info', 'server started', {
      message: `सम्मान · Honour India — serving on http://localhost:${info.port}`,
      port: info.port,
      demo: `http://localhost:${info.port}/`,
      api: `http://localhost:${info.port}/api/v1`,
      embed: `http://localhost:${info.port}/embed.js`,
    })
  })

  // Stop accepting new connections and let in-flight requests finish before exit.
  let shuttingDown = false
  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) return
    shuttingDown = true
    log('info', 'shutdown started', { signal })
    server.close(() => process.exit(0))
    // Do not hang forever on keep-alive sockets or a stuck response.
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
