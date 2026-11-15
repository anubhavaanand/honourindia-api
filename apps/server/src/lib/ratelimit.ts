import type { Context, Next } from 'hono'
import type { Env } from './auth.js'
import fs from 'node:fs'
import path from 'node:path'

export interface RateLimitStore {
  /**
   * Return timestamp array of hits within windowMs.
   */
  getHits(identity: string, now: number, windowMs: number): Promise<number[]> | number[]
  /**
   * Record a hit timestamp for an identity, pruning old entries if exceeding maxEntries.
   */
  recordHit(identity: string, now: number, windowMs: number, maxEntries: number): Promise<void> | void
  /**
   * Reset hits for a specific identity or all identities.
   */
  reset?(identity?: string): Promise<void> | void
}

export class MemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>()

  getHits(identity: string, now: number, windowMs: number): number[] {
    return (this.hits.get(identity) ?? []).filter((t) => now - t < windowMs)
  }

  recordHit(identity: string, now: number, windowMs: number, maxEntries: number): void {
    const window = this.getHits(identity, now, windowMs)
    window.push(now)
    this.hits.set(identity, window)
    if (this.hits.size > maxEntries) {
      prune(this.hits, now, windowMs, maxEntries)
    }
  }

  reset(identity?: string): void {
    if (identity) this.hits.delete(identity)
    else this.hits.clear()
  }

  get size(): number {
    return this.hits.size
  }
}

/**
 * File-backed rate limit store that persists request hits to disk,
 * allowing rate limiting state to survive server restarts.
 */
export class FileRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>()
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    this.load()
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8')
        const data = JSON.parse(raw) as Record<string, number[]>
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v)) this.hits.set(k, v)
        }
      }
    } catch {
      this.hits.clear()
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const obj: Record<string, number[]> = {}
      for (const [k, v] of this.hits.entries()) {
        obj[k] = v
      }
      fs.writeFileSync(this.filePath, JSON.stringify(obj), 'utf8')
    } catch {
      // Non-fatal if filesystem is read-only
    }
  }

  getHits(identity: string, now: number, windowMs: number): number[] {
    return (this.hits.get(identity) ?? []).filter((t) => now - t < windowMs)
  }

  recordHit(identity: string, now: number, windowMs: number, maxEntries: number): void {
    const window = this.getHits(identity, now, windowMs)
    window.push(now)
    this.hits.set(identity, window)
    if (this.hits.size > maxEntries) {
      prune(this.hits, now, windowMs, maxEntries)
    }
    this.persist()
  }

  reset(identity?: string): void {
    if (identity) this.hits.delete(identity)
    else this.hits.clear()
    this.persist()
  }

  get size(): number {
    return this.hits.size
  }
}

export interface RateLimitOptions {
  windowMs?: number
  anonymousMax?: number
  keyedMax?: number
  maxEntries?: number
  /**
   * Backing store for rate limit hits. Defaults to MemoryRateLimitStore.
   * For persistent single-instance storage, use FileRateLimitStore.
   * For multi-instance distributed deployments, supply a custom RateLimitStore (e.g. Redis).
   */
  store?: RateLimitStore
}

const ANON_WINDOW_MS = 60_000
const MAX_ENTRIES = 50_000

/**
 * Key-aware sliding-window limiter. Anonymous callers get a modest limit per
 * IP; keyed callers get a much higher one per key. Every response carries
 * X-RateLimit-* headers so consumers can see where they stand.
 *
 * Defaults to in-memory storage for single-instance setups. For persistence across
 * server restarts, use FileRateLimitStore. For multi-instance clustering behind
 * a load balancer, pass a custom distributed RateLimitStore implementation.
 */
export function rateLimit({
  windowMs = ANON_WINDOW_MS,
  anonymousMax = 120,
  keyedMax = 1200,
  maxEntries = MAX_ENTRIES,
  store,
}: RateLimitOptions = {}) {
  const activeStore = store ?? new MemoryRateLimitStore()

  return async (c: Context<Env>, next: Next) => {
    const key = c.get('authKey')
    const identity = key ? `key:${key.id}` : `ip:${clientIp(c)}`
    const max = key ? keyedMax : anonymousMax

    const now = Date.now()
    const window = await activeStore.getHits(identity, now, windowMs)
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

    await activeStore.recordHit(identity, now, windowMs, maxEntries)

    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(remaining))
    await next()
  }
}

function lastHit(times: number[]): number {
  return times.length > 0 ? times[times.length - 1]! : 0
}

export function prune(hits: Map<string, number[]>, now: number, windowMs: number, maxEntries: number): void {
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
