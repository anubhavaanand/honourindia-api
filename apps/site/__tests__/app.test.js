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

    // switching themes re-renders the preview (calls mount again)
    document.getElementById('optTheme').value = 'light'
    document.getElementById('optTheme').dispatchEvent(new Event('change'))
    expect(mountMock).toHaveBeenCalledTimes(2)
  })
})
