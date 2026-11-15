import { describe, it, expect, vi, afterEach } from 'vitest'
import { log, requestLogger } from '../lib/logger.js'

describe('structured logging (issue #76)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('writes one JSON object per record in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOG_FORMAT', 'json')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    log('info', 'server started', { port: 3000 })

    expect(spy).toHaveBeenCalledTimes(1)
    const record = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(record.level).toBe('info')
    expect(record.message).toBe('server started')
    expect(record.port).toBe(3000)
    expect(typeof record.time).toBe('string')
  })

  it('writes a readable line outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    log('info', 'server started', { port: 3000 })

    const line = spy.mock.calls[0]![0] as string
    expect(line).toContain('server started')
    expect(line).toContain('port=3000')
  })

  it('drops records below the active level', () => {
    vi.stubEnv('LOG_LEVEL', 'warn')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    log('info', 'too quiet')
    expect(spy).not.toHaveBeenCalled()

    log('warn', 'important')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('logs one record per request', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LOG_FORMAT', 'json')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const c: any = {
      req: { method: 'GET', path: '/api/v1/meta' },
      res: { status: 200, headers: new Headers({ 'X-Request-ID': 'abc123' }) },
      get: () => null,
    }
    await requestLogger()(c, () => Promise.resolve())

    expect(spy).toHaveBeenCalledTimes(1)
    const record = JSON.parse(spy.mock.calls[0]![0] as string)
    expect(record.message).toBe('request')
    expect(record.method).toBe('GET')
    expect(record.path).toBe('/api/v1/meta')
    expect(record.status).toBe(200)
    expect(record.requestId).toBe('abc123')
    expect(record.tier).toBe('anonymous')
    expect(typeof record.durationMs).toBe('number')
  })
})
