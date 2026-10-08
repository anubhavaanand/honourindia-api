/**
 * Honour India — embeddable billboard widget.
 *
 * Usage (one line on any page):
 *   <div data-honourindia></div>
 *   <script src="https://your-host/embed.js" async></script>
 *
 * Options (attributes on the container, or passed to HonourIndia.mount):
 *   data-api       — API base, defaults to <origin of embed.js>/api/v1
 *   data-theme     — "dark" (default) | "light"
 *   data-interval  — seconds per billboard, default 8, min 5, max 60
 *   data-size      — "rectangle" (300x250, default) | "leaderboard" (728x96) | "poster" (480x520)
 *
 * The widget mounts into a shadow root (no CSS clashes with the host page),
 * fetches a batch of billboards once, rotates them client-side, pauses when
 * the tab is hidden, and respects prefers-reduced-motion.
 */

type Theme = 'dark' | 'light'
type Size = 'rectangle' | 'leaderboard' | 'poster'

interface Billboard {
  slug: string
  name: string
  years: string | null
  field: string
  tagline: string
  quote: { text: string; source?: string } | null
  image: { url: string; credit?: string; license?: string } | null
  link: string
}

interface MountOptions {
  api?: string
  theme?: Theme
  interval?: number
  size?: Size
}

interface MountHandle {
  destroy(): void
}

const VERSION = '0.1.0'
const BATCH_SIZE = 14
const MIN_INTERVAL = 5
const MAX_INTERVAL = 60
const DEFAULT_INTERVAL = 8

const scriptEl = document.currentScript as HTMLScriptElement | null

function defaultApi(): string {
  if (scriptEl && /^https?:/.test(scriptEl.src)) {
    return new URL('/api/v1', scriptEl.src).toString()
  }
  return `${location.origin}/api/v1`
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

const CSS = `
:host { display: block; }

.hi {
  position: relative;
  width: 100%;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  border-radius: 12px;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
.hi--rectangle { max-width: 300px; aspect-ratio: 300 / 250; }
.hi--poster { max-width: 480px; aspect-ratio: 480 / 520; }
.hi--leaderboard { max-width: 728px; aspect-ratio: auto; height: 96px; }

/* themes */
.hi--dark { background: #101418; color: #f4f1ea; }
.hi--light { background: #faf7f0; color: #1a1d21; }
.hi--dark .hi-card { box-shadow: 0 10px 30px rgba(0,0,0,.45); }
.hi--light .hi-card { box-shadow: 0 10px 30px rgba(20,20,30,.18); }

.hi-card {
  position: absolute; inset: 0;
  display: block;
  text-decoration: none; color: inherit;
  border-radius: 12px; overflow: hidden;
}

.hi-layer {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  opacity: 0; transform: scale(1.015);
  transition: opacity .55s ease, transform .55s ease;
  pointer-events: none;
}
.hi-layer.is-active { opacity: 1; transform: none; }

.hi-media { position: absolute; inset: 0; background-size: cover; background-position: 50% 22%; }
.hi-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; }
.hi-noimg {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 4.5rem; font-weight: 700; letter-spacing: .04em;
}
.hi--dark .hi-noimg { background: linear-gradient(150deg, #1c2733 0%, #2e1f14 60%, #3a2410 100%); color: rgba(244,241,234,.25); }
.hi--light .hi-noimg { background: linear-gradient(150deg, #efe7d8 0%, #e7d9c1 60%, #dfd0b4 100%); color: rgba(26,29,33,.25); }

.hi-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,12,.12) 0%, rgba(8,10,12,.34) 50%, rgba(8,10,12,.88) 76%, rgba(8,10,12,.95) 100%);
}
.hi--light .hi-scrim {
  background: linear-gradient(180deg, rgba(250,247,240,.12) 0%, rgba(250,247,240,.38) 50%, rgba(250,247,240,.93) 84%, rgba(250,247,240,.98) 100%);
}

.hi-info {
  position: relative; margin-top: auto;
  padding: 12px 14px 8px;
}
.hi-field {
  font-size: 10px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
  color: #ffb454; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hi--light .hi-field { color: #b05e00; }
.hi-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700; line-height: 1.12;
  font-size: 1.22rem;
  margin: 0 0 5px;
}
.hi--poster .hi-name { font-size: 1.9rem; }
.hi-tag {
  font-size: .74rem; line-height: 1.35; opacity: .88;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.hi--poster .hi-tag { font-size: .85rem; -webkit-line-clamp: 4; }
.hi--leaderboard .hi-tag { -webkit-line-clamp: 2; }
.hi--leaderboard .hi-info { padding: 10px 14px 8px; }

.hi-foot {
  position: relative;
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 4px 14px 9px;
  font-size: 9px; letter-spacing: .02em; opacity: .62;
}
.hi-attr {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.hi-brand { flex-shrink: 0; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }

.hi-progress {
  position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 3;
}
.hi-progress i {
  display: block; height: 100%; width: 0;
  background: linear-gradient(90deg, #ff9933, #ffffff 55%, #138808);
  border-radius: 0 2px 2px 0;
}
@keyframes hi-progress { from { width: 0; } to { width: 100%; } }

.hi-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  z-index: 4;
  width: 26px; height: 26px; border-radius: 50%;
  border: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; line-height: 1; color: #fff;
  background: rgba(10,12,14,.5);
  opacity: 0; transition: opacity .2s ease;
  backdrop-filter: blur(2px);
}
.hi:hover .hi-nav, .hi-nav:focus-visible { opacity: 1; }
.hi-prev { left: 6px; }
.hi-next { right: 6px; }
.hi-nav:hover { background: rgba(10,12,14,.75); }

.hi-error {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 16px; text-align: center;
}
.hi-error-title { font-family: Georgia, serif; font-size: 1.05rem; font-weight: 700; }
.hi-error-sub { font-size: .72rem; opacity: .7; }
.hi-retry {
  border: 1px solid currentColor; background: none; color: inherit;
  border-radius: 6px; padding: 5px 14px; font-size: .72rem; cursor: pointer;
}
.hi-retry:hover { opacity: .8; }

@media (prefers-reduced-motion: reduce) {
  .hi-layer { transition: none; }
}
`

function buildDom(size: Size, theme: Theme): { root: HTMLElement; progress: HTMLElement; card: HTMLAnchorElement; layers: [HTMLElement, HTMLElement]; navPrev: HTMLButtonElement; navNext: HTMLButtonElement; errorBox: HTMLElement } {
  const root = document.createElement('div')
  root.className = `hi hi--${size} hi--${theme}`
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Honour India — billboards honouring Indian scientists')

  const card = document.createElement('a')
  card.className = 'hi-card'
  card.target = '_blank'
  card.rel = 'noopener noreferrer'

  const layers: HTMLElement[] = []
  for (let i = 0; i < 2; i++) {
    const layer = document.createElement('div')
    layer.className = 'hi-layer'
    // only the active crossfade layer is exposed to assistive tech
    if (i === 1) layer.setAttribute('aria-hidden', 'true')
    layer.innerHTML =
      '<div class="hi-media"></div>' +
      '<div class="hi-scrim"></div>' +
      '<div class="hi-info"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div>' +
      '<div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">सम्मान · Honour India</span></div>'
    card.appendChild(layer)
    layers.push(layer)
  }

  const progress = document.createElement('div')
  progress.className = 'hi-progress'
  progress.innerHTML = '<i></i>'

  const navPrev = document.createElement('button')
  navPrev.className = 'hi-nav hi-prev'
  navPrev.setAttribute('aria-label', 'Previous figure')
  navPrev.innerHTML = '&#8249;'
  const navNext = document.createElement('button')
  navNext.className = 'hi-nav hi-next'
  navNext.setAttribute('aria-label', 'Next figure')
  navNext.innerHTML = '&#8250;'

  const errorBox = document.createElement('div')
  errorBox.className = 'hi-error'
  errorBox.style.display = 'none'
  errorBox.innerHTML =
    '<div class="hi-error-title">सम्मान · Honour India</div>' +
    '<div class="hi-error-sub">Could not reach the Honour India API. Retrying…</div>'

  root.append(progress, card, navPrev, navNext, errorBox)
  return { root, progress, card, layers: [layers[0]!, layers[1]!], navPrev, navNext, errorBox }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function fillLayer(layer: HTMLElement, b: Billboard, baseUrl: string): void {
  const media = layer.querySelector<HTMLElement>('.hi-media')!
  const field = layer.querySelector<HTMLElement>('.hi-field')!
  const name = layer.querySelector<HTMLElement>('.hi-name')!
  const tag = layer.querySelector<HTMLElement>('.hi-tag')!
  const attr = layer.querySelector<HTMLElement>('.hi-attr')!

  field.textContent = b.field + (b.years ? ` · ${b.years}` : '')
  name.textContent = b.name
  tag.textContent = b.tagline

  if (b.image) {
    const img = document.createElement('img')
    img.alt = `Portrait of ${b.name}`
    img.loading = 'eager'
    img.decoding = 'async'
    img.src = new URL(b.image.url, baseUrl).toString()
    img.onerror = () => {
      media.innerHTML = ''
      const fallback = document.createElement('div')
      fallback.className = 'hi-noimg'
      fallback.textContent = initials(b.name)
      media.appendChild(fallback)
    }
    media.innerHTML = ''
    media.appendChild(img)
  } else {
    media.innerHTML = ''
    const fallback = document.createElement('div')
    fallback.className = 'hi-noimg'
    fallback.textContent = initials(b.name)
    media.appendChild(fallback)
  }

  const credit = b.image?.credit || 'Wikimedia Commons'
  const license = b.image?.license || ''
  attr.textContent = `Photo: ${credit}${license ? ` · ${license}` : ''}`
}

function preload(b: Billboard, baseUrl: string): Promise<void> {
  const image = b.image
  if (!image) return Promise.resolve()
  return new Promise((resolve) => {
    const img = new Image()
    const done = () => resolve()
    img.onload = done
    img.onerror = done
    img.src = new URL(image.url, baseUrl).toString()
    setTimeout(done, 2000)
  })
}

class BillboardWidget {
  private queue: Billboard[] = []
  private index = -1
  private active = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private fetching = false
  private destroyed = false
  private auto: boolean
  private intervalMs: number
  private api: string
  private dom: ReturnType<typeof buildDom>
  private shadow: ShadowRoot
  private host: Element

  constructor(host: Element, opts: MountOptions) {
    this.host = host
    this.api = opts.api ?? defaultApi()
    const interval = clamp(opts.interval ?? DEFAULT_INTERVAL, MIN_INTERVAL, MAX_INTERVAL)
    this.intervalMs = interval * 1000
    this.auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = ''
    const style = document.createElement('style')
    style.textContent = CSS
    this.shadow.appendChild(style)

    this.dom = buildDom(opts.size ?? 'rectangle', opts.theme ?? 'dark')
    this.shadow.appendChild(this.dom.root)

    this.dom.navPrev.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.step(-1) })
    this.dom.navNext.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.step(1) })
    document.addEventListener('visibilitychange', this.onVisibility)

    void this.fetchBatch()
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.pause()
    } else if (!this.destroyed && this.queue.length > 0) {
      this.show(this.index, true)
    }
  }

  private async fetchBatch(): Promise<void> {
    if (this.fetching || this.destroyed) return
    this.fetching = true
    let retryMs = 5000
    for (;;) {
      if (this.destroyed) return
      try {
        const res = await fetch(`${this.api}/billboards/random?count=${BATCH_SIZE}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { billboards: Billboard[] }
        if (this.destroyed) return
        this.dom.errorBox.style.display = 'none'
        this.dom.card.style.visibility = 'visible'
        this.queue.push(...data.billboards)
        if (this.index < 0) this.show(0)
        else this.schedule()
        this.fetching = false
        return
      } catch {
        if (this.index < 0) {
          this.dom.errorBox.style.display = 'flex'
          this.dom.card.style.visibility = 'hidden'
        }
        await new Promise((r) => setTimeout(r, retryMs))
        retryMs = Math.min(retryMs * 3, 90000)
      }
    }
  }

  private step(dir: 1 | -1): void {
    if (this.queue.length === 0) return
    const next = (this.index + dir + this.queue.length) % this.queue.length
    this.show(next)
  }

  private async show(index: number, resumeOnly = false): Promise<void> {
    if (this.destroyed) return
    if (this.queue.length === 0) return
    this.index = ((index % this.queue.length) + this.queue.length) % this.queue.length
    const b = this.queue[this.index]!
    if (!resumeOnly) await preload(b, this.api)

    if (this.destroyed) return
    const incoming = this.dom.layers[this.active === 0 ? 1 : 0]!
    const outgoing = this.dom.layers[this.active]!
    fillLayer(incoming, b, this.api)
    this.dom.card.href = b.link
    incoming.classList.add('is-active')
    incoming.setAttribute('aria-hidden', 'false')
    outgoing.classList.remove('is-active')
    outgoing.setAttribute('aria-hidden', 'true')
    this.active = this.active === 0 ? 1 : 0

    // refresh near the end of the queue so rotation never stalls
    if (this.queue.length - this.index <= 3) void this.fetchBatch()
    this.schedule()
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.auto || document.hidden || this.destroyed) return
    const bar = this.dom.progress.firstElementChild as HTMLElement | null
    if (bar) {
      bar.style.animation = 'none'
      void bar.offsetWidth // reflow so the animation restarts
      bar.style.animation = `hi-progress ${this.intervalMs}ms linear forwards`
    }
    this.timer = setTimeout(() => this.step(1), this.intervalMs)
  }

  private pause(): void {
    this.clearTimer()
    const bar = this.dom.progress.firstElementChild as HTMLElement | null
    if (bar) bar.style.animationPlayState = 'paused'
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  destroy(): void {
    this.destroyed = true
    this.clearTimer()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.shadow.innerHTML = ''
  }
}

function mount(el: Element | string, opts: MountOptions = {}): MountHandle {
  const host = typeof el === 'string' ? document.querySelector(el) : el
  if (!host) throw new Error('[honourindia] mount target not found')
  const widget = new BillboardWidget(host, opts)
  return { destroy: () => widget.destroy() }
}

function readDataset(el: Element): MountOptions {
  const ds = (el as HTMLElement).dataset
  const interval = ds.interval !== undefined ? Number(ds.interval) : undefined
  return {
    api: ds.api,
    theme: ds.theme === 'light' ? 'light' : ds.theme === 'dark' ? 'dark' : undefined,
    size: ['rectangle', 'leaderboard', 'poster'].includes(ds.size ?? '') ? (ds.size as Size) : undefined,
    interval: Number.isFinite(interval) ? interval : undefined,
  }
}

declare global {
  interface Window {
    HonourIndia?: {
      version: string
      mount(el: Element | string, opts?: MountOptions): MountHandle
    }
  }
}

window.HonourIndia = { version: VERSION, mount }

function autoMount(): void {
  document.querySelectorAll('[data-honourindia]').forEach((el) => {
    if (el.getAttribute('data-honourindia-mounted') === '1') return
    el.setAttribute('data-honourindia-mounted', '1')
    mount(el, readDataset(el))
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount, { once: true })
} else {
  autoMount()
}

export { mount, VERSION }
