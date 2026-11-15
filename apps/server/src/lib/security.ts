import type { Context, Next } from 'hono'
import type { Env } from './auth.js'

// API responses are JSON only; deny every fetch directive. HTML pages need
// self-hosted assets, the Google Fonts stylesheet, and inline styles for the
// widget's shadow-root <style> element.
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
const SITE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
  "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

/** Baseline security headers for every response. */
export function securityHeaders() {
  return async (c: Context<Env>, next: Next) => {
    await next()
    // Set after next(): handlers such as serveFile() return a raw Response,
    // which replaces headers queued with c.header().
    c.res.headers.set('X-Content-Type-Options', 'nosniff')
    c.res.headers.set('X-Frame-Options', 'DENY')
    c.res.headers.set('Content-Security-Policy', c.req.path.startsWith('/api/') ? API_CSP : SITE_CSP)
  }
}