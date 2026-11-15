import type { Context, Next } from 'hono'
import type { Env } from './auth.js'

/**
 * Structured logging.
 *
 * Every line is a JSON object in production, so a log aggregator can index
 * the fields instead of scraping text. Locally the same records are printed
 * in a readable one-line format. Set LOG_FORMAT=pretty to force the readable
 * format anywhere, LOG_LEVEL=warn to quieten the server down.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  [key: string]: unknown
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase()
  if (raw in LEVEL_ORDER) return raw as LogLevel
  // The test suite should not drown in request logs.
  if (process.env.NODE_ENV === 'test') return 'warn'
  return 'info'
}

function usePrettyFormat(): boolean {
  const format = (process.env.LOG_FORMAT ?? '').toLowerCase()
  if (format === 'pretty') return true
  if (format === 'json') return false
  return process.env.NODE_ENV !== 'production'
}

function formatPretty(record: Record<string, unknown>): string {
  const { time, level, message, ...rest } = record
  const fields = Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
  return `[${String(time)}] ${String(level).toUpperCase()} ${String(message)}${fields ? ' ' + fields : ''}`
}

/** Write one log record. */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel()]) return

  const record: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
    ...fields,
  }
  const line = usePrettyFormat() ? formatPretty(record) : JSON.stringify(record)

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/**
 * Middleware: one log record per request, with the fields an aggregator
 * wants — method, path, status, duration and the request id that ties the
 * line to the response headers.
 */
export function requestLogger() {
  return async (c: Context<Env>, next: Next) => {
    const start = performance.now()
    await next()
    log('info', 'request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
      requestId: c.res.headers.get('X-Request-ID') ?? undefined,
      tier: c.get('authKey') ? 'keyed' : 'anonymous',
    })
  }
}
