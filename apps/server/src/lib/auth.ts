import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
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
 *
 * Preferred authentication method:
 *   Authorization: Bearer <key>
 *
 * Query parameter (?key=) authentication is deprecated due to credential exposure risks
 * in access logs, browser history, and HTTP Referer headers.
 */

export interface AuthKey {
  id: string
  name: string
}

/** Shared Hono env so c.get('authKey') is typed app-wide. */
export interface Env {
  Variables: { authKey: AuthKey | null }
}

export interface KeyRecord {
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

export const DEFAULT_KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../data/keys.json')

let currentKeyFile = DEFAULT_KEY_FILE
let lastMtimeMs = 0
let keyIndex = new Map<string, KeyRecord>()
let fileWatcher: FSWatcher | null = null

export function loadKeys(filePath = currentKeyFile): Map<string, KeyRecord> {
  const map = new Map<string, KeyRecord>()
  if (!existsSync(filePath)) {
    lastMtimeMs = 0
    return map
  }
  try {
    const stat = statSync(filePath)
    lastMtimeMs = stat.mtimeMs
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as KeysFile
    for (const k of parsed.keys ?? []) {
      if (k.enabled !== false) map.set(k.hash, k)
    }
  } catch (err) {
    console.warn('[auth] could not parse keys file — running keyless:', (err as Error).message)
  }
  return map
}

export function reloadKeys(filePath?: string): void {
  if (filePath) currentKeyFile = filePath
  keyIndex = loadKeys(currentKeyFile)
}

export function getKeyRecord(hash: string): KeyRecord | undefined {
  try {
    if (existsSync(currentKeyFile)) {
      const stat = statSync(currentKeyFile)
      if (stat.mtimeMs !== lastMtimeMs) {
        reloadKeys()
      }
    }
  } catch {
    // Non-fatal, keep existing keyIndex
  }
  return keyIndex.get(hash)
}

export function setKeyFile(filePath: string): void {
  currentKeyFile = filePath
  reloadKeys(filePath)
  setupKeyWatcher()
}

export function resetKeyFile(): void {
  setKeyFile(DEFAULT_KEY_FILE)
}

export function setupKeyWatcher(): void {
  if (fileWatcher) {
    try { fileWatcher.close() } catch { /* ignore */ }
    fileWatcher = null
  }
  try {
    if (existsSync(currentKeyFile)) {
      fileWatcher = watch(currentKeyFile, () => {
        reloadKeys()
      })
      fileWatcher.unref()
    }
  } catch {
    // Non-fatal if watching is unsupported in environment
  }
}

export function closeKeyWatcher(): void {
  if (fileWatcher) {
    try { fileWatcher.close() } catch { /* ignore */ }
    fileWatcher = null
  }
}

// Initial boot load
reloadKeys()
setupKeyWatcher()

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
    // A Bearer header always wins; the query parameter is only a deprecated
    // fallback for older embedders. An empty Bearer token stays anonymous
    // and never falls back to the query parameter.
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
    const queryKey = c.req.query('key')?.trim()
    const raw = bearer ?? queryKey ?? undefined

    // Query-string keys are still accepted, but they leak into access logs,
    // browser history and Referer headers. Announce the deprecation whenever
    // the key appears in the URL, even if the request also carried a header.
    if (queryKey) {
      c.header('Deprecation', 'true')
      c.header(
        'Warning',
        '299 - "Passing API keys via the ?key= query parameter is deprecated; use the Authorization: Bearer <key> header instead."',
      )
    }

    if (!raw) {
      c.set('authKey', null)
    } else {
      const record = getKeyRecord(hashKey(raw))
      if (!record || !safeEqual(hashKey(raw), record.hash)) {
        return c.json({ error: 'Unknown API key. Omit the key for anonymous access, or get one from the project maintainers.' }, 401)
      }
      c.set('authKey', { id: record.id, name: record.name })
    }
    await next()
  }
}
