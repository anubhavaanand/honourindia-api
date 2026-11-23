import { randomBytes } from 'node:crypto'
import type { Context, Next } from 'hono'
import type { Env } from './auth.js'

/** Only echo an inbound id that looks like an id — bounded, no control chars. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

/** Assigns every response a stable request ID, echoing a well-formed inbound one. */
export function requestId() {
  return async (c: Context<Env>, next: Next) => {
    const inbound = c.req.header('x-request-id')?.trim()
    const id = inbound && VALID_REQUEST_ID.test(inbound) ? inbound : randomBytes(8).toString('hex')
    c.res.headers.set('X-Request-ID', id)
    await next()
  }
}
