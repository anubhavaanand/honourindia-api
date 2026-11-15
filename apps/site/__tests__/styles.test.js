import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('site styles.css print stylesheet (issue #24)', () => {
  it('contains @media print rules that hide navigation and optimize for printing', () => {
    const cssPath = join(__dirname, '../styles.css')
    const cssContent = readFileSync(cssPath, 'utf8')

    expect(cssContent).toContain('@media print')
    expect(cssContent).toContain('.site-head nav')
    expect(cssContent).toContain('.back-link')
    expect(cssContent).toContain('.figure-actions .btn')
    expect(cssContent).toContain('display: none !important')
    expect(cssContent).toContain('body {')
    expect(cssContent).toContain('background: #ffffff !important')
  })
})
