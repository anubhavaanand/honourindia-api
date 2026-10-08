#!/usr/bin/env node
/**
 * Builds the GitHub Pages edition into dist-pages/ — a fully static mirror:
 * the demo site, embed.js, portraits, and the API endpoints as pre-generated
 * JSON files at their documented paths.
 *
 * Why this works without a server: the dataset is static, so the catalogue and
 * billboard payloads can be pre-generated. The random endpoint is served as one
 * static batch of all figures — the embed widget shuffles client-side, so each
 * visitor still sees a random rotation. What a static host cannot provide is
 * per-request randomness or per-slug detail files (a file and a directory
 * cannot share the `api/v1/figures` path); those need the Node server.
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'dist-pages')

const { figures } = JSON.parse(await readFile(path.join(ROOT, 'data/figures.json'), 'utf8'))
const images = JSON.parse(await readFile(path.join(ROOT, 'data/images.json'), 'utf8'))
const embedJs = await readFile(path.join(ROOT, 'packages/embed/dist/embed.js'))

// Image URLs resolve against the API base (the same contract the Node API
// keeps), so "../../images/…" lands on the bundle root on a Pages subpath.
const img = (slug) => {
  const m = images[slug]
  return m ? { url: `../../images/${m.file}`, credit: m.credit, license: m.license } : null
}
const years = (f) => (f.died !== null && f.died !== undefined ? `${f.born}–${f.died}` : `b. ${f.born}`)
const wikiLink = (w) => `https://en.wikipedia.org/wiki/${encodeURIComponent(w.replace(/ /g, '_'))}`

const billboards = figures.map((f) => ({
  slug: f.slug,
  name: f.name,
  years: years(f),
  field: f.field,
  tagline: f.tagline,
  quote: f.quote,
  image: img(f.slug),
  link: wikiLink(f.wiki),
}))

const summaries = figures.map((f) => ({
  slug: f.slug,
  name: f.name,
  years: years(f),
  field: f.field,
  tagline: f.tagline,
  image: images[f.slug] ? { url: `../../images/${images[f.slug].file}` } : null,
  link: wikiLink(f.wiki),
}))

await rm(OUT, { recursive: true, force: true })
await mkdir(path.join(OUT, 'api/v1/billboards'), { recursive: true })
await cp(path.join(ROOT, 'public/images'), path.join(OUT, 'images'), { recursive: true })
await cp(path.join(ROOT, 'apps/site'), OUT, { recursive: true }) // index.html, styles.css, app.js
await writeFile(path.join(OUT, 'embed.js'), embedJs)
await writeFile(path.join(OUT, '.nojekyll'), '') // skip Jekyll; serve files as-is
await cp(path.join(OUT, 'index.html'), path.join(OUT, '404.html')) // deep links land on the site

await writeFile(
  path.join(OUT, 'api/v1/billboards/random'),
  JSON.stringify({ count: billboards.length, billboards }),
)
await writeFile(
  path.join(OUT, 'api/v1/figures'),
  JSON.stringify({ count: summaries.length, figures: summaries }),
)
await writeFile(
  path.join(OUT, 'api/v1/meta'),
  JSON.stringify({
    name: 'Honour India',
    version: 'v1 (static edition — GitHub Pages)',
    figures: figures.length,
    note: 'Served as pre-generated JSON; see the Node server edition for per-request randomness and detail endpoints.',
  }),
)

console.log(`dist-pages built: ${figures.length} figures, site + embed.js + images + static API.`)
