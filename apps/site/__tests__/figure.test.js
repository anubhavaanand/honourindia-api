import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('figure detail page (apps/site/figure.js)', () => {
  const figureHTML = `
    <div id="figureLoading" class="figure-loading" role="status">Loading figure…</div>
    <article class="figure-detail" hidden>
      <div class="figure-media">
        <img id="figurePortrait" class="figure-portrait" alt="" />
        <div id="figureMonogram" class="figure-monogram">AA</div>
      </div>
      <div class="figure-copy">
        <h1 id="figureName" class="figure-name">Name</h1>
        <div class="figure-meta">
          <span id="figureYears" class="figure-years"></span>
          <span id="figureField" class="figure-field"></span>
          <span id="figureEra" class="figure-era-badge"></span>
        </div>
        <p id="figureTagline" class="figure-tagline"></p>
        <div id="figureSummary" class="figure-summary"></div>
        <blockquote id="figureQuote" class="figure-quote"></blockquote>
        <p id="figureStillUsed" class="figure-still-used"></p>
        <div class="figure-actions">
          <a id="figureWiki" class="btn primary" href="#" target="_blank" rel="noopener noreferrer">Read on Wikipedia</a>
          <p id="figureCredit" class="figure-credit"></p>
        </div>
      </div>
    </article>
    <div id="figureNotFound" class="figure-not-found" hidden>Figure not found</div>
  `

  function setLocation(href) {
    const url = new URL(href)
    Object.defineProperty(window, 'location', {
      value: { href, pathname: url.pathname, origin: url.origin, search: url.search },
      configurable: true,
    })
  }

  function stubFetch() {
    let resolveFetch
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    return { resolve: (payload) => resolveFetch(payload) }
  }

  const figurePayload = {
    name: 'Anna Mani',
    years: '1918–2001',
    field: 'Physics',
    era: 'modern',
    tagline: 'Pioneered weather instruments.',
    summary: 'She insisted India build its own weather instruments.',
    quote: null,
    enduring: false,
    stillUsed: null,
    link: 'https://en.wikipedia.org/wiki/Anna_Mani',
    image: null,
  }

  beforeEach(() => {
    document.body.innerHTML = figureHTML
    setLocation('http://localhost/figure.html')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading while fetching, then the detail page after render', async () => {
    const { resolve } = stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    // fetch has been called but deferred; loading shown, detail hidden
    const loading = document.getElementById('figureLoading')
    const detail = document.querySelector('.figure-detail')
    const name = document.getElementById('figureName')

    expect(loading.hidden).toBe(false)
    expect(detail.hidden).toBe(true)
    expect(name.textContent).toBe('Name')

    resolve({ ok: true, json: () => Promise.resolve(figurePayload) })
    await new Promise((r) => setTimeout(r, 0))

    expect(loading.hidden).toBe(true)
    expect(detail.hidden).toBe(false)
    expect(name.textContent).toBe('Anna Mani')
    expect(document.getElementById('figureEra').textContent).toBe('Modern')
    expect(document.getElementById('figureNotFound').hidden).toBe(true)
  })

  it('injects JSON-LD Person structured data (issue #80)', async () => {
    const { resolve } = stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          ...figurePayload,
          born: 1918,
          died: 2001,
          image: { url: '/images/anna-mani.jpg' },
        }),
    })
    await new Promise((r) => setTimeout(r, 0))

    const script = document.getElementById('figureJsonLd')
    expect(script).toBeTruthy()
    expect(script.getAttribute('type')).toBe('application/ld+json')
    const data = JSON.parse(script.textContent)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Person')
    expect(data.name).toBe('Anna Mani')
    expect(data.jobTitle).toBe('Physics')
    expect(data.birthDate).toBe('1918')
    expect(data.deathDate).toBe('2001')
    expect(data.sameAs).toBe('https://en.wikipedia.org/wiki/Anna_Mani')
    expect(data.image).toContain('/images/anna-mani.jpg')
  })

  it('shows not-found when the figure returns 404 (issue #23)', async () => {
    const { resolve } = stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    resolve({ ok: false, status: 404 })
    await new Promise((r) => setTimeout(r, 0))

    expect(document.getElementById('figureLoading').hidden).toBe(true)
    const notFoundEl = document.getElementById('figureNotFound')
    expect(notFoundEl.hidden).toBe(false)
    expect(notFoundEl.textContent).toBe('Figure not found')
    expect(document.title).toContain('Figure not found')
    expect(document.querySelector('.figure-detail').hidden).toBe(true)
  })

  it('distinguishes server error (500) from 404 (issue #23)', async () => {
    const { resolve } = stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    resolve({ ok: false, status: 500 })
    await new Promise((r) => setTimeout(r, 0))

    expect(document.getElementById('figureLoading').hidden).toBe(true)
    const notFoundEl = document.getElementById('figureNotFound')
    expect(notFoundEl.hidden).toBe(false)
    expect(notFoundEl.textContent).toContain('server error 500')
    expect(document.title).toContain('Error loading figure')
    expect(document.querySelector('.figure-detail').hidden).toBe(true)
  })

  it('distinguishes network failure from 404 (issue #23)', async () => {
    let rejectFetch
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectFetch = reject
        }),
    )
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    rejectFetch(new TypeError('Failed to fetch'))
    await new Promise((r) => setTimeout(r, 0))

    expect(document.getElementById('figureLoading').hidden).toBe(true)
    const notFoundEl = document.getElementById('figureNotFound')
    expect(notFoundEl.hidden).toBe(false)
    expect(notFoundEl.textContent).toContain('check your connection')
    expect(document.title).toContain('Error loading figure')
    expect(document.querySelector('.figure-detail').hidden).toBe(true)
  })

  it('fetches /api/v1/figures/:slug when page is at /figures/:slug on domain root (issue #94)', async () => {
    setLocation('http://localhost:3000/figures/cv-raman')
    stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    expect(globalThis.fetch).toHaveBeenCalled()
    const url = globalThis.fetch.mock.calls[0][0].toString()
    expect(url).toBe('http://localhost:3000/api/v1/figures/cv-raman')
  })

  it('fetches /subpath/api/v1/figures/:slug when page is deployed on a subpath (issue #94)', async () => {
    setLocation('https://user.github.io/my-project/figures/cv-raman')
    stubFetch()
    vi.resetModules()

    // @ts-expect-error test harness mock
    await import('../figure.js')

    expect(globalThis.fetch).toHaveBeenCalled()
    const url = globalThis.fetch.mock.calls[0][0].toString()
    expect(url).toBe('https://user.github.io/my-project/api/v1/figures/cv-raman')
  })
})
