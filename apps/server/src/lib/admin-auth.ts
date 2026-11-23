import { timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'

/** Development-only fallback so `npm run dev` works without configuration. */
const DEV_ADMIN_KEY = 'admin-secret-dev'

/**
 * The admin key the server expects.
 *
 * In production there is NO default: if ADMIN_KEY / HONOURINDIA_ADMIN_KEY is
 * unset the function returns '' and every admin request is rejected (a
 * shipped default would let anyone who has read the source into the
 * moderation endpoints). Outside production a fixed dev key is used so local
 * development and the test suite work without configuration.
 */
export function getExpectedAdminKey(): string {
  const configured = process.env.ADMIN_KEY || process.env.HONOURINDIA_ADMIN_KEY
  if (configured) return configured
  return process.env.NODE_ENV === 'production' ? '' : DEV_ADMIN_KEY
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/**
 * Middleware: Guards admin routes.
 * Accepts admin key via:
 * - Header: `x-admin-key: <key>`
 * - Header: `Authorization: Bearer <key>`
 * - Query param: `?adminKey=<key>` (deprecated — leaks into logs/history/Referer)
 */
export function adminAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('authorization')
    const tokenFromAuth = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const tokenFromHeader = c.req.header('x-admin-key')?.trim()
    const tokenFromQuery = c.req.query('adminKey')?.trim()

    if (tokenFromQuery) {
      c.header('Deprecation', 'true')
      c.header(
        'Warning',
        '299 - "Passing the admin key via the ?adminKey= query parameter is deprecated; use the x-admin-key header instead."',
      )
    }

    const providedKey = tokenFromHeader || tokenFromAuth || tokenFromQuery
    const expectedKey = getExpectedAdminKey()

    // An empty expected key means no admin key is configured (production with
    // no ADMIN_KEY) — fail closed rather than matching an empty string.
    if (!expectedKey || !providedKey || !safeEqual(providedKey, expectedKey)) {
      return c.json({ error: 'Unauthorized: invalid or missing admin key' }, 401)
    }

    await next()
  }
}
