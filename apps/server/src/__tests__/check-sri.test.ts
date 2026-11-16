import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

type SriModule = {
  sriFor: (buffer: Buffer) => string
  extractSriHashes: (text: string) => string[]
}

let sri: SriModule

beforeAll(async () => {
  sri = (await import(path.join(ROOT, 'scripts/check-sri.mjs'))) as SriModule
})

describe('SRI helper (issue #87)', () => {
  it('computes a sha384 integrity value from a buffer', () => {
    const expected = `sha384-${createHash('sha384').update('abc').digest('base64')}`

    expect(sri.sriFor(Buffer.from('abc'))).toBe(expected)
    expect(expected).toMatch(/^sha384-[A-Za-z0-9+/=]+$/)
  })

  it('extracts every sha384 token from text', () => {
    const text = 'a integrity="sha384-abc" b integrity=sha384-def c sha384-ghi'

    expect(sri.extractSriHashes(text)).toEqual(['sha384-abc', 'sha384-def', 'sha384-ghi'])
  })

  it('returns no hashes for a snippet without SRI', () => {
    expect(sri.extractSriHashes('<script src="https://cdn.example/embed.js"></script>')).toEqual([])
  })
})
