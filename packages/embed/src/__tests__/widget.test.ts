import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Load the widget so window.HonourIndia is defined
import '../index.ts'

const billboards = [
  {
    slug: 'cv-raman',
    name: 'C. V. Raman',
    years: '1888–1970',
    field: 'Physics',
    tagline: 'Discovered the Raman effect.',
    quote: null,
    image: null,
    link: 'https://en.wikipedia.org/wiki/C._V._Raman',
  },
  {
    slug: 'srinivasa-ramanujan',
    name: 'Srinivasa Ramanujan',
    years: '1887–1920',
    field: 'Mathematics',
    tagline: 'Number-theory genius.',
    quote: null,
    image: null,
    link: 'https://en.wikipedia.org/wiki/Srinivasa_Ramanujan',
  },
]

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
}

describe('widget (packages/embed)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    fetchMock = vi.fn()
    // @ts-expect-error test harness mock
    globalThis.fetch = fetchMock
    // jsdom lacks matchMedia; the widget constructor calls it
    // @ts-expect-error test harness mock
    window.matchMedia = vi.fn(() => ({ matches: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('mounts a shadow root, shows loading while fetching, then fills a billboard layer', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size: 'rectangle',
      theme: 'dark',
    })

    expect(handle).toBeDefined()
    expect(host.shadowRoot).toBeDefined()
    const root = host.shadowRoot!.querySelector('.hi')!
    expect(root).toBeTruthy()
    expect(root.classList.contains('hi--rectangle')).toBe(true)
    expect(root.classList.contains('hi--dark')).toBe(true)

    // loading shown initially
    const loading = host.shadowRoot!.querySelector('.hi-loading')!
    expect(loading).toBeTruthy()
    expect(loading.classList.contains('hi-loading-hidden')).toBe(false)

    // let the async fetch + show cycle flush
    await new Promise((r) => setTimeout(r, 0))

    // loading hidden after fetch
    expect(loading.classList.contains('hi-loading-hidden')).toBe(true)

    // a layer is filled with billboard content (order is shuffled, so check membership)
    const active = host.shadowRoot!.querySelector('.hi-layer.is-active')!
    const name = active.querySelector('.hi-name')!.textContent
    expect(['C. V. Raman', 'Srinivasa Ramanujan']).toContain(name)
    expect(active.querySelector('.hi-tag')!.textContent).toBeTruthy()

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost/api/v1/billboards/random?count=14')
    handle.destroy()
  })

  it('shows the error box on fetch failure and retries internally with backoff', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(Promise.reject(new Error('down')))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })

    // flush the microtask from the rejected fetch so the catch renders the error box
    await new Promise((r) => queueMicrotask(r))

    const errorBox = host.shadowRoot!.querySelector('.hi-error')!
    expect(errorBox).toBeTruthy()
    expect(errorBox.style.display).toBe('flex')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // the internal loop retries after the 5s backoff
    vi.advanceTimersByTime(6000)
    // the resolved setTimeout schedules the fetch retry as a microtask
    await new Promise((r) => queueMicrotask(r))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
    vi.clearAllTimers()
  })
})
