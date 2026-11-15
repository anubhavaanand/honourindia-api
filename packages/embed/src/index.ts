/**
 * Honour India — embeddable billboard widget.
 *
 * Usage (one line on any page):
 *   <div data-honourindia></div>
 *   <script src="https://your-host/embed.js" integrity="sha384-XTEXrYvun/pWlclCcmXe0PtYbUYPjPy8hZWIbCzsIxDbpyLfi6K7WVKoQW7ql7rK" crossorigin="anonymous" async></script>
 *
 * Options (attributes on the container, or passed to HonourIndia.mount):
 *   data-api       — API base, defaults to <origin of embed.js>/api/v1
 *   data-theme     — "dark" (default) | "light"
 *   data-interval  — seconds per billboard, default 8, min 5, max 60
 *   data-size      — "rectangle" (300x250, default) | "leaderboard" (728x96) | "poster" (480x480 square)
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
  attribution?: { source: string; url: string; license?: string; revisionDate?: string | null }
}

interface MountOptions {
  api?: string
  theme?: Theme
  interval?: number
  size?: Size
  /** Optional API key (data-key) — unlocks higher rate limits for heavy embeds. */
  key?: string
  /** Optional image preload timeout in ms, default 8000 (0 to disable timeout and wait for load) */
  preloadTimeout?: number
  /** Optional lazy loading for portrait images (default true) */
  lazyLoad?: boolean
}

interface MountHandle {
  destroy(): void
  update(options: Partial<MountOptions>): void
}

const VERSION = '0.1.0'
const BATCH_SIZE = 14
const MIN_INTERVAL = 5
const MAX_INTERVAL = 60
export const MAX_FETCH_RETRIES = 5
export const MAX_IMAGE_RETRIES = 2
export const DEFAULT_PRELOAD_TIMEOUT = 8000
const DEFAULT_INTERVAL = 8

const scriptEl = document.currentScript as HTMLScriptElement | null

function defaultApi(): string {
  // Resolve relative to the script's own directory, not the domain root —
  // GitHub Pages project sites serve under a subpath (…/repo/embed.js).
  if (scriptEl && /^https?:/.test(scriptEl.src)) {
    return new URL('api/v1', new URL('.', scriptEl.src)).toString()
  }
  return new URL('api/v1/', new URL('.', location.href)).toString()
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 60000
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10)
    return seconds > 0 ? seconds * 1000 : 60000
  }
  const dateMs = Date.parse(trimmed)
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now()
    return diff > 0 ? diff : 60000
  }
  return 60000
}

/** Fisher-Yates — randomises order client-side so even a cached or static batch rotates freshly per visitor. */
function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const CSS = `
:host { display: block; width: 100%; }

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
.hi--poster { max-width: 480px; aspect-ratio: 1 / 1; }
.hi--leaderboard { max-width: 728px; aspect-ratio: auto; height: 96px; }

/* themes */
.hi--dark { background: #0a0a0c; color: #f2efe9; }
.hi--light { background: #faf7f0; color: #1a1d21; }
.hi--dark .hi-card { box-shadow: 0 10px 30px rgba(0,0,0,.5); }
.hi--light .hi-card { box-shadow: 0 10px 30px rgba(20,20,30,.18); }

/* split-layout panels (leaderboard): solid text column beside the photo */
.hi--dark .hi-nameplate { background: #101013; border-top: 1px solid #24242b; }
.hi--dark .hi-panel { background: #101013; border-left: 1px solid #24242b; }
.hi--poster.hi--dark .hi-foot { background: #101013; border-top: 1px solid #24242b; }
.hi--light .hi-nameplate { background: #f3eee2; border-top: 1px solid #d9d0bd; }
.hi--light .hi-panel { background: #f3eee2; border-left: 1px solid #d9d0bd; }
.hi--poster.hi--light .hi-foot { background: #f3eee2; border-top: 1px solid #d9d0bd; }

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
.hi--light .hi-field { color: #995100; }
.hi-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 700; line-height: 1.12;
  font-size: 1.22rem;
  margin: 0 0 5px;
}
.hi-tag {
  font-size: .74rem; line-height: 1.35; opacity: .88;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

/* RTL support: names/taglines/kickers auto-detect text direction so
   Devanagari, Latin, Arabic, Urdu, etc. all render correctly. */
.hi-name, .hi-tag, .hi-field, .hi-nameplate-sub {
  direction: auto;
}

/* ---- split layout (leaderboard): slim image column + text column ---- */
.hi-body { position: relative; display: flex; flex: 1; min-height: 0; }

.hi-panel {
  flex: 1; min-width: 0;
  padding: 14px 16px;
  display: flex; flex-direction: column; justify-content: center; gap: 8px;
}

/* ---- poster: square, image-dominant; info over scrim at the bottom ---- */
.hi--poster .hi-panel { display: none; }
.hi--poster .hi-quote { display: none; }

.hi--poster .hi-scrim {
  background: linear-gradient(180deg, rgba(8,10,12,0) 0%, rgba(8,10,12,.45) 55%, rgba(8,10,12,.92) 100%);
}
.hi--light .hi--poster .hi-scrim {
  background: linear-gradient(180deg, rgba(250,247,240,0) 0%, rgba(250,247,240,.45) 55%, rgba(250,247,240,.96) 100%);
}

.hi--poster .hi-media { background-position: 50% 50%; }
.hi--poster .hi-media img { object-position: 50% 50%; }

.hi--poster .hi-info { margin-top: auto; padding: 14px 16px 12px; }
.hi--poster .hi-field { margin-bottom: 6px; }
.hi--poster .hi-name { font-size: 1.4rem; margin: 0 0 5px; line-height: 1.15; }
.hi--poster .hi-nameplate-sub { margin-top: 3px; font-size: .66rem; letter-spacing: .08em; opacity: .6; }
.hi--poster .hi-tag { font-size: .82rem; line-height: 1.4; -webkit-line-clamp: 3; }

.hi--poster .hi-foot { position: relative; padding: 8px 14px 10px; }

.hi--leaderboard .hi-media { right: auto; width: 96px; }
.hi--leaderboard .hi-panel { position: absolute; top: 0; bottom: 0; left: 96px; right: 0; padding: 8px 92px 8px 14px; gap: 2px; }
.hi--leaderboard .hi-field { font-size: 9px; margin-bottom: 0; }
.hi--leaderboard .hi-name { font-size: 1.02rem; margin: 0; }
.hi--leaderboard .hi-tag { font-size: .71rem; -webkit-line-clamp: 2; }
.hi--leaderboard .hi-foot {
  position: absolute; right: 10px; bottom: 7px; z-index: 3;
  padding: 0; flex-direction: column; align-items: flex-end; gap: 1px;
  max-width: 82px; font-size: 7px; line-height: 1.35; opacity: .55;
}
.hi--leaderboard .hi-brand { font-size: 7px; }
.hi--leaderboard .hi-noimg { font-size: 1.7rem; }
.hi--poster .hi-noimg { font-size: 3.5rem; }

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
.hi-nav:focus-visible, .hi-retry:focus-visible {
  outline: 2px solid #ff9933;
  outline-offset: 2px;
}
.hi-card:focus-visible {
  outline: 2px solid #ff9933;
  outline-offset: -2px;
}
.hi:focus-visible {
  outline: 2px solid #ff9933;
  outline-offset: 2px;
}

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

.hi-loading {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; opacity: 1; transition: opacity .3s ease; pointer-events: none; z-index: 2;
}
.hi-loading-hidden { display: none !important; }
.hi-loading-brand {
  font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; font-size: .72rem; opacity: .75;
}
.hi--dark .hi-loading-brand { color: #ffb454; }
.hi--light .hi-loading-brand { color: #995100; }
.hi-loading-pulse {
  width: 24px; height: 24px; border: 2px solid currentColor; border-bottom-color: transparent;
  border-radius: 50%; animation: hi-pulse .7s linear infinite;
}
@keyframes hi-pulse { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .hi-layer { transition: none; }
}

.hi-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
`

function buildDom(
  size: Size,
  theme: Theme,
): {
  root: HTMLElement
  progress: HTMLElement
  card: HTMLAnchorElement
  layers: [HTMLElement, HTMLElement]
  navPrev: HTMLButtonElement
  navNext: HTMLButtonElement
  errorBox: HTMLElement
  loading: HTMLElement
  liveRegion: HTMLElement
} {
  const root = document.createElement('div')
  root.className = `hi hi--${size} hi--${theme}`
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', 'Honour India — billboards honouring Indian scientists')
  root.setAttribute('tabindex', '0')

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
    if (size === 'poster') {
      layer.innerHTML =
        '<div class="hi-media"></div>' +
        '<div class="hi-scrim"></div>' +
        '<div class="hi-info"><div class="hi-field"></div><h3 class="hi-name"></h3>' +
        '<div class="hi-nameplate-sub"></div><p class="hi-tag"></p></div>' +
        '<div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">सम्मान · Honour India</span></div>'
    } else if (size === 'leaderboard') {
      layer.innerHTML =
        '<div class="hi-body">' +
        '<div class="hi-media"></div>' +
        '<div class="hi-panel"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div>' +
        '</div>' +
        '<div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">सम्मान · Honour India</span></div>'
    } else {
      layer.innerHTML =
        '<div class="hi-media"></div>' +
        '<div class="hi-scrim"></div>' +
        '<div class="hi-info"><div class="hi-field"></div><h3 class="hi-name"></h3><p class="hi-tag"></p></div>' +
        '<div class="hi-foot"><span class="hi-attr"></span><span class="hi-brand">सम्मान · Honour India</span></div>'
    }
    card.appendChild(layer)
    layers.push(layer)
  }

  const progress = document.createElement('div')
  progress.className = 'hi-progress'
  progress.innerHTML = '<i></i>'

  const navPrev = document.createElement('button')
  navPrev.className = 'hi-nav hi-prev'
  navPrev.setAttribute('type', 'button')
  navPrev.setAttribute('aria-label', 'Previous figure')
  navPrev.innerHTML = '&#8249;'
  const navNext = document.createElement('button')
  navNext.className = 'hi-nav hi-next'
  navNext.setAttribute('type', 'button')
  navNext.setAttribute('aria-label', 'Next figure')
  navNext.innerHTML = '&#8250;'

  const errorBox = document.createElement('div')
  errorBox.className = 'hi-error'
  errorBox.style.display = 'none'
  errorBox.innerHTML =
    '<div class="hi-error-title">सम्मान · Honour India</div>' +
    '<div class="hi-error-sub">Could not reach the Honour India API. Retrying…</div>' +
    '<button class="hi-retry" type="button">Try again</button>'

  const loading = document.createElement('div')
  loading.className = 'hi-loading'
  loading.innerHTML =
    '<div class="hi-loading-brand">सम्मान · Honour India</div>' +
    '<div class="hi-loading-pulse"></div>'

  const liveRegion = document.createElement('div')
  liveRegion.className = 'hi-sr-only'
  liveRegion.setAttribute('aria-live', 'polite')
  liveRegion.setAttribute('aria-atomic', 'true')

  root.append(progress, card, navPrev, navNext, errorBox, loading, liveRegion)
  return {
    root,
    progress,
    card,
    layers: [layers[0]!, layers[1]!],
    navPrev,
    navNext,
    errorBox,
    loading,
    liveRegion,
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

function fillLayer(layer: HTMLElement, b: Billboard, baseUrl: string, lazy = true): void {
  const media = layer.querySelector<HTMLElement>('.hi-media')!
  const field = layer.querySelector<HTMLElement>('.hi-field')!
  const name = layer.querySelector<HTMLElement>('.hi-name')!
  const tag = layer.querySelector<HTMLElement>('.hi-tag')!
  const attr = layer.querySelector<HTMLElement>('.hi-attr')!

  // poster: field name only; years render under the name via hi-nameplate-sub; other sizes append years to the kicker
  const nameplateSub = layer.querySelector<HTMLElement>('.hi-nameplate-sub')
  if (nameplateSub) {
    field.textContent = b.field
    nameplateSub.textContent = b.years ?? ''
  } else {
    field.textContent = b.field + (b.years ? ` · ${b.years}` : '')
  }
  name.textContent = b.name
  tag.textContent = b.tagline

  const quote = layer.querySelector<HTMLElement>('.hi-quote')
  if (quote) {
    if (b.quote) {
      quote.textContent = `“${b.quote.text}”`
      quote.classList.add('has')
    } else {
      quote.textContent = ''
      quote.classList.remove('has')
    }
  }

  if (b.image) {
    const img = document.createElement('img')
    img.alt = `Portrait of ${b.name}`
    img.loading = lazy ? 'lazy' : 'eager'
    img.decoding = 'async'
    const fullUrl = new URL(b.image.url, baseUrl).toString()
    img.src = fullUrl
    let attempts = 0
    img.onerror = () => {
      if (attempts < MAX_IMAGE_RETRIES) {
        attempts++
        setTimeout(() => {
          img.src = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}retry=${attempts}_${Date.now()}`
        }, 300 * attempts)
        return
      }
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

export function preload(
  b: Billboard,
  baseUrl: string,
  timeoutMs: number = DEFAULT_PRELOAD_TIMEOUT,
): Promise<void> {
  const image = b.image
  if (!image) return Promise.resolve()
  return new Promise((resolve) => {
    const img = new Image()
    let timer: ReturnType<typeof setTimeout> | null = null
    const done = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      img.onload = null
      img.onerror = null
      resolve()
    }
    img.onload = done
    img.onerror = done
    img.src = new URL(image.url, baseUrl).toString()
    if (img.complete) {
      done()
      return
    }
    if (timeoutMs > 0) {
      timer = setTimeout(done, timeoutMs)
    }
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
  private preloadTimeout: number
  private api: string
  private apiKey: string
  private theme: Theme
  private size: Size
  private lazyLoad: boolean
  private inView = true
  private observer: IntersectionObserver | null = null
  private dom: ReturnType<typeof buildDom>
  private shadow: ShadowRoot
  private host: Element

  constructor(host: Element, opts: MountOptions) {
    this.host = host
    this.api = opts.api ?? defaultApi()
    this.apiKey = opts.key ?? ''
    this.theme = opts.theme ?? 'dark'
    this.size = opts.size ?? 'rectangle'
    this.lazyLoad = opts.lazyLoad !== false
    const interval = clamp(opts.interval ?? DEFAULT_INTERVAL, MIN_INTERVAL, MAX_INTERVAL)
    this.intervalMs = interval * 1000
    this.preloadTimeout =
      opts.preloadTimeout !== undefined ? Math.max(0, opts.preloadTimeout) : DEFAULT_PRELOAD_TIMEOUT
    this.auto = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (typeof IntersectionObserver !== 'undefined') {
      this.inView = false
      this.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const wasInView = this.inView
            this.inView = true
            if (!wasInView && !this.destroyed && this.queue.length > 0) {
              if (this.index < 0) void this.show(0)
              else this.schedule()
            }
          } else {
            this.inView = false
            this.pause()
          }
        }
      })
      this.observer.observe(this.host)
    }

    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = ''
    const style = document.createElement('style')
    style.textContent = CSS
    this.shadow.appendChild(style)

    this.dom = buildDom(this.size, this.theme)
    this.shadow.appendChild(this.dom.root)

    this.attachDomEvents()
    this.dom.card.style.visibility = 'visible'

    document.addEventListener('visibilitychange', this.onVisibility)

    void this.fetchBatch()
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      this.step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.step(1)
    }
  }

  private attachDomEvents(): void {
    this.dom.root.addEventListener('keydown', this.onKeydown)
    this.dom.navPrev.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.step(-1)
    })
    this.dom.navNext.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.step(1)
    })
    const retryBtn = this.dom.errorBox.querySelector('.hi-retry')
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        const sub = this.dom.errorBox.querySelector('.hi-error-sub')
        if (sub) sub.textContent = 'Could not reach the Honour India API. Retrying…'
        void this.fetchBatch()
      })
    }
  }

  update(opts: Partial<MountOptions>): void {
    if (this.destroyed) return

    if (opts.theme && opts.theme !== this.theme) {
      this.dom.root.classList.remove(`hi--${this.theme}`)
      this.theme = opts.theme
      this.dom.root.classList.add(`hi--${this.theme}`)
    }

    if (opts.size && opts.size !== this.size) {
      this.dom.root.removeEventListener('keydown', this.onKeydown)
      this.size = opts.size
      const oldRoot = this.dom.root
      this.dom = buildDom(this.size, this.theme)
      this.shadow.replaceChild(this.dom.root, oldRoot)
      this.attachDomEvents()
      this.dom.card.style.visibility = 'visible'
      if (this.index >= 0 && this.queue.length > 0) {
        this.show(this.index, true)
      }
    }

    if (opts.interval !== undefined) {
      const interval = clamp(opts.interval, MIN_INTERVAL, MAX_INTERVAL)
      this.intervalMs = interval * 1000
      this.schedule()
    }

    if (opts.preloadTimeout !== undefined) {
      this.preloadTimeout = Math.max(0, opts.preloadTimeout)
    }

    if (opts.lazyLoad !== undefined) {
      this.lazyLoad = opts.lazyLoad
    }

    let refetchNeeded = false
    if (opts.api !== undefined && opts.api !== this.api) {
      this.api = opts.api
      refetchNeeded = true
    }
    if (opts.key !== undefined) {
      const newKey = opts.key
      if (newKey !== this.apiKey) {
        this.apiKey = newKey
        refetchNeeded = true
      }
    }

    if (refetchNeeded) {
      this.queue = []
      this.index = -1
      this.fetching = false
      this.dom.loading.classList.remove('hi-loading-hidden')
      void this.fetchBatch()
    }
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
    let retries = 0
    while (retries < MAX_FETCH_RETRIES) {
      if (this.destroyed) {
        this.fetching = false
        return
      }
      try {
        // The API key travels in the Authorization header, never in the query
        // string: query strings end up in access logs, browser history and
        // Referer headers.
        const res = await fetch(`${this.api}/billboards/random?count=${BATCH_SIZE}`, {
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        })
        if (res.status === 429) {
          retries++
          const waitMs = parseRetryAfter(res.headers?.get?.('Retry-After'))
          this.dom.errorBox.style.display = 'flex'
          this.dom.card.style.visibility = 'hidden'
          this.dom.loading.classList.add('hi-loading-hidden')
          if (retries >= MAX_FETCH_RETRIES) {
            const sub = this.dom.errorBox.querySelector('.hi-error-sub')
            if (sub)
              sub.textContent = 'Could not reach the Honour India API. Maximum retries exceeded.'
            break
          }
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { billboards: Billboard[] }
        if (this.destroyed) {
          this.fetching = false
          return
        }
        this.dom.errorBox.style.display = 'none'
        this.dom.card.style.visibility = 'visible'
        this.dom.loading.classList.add('hi-loading-hidden')
        const sub = this.dom.errorBox.querySelector('.hi-error-sub')
        if (sub) sub.textContent = 'Could not reach the Honour India API. Retrying…'
        this.queue.push(...shuffle(data.billboards))
        if (this.index < 0) this.show(0)
        else this.schedule()
        this.fetching = false
        return
      } catch {
        retries++
        this.dom.errorBox.style.display = 'flex'
        this.dom.card.style.visibility = 'hidden'
        this.dom.loading.classList.add('hi-loading-hidden')
        if (retries >= MAX_FETCH_RETRIES) {
          const sub = this.dom.errorBox.querySelector('.hi-error-sub')
          if (sub)
            sub.textContent = 'Could not reach the Honour India API. Maximum retries exceeded.'
          break
        }
        await new Promise((r) => setTimeout(r, retryMs))
        if (this.destroyed) {
          this.fetching = false
          return
        }
        retryMs = Math.min(retryMs * 3, 90000)
      }
    }
    this.fetching = false
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
    if (!resumeOnly && (this.inView || !this.lazyLoad))
      await preload(b, this.api, this.preloadTimeout)

    if (this.destroyed) return
    const incoming = this.dom.layers[this.active === 0 ? 1 : 0]!
    const outgoing = this.dom.layers[this.active]!
    fillLayer(incoming, b, this.api, this.lazyLoad)
    this.dom.card.href = b.link
    incoming.classList.add('is-active')
    incoming.setAttribute('aria-hidden', 'false')
    outgoing.classList.remove('is-active')
    outgoing.setAttribute('aria-hidden', 'true')
    this.active = this.active === 0 ? 1 : 0
    this.dom.liveRegion.textContent = `${b.name}, ${b.field}`

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
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.dom.root.removeEventListener('keydown', this.onKeydown)
    this.shadow.innerHTML = ''
  }
}

function mount(el: Element | string, opts: MountOptions = {}): MountHandle {
  const host = typeof el === 'string' ? document.querySelector(el) : el
  if (!host) throw new Error('[honourindia] mount target not found')
  const widget = new BillboardWidget(host, opts)
  return {
    destroy: () => widget.destroy(),
    update: (newOpts: Partial<MountOptions>) => widget.update(newOpts),
  }
}

function readDataset(el: Element): MountOptions {
  const ds = (el as HTMLElement).dataset
  const interval = ds.interval !== undefined ? Number(ds.interval) : undefined
  const preloadTimeout = ds.preloadTimeout !== undefined ? Number(ds.preloadTimeout) : undefined
  const lazyLoad = ds.lazyLoad !== undefined ? ds.lazyLoad !== 'false' : undefined
  return {
    api: ds.api,
    theme: ds.theme === 'light' ? 'light' : ds.theme === 'dark' ? 'dark' : undefined,
    size: ['rectangle', 'leaderboard', 'poster'].includes(ds.size ?? '')
      ? (ds.size as Size)
      : undefined,
    interval: Number.isFinite(interval) ? interval : undefined,
    key: ds.key,
    preloadTimeout: Number.isFinite(preloadTimeout) ? preloadTimeout : undefined,
    lazyLoad,
  }
}

declare global {
  interface Window {
    HonourIndia?: {
      version: string
      mount(el: Element | string, opts?: MountOptions): MountHandle
      mountAll(root?: ParentNode): MountHandle[]
    }
  }
}

function mountAll(root: ParentNode = document): MountHandle[] {
  const handles: MountHandle[] = []
  root.querySelectorAll('[data-honourindia]').forEach((el) => {
    if (el.getAttribute('data-honourindia-mounted') === '1') return
    el.setAttribute('data-honourindia-mounted', '1')
    handles.push(mount(el, readDataset(el)))
  })
  return handles
}

function setupObserver(): MutationObserver | null {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return null
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const node = mutation.addedNodes[i]!
        if (node.nodeType === 1) {
          const el = node as Element
          if (
            el.hasAttribute('data-honourindia') &&
            el.getAttribute('data-honourindia-mounted') !== '1'
          ) {
            el.setAttribute('data-honourindia-mounted', '1')
            mount(el, readDataset(el))
          }
          if (el.querySelectorAll) {
            el.querySelectorAll('[data-honourindia]').forEach((child) => {
              if (child.getAttribute('data-honourindia-mounted') === '1') return
              child.setAttribute('data-honourindia-mounted', '1')
              mount(child, readDataset(child))
            })
          }
        }
      }
    }
  })

  const target = document.body || document.documentElement
  if (target) {
    observer.observe(target, { childList: true, subtree: true })
  }
  return observer
}

window.HonourIndia = { version: VERSION, mount, mountAll }

function initAutoMount(): void {
  mountAll()
  setupObserver()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoMount, { once: true })
  } else {
    initAutoMount()
  }
}

export { mount, mountAll, setupObserver, VERSION }
