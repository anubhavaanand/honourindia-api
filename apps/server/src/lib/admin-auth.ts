import { timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'

export function getExpectedAdminKey(): string {
  return process.env.ADMIN_KEY || process.env.HONOURINDIA_ADMIN_KEY || 'admin-secret-dev'
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
 * - Query param: `?adminKey=<key>`
 */
export function adminAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('authorization')
    const tokenFromAuth = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
    const tokenFromHeader = c.req.header('x-admin-key')?.trim()
    const tokenFromQuery = c.req.query('adminKey')?.trim()

    const providedKey = tokenFromHeader || tokenFromAuth || tokenFromQuery
    const expectedKey = getExpectedAdminKey()

    if (!providedKey || !safeEqual(providedKey, expectedKey)) {
      return c.json({ error: 'Unauthorized: invalid or missing admin key' }, 401)
    }

    await next()
  }
}
