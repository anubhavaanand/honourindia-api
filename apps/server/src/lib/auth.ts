import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Next } from 'hono'

/**
 * Optional API-key authentication.
 *
 * The API is keyless by default — anyone can embed. Keys are an opt-in
 * upgrade for partners: higher rate limits today, per-site analytics etc.
 * later. Keys are stored ONLY as sha-256 hashes in data/keys.json, which is
 * safe to commit (a hash of a 32-byte random key is not brute-forceable);
 * the plaintext is shown exactly once at issuance by scripts/issue-key.mjs.
 */

export interface AuthKey {
  id: string
  name: string
}

/** Shared Hono env so c.get('authKey') is typed app-wide. */
export interface Env {
  Variables: { authKey: AuthKey | null }
}

interface KeyRecord {
  id: string
  name: string
  hash: string
  createdAt: string
  enabled: boolean
}

interface KeysFile {
  $comment?: string
  keys: KeyRecord[]
}

const KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../data/keys.json')

function loadKeys(): Map<string, KeyRecord> {
  const map = new Map<string, KeyRecord>()
  if (!existsSync(KEY_FILE)) return map
  try {
    const parsed = JSON.parse(readFileSync(KEY_FILE, 'utf8')) as KeysFile
    for (const k of parsed.keys ?? []) {
      if (k.enabled !== false) map.set(k.hash, k)
    }
  } catch (err) {
    console.warn('[auth] could not parse data/keys.json — running keyless:', (err as Error).message)
  }
  return map
}

const keyIndex = loadKeys()

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Middleware: identifies the caller. No key → anonymous (fine). Bad key → 401. */
export function auth() {
  return async (c: Context<Env>, next: Next) => {
    const header = c.req.header('authorization')
    const raw = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : c.req.query('key')?.trim()

    if (!raw) {
      c.set('authKey', null)
    } else {
      const record = keyIndex.get(hashKey(raw))
      if (!record || !safeEqual(hashKey(raw), record.hash)) {
        return c.json({ error: 'Unknown API key. Omit the key for anonymous access, or get one from the project maintainers.' }, 401)
      }
      c.set('authKey', { id: record.id, name: record.name })
    }
    await next()
  }
}
