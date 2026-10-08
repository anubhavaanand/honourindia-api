import type { Context, Next } from 'hono'

interface RateLimitOptions {
  windowMs?: number
  max?: number
}

/** Simple in-memory sliding-window limiter — enough for a single-instance v1. */
export function rateLimit({ windowMs = 60_000, max = 120 }: RateLimitOptions = {}) {
  const hits = new Map<string, number[]>()
  return async (c: Context, next: Next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'local'
    const now = Date.now()
    const window = (hits.get(ip) ?? []).filter((t) => now - t < windowMs)
    if (window.length >= max) {
      return c.json(
        { error: 'Too many requests. Slow down — the scientists are not going anywhere.' },
        429,
        { 'Retry-After': String(Math.ceil(windowMs / 1000)) },
      )
    }
    window.push(now)
    hits.set(ip, window)
    // crude memory guard for long-lived processes
    if (hits.size > 50_000) hits.clear()
    await next()
  }
}
