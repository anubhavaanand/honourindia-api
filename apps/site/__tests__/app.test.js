import { describe, it, expect, vi } from 'vitest'

describe('site app.js', () => {
  it('runs the IIFE: fills origin, builds snippet, mounts preview, populates figures grid', async () => {
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option><option value="light">light</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option><option value="poster">poster · 480×320</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
    `

    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/' },
      configurable: true,
    })

    const mountMock = vi.fn(() => ({ destroy: vi.fn() }))
    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: mountMock }

    const figures = [
      {
        slug: 'cv-raman',
        name: 'C. V. Raman',
        field: 'Physics',
        years: '1888–1970',
        era: 'colonial',
        link: 'https://en.wikipedia.org/wiki/C._V._Raman',
        image: null,
      },
    ]
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 28, figures }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')

    // origin placeholders filled
    expect(document.querySelector('.ph-origin').textContent).toBe('http://localhost')

    // embed snippet generated
    const snippetCode = document.querySelector('#snippet code')
    expect(snippetCode.textContent).toContain('<div data-honourindia></div>')
    expect(snippetCode.textContent).toContain('<script src="http://localhost/embed.js" async></script>')
    expect(snippetCode.innerHTML).toContain('data-honourindia')
    expect(snippetCode.innerHTML).toContain('http://localhost/embed.js')
    expect(snippetCode.innerHTML).not.toContain('data-theme=') // dark is default
    expect(snippetCode.innerHTML).not.toContain('data-size=') // rectangle is default
    expect(snippetCode.innerHTML).not.toContain('data-interval=') // 8 is default

    // preview was mounted via HonourIndia.mount
    expect(mountMock).toHaveBeenCalled()
    const mountCall = mountMock.mock.calls[0]
    expect(mountCall[1]).toMatchObject({ theme: 'dark', size: 'rectangle', interval: 8 })

    // figures grid populated after the mocked fetch resolves
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('figuresCount').textContent).toContain('28')
    const cards = document.querySelectorAll('#figureGrid .figure-card')
    expect(cards.length).toBe(figures.length)
    const eraBadge = document.querySelector('#figureGrid .figure-card .figure-era-badge')
    expect(eraBadge).toBeTruthy()
    expect(eraBadge.textContent).toBe('Colonial')

    // switching themes re-renders the preview (calls mount again)
    document.getElementById('optTheme').value = 'light'
    document.getElementById('optTheme').dispatchEvent(new Event('change'))
    expect(mountMock).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state when the catalogue has no figures', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
    `

    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/' },
      configurable: true,
    })

    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: vi.fn(() => ({ destroy: vi.fn() })) }
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0, figures: [] }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')
    await new Promise((r) => setTimeout(r, 0))

    expect(document.getElementById('figuresCount').textContent).toContain('no figures')
    const empty = document.querySelector('#figureGrid .figure-empty')
    expect(empty).toBeTruthy()
    expect(empty.textContent).toMatch(/No figures/)
    expect(document.querySelectorAll('#figureGrid .figure-card').length).toBe(0)
  })

  it('builds subpath-safe figure card links when deployed under a subpath (issue #100)', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
    `

    Object.defineProperty(window, 'location', {
      value: { href: 'https://user.github.io/my-subpath/' },
      configurable: true,
    })

    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: vi.fn(() => ({ destroy: vi.fn() })) }
    const figures = [
      {
        slug: 'aryabhata',
        name: 'Aryabhata',
        field: 'Mathematics',
        years: '476–550',
        link: 'https://en.wikipedia.org/wiki/Aryabhata',
        image: null,
      },
    ]
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 1, figures }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')
    await new Promise((r) => setTimeout(r, 0))

    const cards = document.querySelectorAll('#figureGrid .figure-card')
    expect(cards.length).toBe(1)
    expect(cards[0].getAttribute('href')).toBe('https://user.github.io/my-subpath/figures/aryabhata')
  })

  it('retries preview mounting when embed.js loads asynchronously (issue #99)', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
      <script src="http://localhost/embed.js" async></script>
    `

    // Ensure window.HonourIndia is initially not loaded
    // @ts-expect-error test harness mock
    delete window.HonourIndia

    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0, figures: [] }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')

    const previewMount = document.getElementById('previewMount')
    expect(previewMount.textContent).toContain('Loading billboard widget…')

    // Simulate async load of embed.js
    const mountMock = vi.fn(() => ({ destroy: vi.fn() }))
    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: mountMock }

    const embedScriptEl = document.querySelector('script[src*="embed.js"]')
    embedScriptEl?.dispatchEvent(new Event('load'))

    expect(mountMock).toHaveBeenCalledTimes(1)
  })

  it('displays error message when embed.js fails to load (issue #99)', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
      <script src="http://localhost/embed.js" async></script>
    `

    // @ts-expect-error test harness mock
    delete window.HonourIndia
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0, figures: [] }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')

    const embedScriptEl = document.querySelector('script[src*="embed.js"]')
    embedScriptEl?.dispatchEvent(new Event('error'))

    const previewMount = document.getElementById('previewMount')
    expect(previewMount.textContent).toContain('Could not load the Honour India widget')
  })

  it('supports data-api and data-key options in embed playground (issue #26)', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <input id="optApi" type="url" value="" />
      <input id="optKey" type="text" value="" />
      <button id="copySnippet">Copy</button>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
    `

    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/' },
      configurable: true,
    })

    const mountMock = vi.fn(() => ({ destroy: vi.fn() }))
    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: mountMock }
    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ count: 0, figures: [] }) }),
    )
    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')

    const optApi = document.getElementById('optApi')
    const optKey = document.getElementById('optKey')

    optApi.value = 'https://custom-api.example.com/api/v1'
    optApi.dispatchEvent(new Event('input'))

    expect(mountMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ api: 'https://custom-api.example.com/api/v1' }),
    )
    let snippetCode = document.querySelector('#snippet code')
    expect(snippetCode.textContent).toContain('data-api="https://custom-api.example.com/api/v1"')
    expect(snippetCode.textContent).not.toContain('data-key=')

    optKey.value = 'my-test-key'
    optKey.dispatchEvent(new Event('input'))

    expect(mountMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        api: 'https://custom-api.example.com/api/v1',
        key: 'my-test-key',
      }),
    )
    snippetCode = document.querySelector('#snippet code')
    expect(snippetCode.textContent).toContain('data-api="https://custom-api.example.com/api/v1"')
    expect(snippetCode.textContent).toContain('data-key="my-test-key"')
  })

  it('supports search, field filter, and enduring toggle for figures (issue #21)', async () => {
    vi.resetModules()
    document.body.innerHTML = `
      <span class="ph-origin"></span>
      <pre id="snippet"><code></code></pre>
      <div id="previewMount"></div>
      <select id="optTheme"><option value="dark" selected>dark</option></select>
      <select id="optSize"><option value="rectangle" selected>rectangle · 300×250</option></select>
      <input id="optInterval" type="range" min="5" max="60" value="8" />
      <output id="optIntervalOut">8s</output>
      <button id="copySnippet">Copy</button>
      <div id="figuresFilters">
        <input type="search" id="figureSearch" value="" />
        <select id="figureField"><option value="">All fields</option></select>
        <input type="checkbox" id="figureEnduring" />
      </div>
      <div id="figuresCount">Loading…</div>
      <div id="figureGrid"></div>
    `

    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost/' },
      configurable: true,
    })

    // @ts-expect-error test harness mock
    window.HonourIndia = { version: '0.1.0', mount: vi.fn(() => ({ destroy: vi.fn() })) }

    const initialFigures = [
      {
        slug: 'cv-raman',
        name: 'C. V. Raman',
        field: 'Physics',
        years: '1888–1970',
        era: 'colonial',
        link: 'https://en.wikipedia.org/wiki/C._V._Raman',
        image: null,
      },
      {
        slug: 'aryabhata',
        name: 'Aryabhata',
        field: 'Mathematics',
        years: '476–550',
        era: 'classical',
        link: 'https://en.wikipedia.org/wiki/Aryabhata',
        image: null,
      },
    ]

    // @ts-expect-error test harness mock
    globalThis.fetch = vi.fn((url) => {
      const u = new URL(url.toString())
      const search = u.searchParams.get('search')
      const field = u.searchParams.get('field')
      const enduring = u.searchParams.get('enduring')

      let res = [...initialFigures]
      if (search) res = res.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
      if (field) res = res.filter((f) => f.field === field)
      if (enduring === 'true') res = []

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ count: res.length, total: initialFigures.length, figures: res }),
      })
    })

    // @ts-expect-error test harness mock
    navigator.clipboard = { writeText: vi.fn() }

    await import('../app.js')
    await new Promise((r) => setTimeout(r, 0))

    // Check field dropdown was populated
    const fieldSelect = document.getElementById('figureField')
    expect(fieldSelect.options.length).toBe(3) // "All fields", "Mathematics", "Physics"
    expect(document.querySelectorAll('#figureGrid .figure-card').length).toBe(2)

    // Trigger search filter
    const searchInput = document.getElementById('figureSearch')
    searchInput.value = 'Raman'
    searchInput.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 0))

    expect(document.querySelectorAll('#figureGrid .figure-card').length).toBe(1)
    expect(document.querySelector('#figureGrid .figure-name').textContent).toBe('C. V. Raman')

    // Trigger field filter
    searchInput.value = ''
    fieldSelect.value = 'Mathematics'
    fieldSelect.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 0))

    expect(document.querySelectorAll('#figureGrid .figure-card').length).toBe(1)
    expect(document.querySelector('#figureGrid .figure-name').textContent).toBe('Aryabhata')

    // Trigger enduring filter resulting in empty state
    const enduringCheckbox = document.getElementById('figureEnduring')
    enduringCheckbox.checked = true
    enduringCheckbox.dispatchEvent(new Event('change'))
    await new Promise((r) => setTimeout(r, 0))

    expect(document.querySelectorAll('#figureGrid .figure-card').length).toBe(0)
    expect(document.querySelector('#figureGrid .figure-empty')).toBeTruthy()
  })
})
