import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/lib and dist/lib sit at the same depth, so this resolves correctly
// whether the server runs from source (tsx) or compiled output (node dist).
const DATA_DIR = path.resolve(__dirname, '../../../../data')
export const ROOT = path.resolve(DATA_DIR, '..')

export interface FigureRecord {
  slug: string
  name: string
  born: number
  died: number | null
  field: string
  tagline: string
  summary: string
  quote: { text: string; source?: string } | null
  wiki: string
  era: 'ancient' | 'medieval' | 'colonial' | 'modern' | 'living'
  enduring: boolean
  stillUsed: string | null
  image: { file: string; credit?: string; license?: string } | null
}

interface ImageMeta {
  file: string
  credit?: string
  license?: string
  source?: string
}

interface FiguresFile {
  version: number
  figures: Array<Omit<FigureRecord, 'image'>>
}

export interface Billboard {
  slug: string
  name: string
  years: string | null
  field: string
  tagline: string
  era: 'ancient' | 'medieval' | 'colonial' | 'modern' | 'living'
  enduring: boolean
  stillUsed: string | null
  quote: FigureRecord['quote']
  image: { url: string; credit?: string; license?: string } | null
  link: string
}

export interface FigureSummary {
  slug: string
  name: string
  years: string | null
  field: string
  tagline: string
  era: 'ancient' | 'medieval' | 'colonial' | 'modern' | 'living'
  image: { url: string } | null
  link: string
}

function years(born: number, died: number | null): string | null {
  if (died !== null && died !== undefined) return `${born}–${died}`
  if (born) return `b. ${born}`
  return null
}

function wikiLink(wiki: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}`
}

function loadFigures(): FigureRecord[] {
  const raw = JSON.parse(readFileSync(path.join(DATA_DIR, 'figures.json'), 'utf8')) as FiguresFile
  const images = loadImages()
  return raw.figures.map((f) => {
    const img = images[f.slug]
    return { ...f, image: img ? { file: img.file, credit: img.credit, license: img.license } : null }
  })
}

function loadImages(): Record<string, ImageMeta> {
  const p = path.join(DATA_DIR, 'images.json')
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, ImageMeta>
}

export const figures: FigureRecord[] = loadFigures()
const bySlug = new Map(figures.map((f) => [f.slug, f]))

export function toBillboard(f: FigureRecord): Billboard {
  return {
    slug: f.slug,
    name: f.name,
    years: years(f.born, f.died),
    field: f.field,
    tagline: f.tagline,
    era: f.era,
    enduring: f.enduring,
    stillUsed: f.stillUsed,
    quote: f.quote,
    image: f.image ? { url: `/images/${f.image.file}`, credit: f.image.credit, license: f.image.license } : null,
    link: wikiLink(f.wiki),
  }
}

export function toSummary(f: FigureRecord): FigureSummary {
  return {
    slug: f.slug,
    name: f.name,
    years: years(f.born, f.died),
    field: f.field,
    tagline: f.tagline,
    era: f.era,
    image: f.image ? { url: `/images/${f.image.file}` } : null,
    link: wikiLink(f.wiki),
  }
}

export function findBySlug(slug: string): FigureRecord | undefined {
  return bySlug.get(slug)
}

export interface FigureFilter {
  field?: string
  search?: string
  enduring?: boolean
  limit?: number
  offset?: number
}

export function filterFigures(opts: FigureFilter): FigureRecord[] {
  let out = [...figures]
  if (opts.field) {
    const q = opts.field.toLowerCase()
    out = out.filter((f) => f.field.toLowerCase().includes(q))
  }
  if (opts.search) {
    const q = opts.search.toLowerCase()
    out = out.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      f.tagline.toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q)
    )
  }
  if (opts.enduring !== undefined) {
    out = out.filter((f) => f.enduring === opts.enduring)
  }
  if (opts.offset !== undefined) out = out.slice(opts.offset)
  if (opts.limit !== undefined) out = out.slice(0, opts.limit)
  return out
}

/** Random sample without replacement; wraps by reshuffling if count exceeds total. */
export function sampleRandom(count: number): FigureRecord[] {
  const pool = [...figures]
  const out: FigureRecord[] = []
  while (out.length < count && pool.length > 0) {
    if (pool.length === 1) {
      out.push(pool.pop()!)
      break
    }
    const i = Math.floor(Math.random() * pool.length)
    out.push(pool.splice(i, 1)[0]!)
  }
  return out
}
