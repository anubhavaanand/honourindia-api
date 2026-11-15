import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axe from 'axe-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SITE = path.join(ROOT, 'apps/site')

// jsdom has no layout engine, so the contrast rules cannot run here.
const A11Y_OPTIONS = { rules: { 'color-contrast': { enabled: false } } }

/** Load a page into the test document, head, <html lang> and all. */
async function loadPage(name) {
  const html = await readFile(path.join(SITE, name), 'utf8')
  document.open()
  document.write(html)
  document.close()
  return document
}

describe('site accessibility (issue #69)', () => {
  it('passes the demo page', async () => {
    const results = await axe.run(await loadPage('index.html'), A11Y_OPTIONS)
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('passes the figure page', async () => {
    const results = await axe.run(await loadPage('figure.html'), A11Y_OPTIONS)
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('passes the admin page', async () => {
    const results = await axe.run(await loadPage('admin.html'), A11Y_OPTIONS)
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
