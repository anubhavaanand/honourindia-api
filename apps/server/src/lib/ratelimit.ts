import type { Context, Next } from 'hono'
import type { Env } from './auth.js'

interface RateLimitOptions {
  windowMs?: number
  anonymousMax?: number
  keyedMax?: number
  maxEntries?: number
}

const ANON_WINDOW_MS = 60_000
const MAX_ENTRIES = 50_000

/**
 * Key-aware sliding-window limiter. Anonymous callers get a modest limit per
 * IP; keyed callers get a much higher one per key. Every response carries
 * X-RateLimit-* headers so consumers can see where they stand.
 * In-memory by design for the single-instance v1.
 */
export function rateLimit({
  windowMs = ANON_WINDOW_MS,
  anonymousMax = 120,
  keyedMax = 1200,
  maxEntries = MAX_ENTRIES,
}: RateLimitOptions = {}) {
  const hits = new Map<string, number[]>()
  return async (c: Context<Env>, next: Next) => {
    const key = c.get('authKey')
    const identity = key ? `key:${key.id}` : `ip:${clientIp(c)}`
    const max = key ? keyedMax : anonymousMax

    const now = Date.now()
    const window = (hits.get(identity) ?? []).filter((t) => now - t < windowMs)
    const remaining = Math.max(0, max - window.length - 1)

    if (window.length >= max) {
      return c.json(
        { error: 'Too many requests. Slow down — the scientists are not going anywhere.' },
        429,
        {
          'Retry-After': String(Math.ceil(windowMs / 1000)),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
        },
      )
    }
    window.push(now)
    hits.set(identity, window)

    // Evict only what is stale/oldest instead of wiping every identity when
    // the map grows past its cap (which would reset all active limits).
    if (hits.size > maxEntries) {
      prune(hits, now, windowMs, maxEntries)
    }

    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(remaining))
    await next()
  }
}

function lastHit(times: number[]): number {
  return times.length > 0 ? times[times.length - 1]! : 0
}

function prune(hits: Map<string, number[]>, now: number, windowMs: number, maxEntries: number): void {
  for (const [identity, times] of hits) {
    const fresh = times.filter((t) => now - t < windowMs)
    if (fresh.length === 0) {
      hits.delete(identity)
    } else if (fresh.length !== times.length) {
      hits.set(identity, fresh)
    }
  }
  if (hits.size <= maxEntries) return

  const byOldest = [...hits.entries()].sort((a, b) => lastHit(a[1]) - lastHit(b[1]))
  const removeCount = hits.size - maxEntries
  for (let i = 0; i < removeCount; i++) {
    const entry = byOldest[i]
    if (entry) hits.delete(entry[0])
  }
}

function clientIp(c: Context<Env>): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'local'
  )
}
