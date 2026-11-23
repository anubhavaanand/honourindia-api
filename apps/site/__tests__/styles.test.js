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

  it('meets WCAG AA contrast ratio (>= 4.5:1) for saffron and ink text on backgrounds (issue #53)', () => {
    function srgb(c) {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    function lum(hex) {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    }
    function contrast(h1, h2) {
      const l1 = lum(h1)
      const l2 = lum(h2)
      const bright = Math.max(l1, l2)
      const dark = Math.min(l1, l2)
      return (bright + 0.05) / (dark + 0.05)
    }

    const cssPath = join(__dirname, '../styles.css')
    const cssContent = readFileSync(cssPath, 'utf8')

    const saffronMatch = cssContent.match(/--saffron:\s*(#[0-9a-fA-F]+);/)
    const saffron = saffronMatch ? saffronMatch[1] : '#a44a0a'

    const inkFaintMatch = cssContent.match(/--ink-faint:\s*(#[0-9a-fA-F]+);/)
    const inkFaint = inkFaintMatch ? inkFaintMatch[1] : '#6e675c'

    const paperMatch = cssContent.match(/--paper:\s*(#[0-9a-fA-F]+);/)
    const bg = paperMatch ? paperMatch[1] : '#f3ede2'

    // Saffron text on the paper background
    const saffronContrast = contrast(saffron, bg)
    expect(saffronContrast).toBeGreaterThanOrEqual(4.5)

    // Paper text on a saffron button
    const btnTextContrast = contrast(bg, saffron)
    expect(btnTextContrast).toBeGreaterThanOrEqual(4.5)

    // Faint ink text on the paper background
    const inkFaintContrast = contrast(inkFaint, bg)
    expect(inkFaintContrast).toBeGreaterThanOrEqual(4.5)
  })
})
