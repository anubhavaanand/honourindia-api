import { randomBytes } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { Env } from './auth.js'

/** Assigns every response a stable request ID, echoing an inbound one. */
export function requestId() {
  return async (c: Context<Env>, next: Next) => {
    const id = c.req.header('x-request-id') ?? randomBytes(8).toString('hex')
    c.res.headers.set('X-Request-ID', id)
    await next()
  }
}
