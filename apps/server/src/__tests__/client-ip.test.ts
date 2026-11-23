import { describe, it, expect, afterEach } from 'vitest'
import { clientIp } from '../lib/auth.js'

type FakeCtx = { req: { header: (name: string) => string | undefined } }

function makeCtx(headers: Record<string, string> = {}): FakeCtx {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
  }
}

describe('clientIp proxy trust (security)', () => {
  const saved = process.env.TRUST_PROXY
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = saved
  })

  it('ignores a spoofed X-Forwarded-For when no trusted proxy is configured', () => {
    delete process.env.TRUST_PROXY
    const a = clientIp(makeCtx({ 'x-forwarded-for': '1.1.1.1' }) as never)
    const b = clientIp(makeCtx({ 'x-forwarded-for': '2.2.2.2' }) as never)
    // Both requests fall back to the same socket identity (none in this fake),
    // so an attacker cannot mint distinct rate-limit buckets by changing the header.
    expect(a).toBe(b)
    expect(a).not.toBe('1.1.1.1')
    expect(a).not.toBe('2.2.2.2')
  })

  it('honors X-Forwarded-For first hop behind a trusted proxy', () => {
    process.env.TRUST_PROXY = '1'
    expect(clientIp(makeCtx({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }) as never)).toBe('9.9.9.9')
  })

  it('honors X-Real-IP behind a trusted proxy', () => {
    process.env.TRUST_PROXY = '1'
    expect(clientIp(makeCtx({ 'x-real-ip': '7.7.7.7' }) as never)).toBe('7.7.7.7')
  })
})
