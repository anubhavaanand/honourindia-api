import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Load the widget so window.HonourIndia is defined
import { parseRetryAfter, MAX_FETCH_RETRIES } from '../index'

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

    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost/api/v1/billboards/random?count=14')
    handle.destroy()
  })

  it('mounts the poster size with the poster-specific layer markup', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size: 'poster',
      theme: 'light',
    })

    const root = host.shadowRoot!.querySelector('.hi')!
    expect(root.classList.contains('hi--poster')).toBe(true)
    expect(root.classList.contains('hi--light')).toBe(true)

    const layer = root.querySelector('.hi-layer')!
    expect(layer.querySelector('.hi-nameplate-sub')).toBeTruthy()
    expect(layer.querySelector('.hi-panel')).toBeNull()

    await new Promise((r) => setTimeout(r, 0))

    const active = host.shadowRoot!.querySelector('.hi-layer.is-active')!
    expect(active.querySelector('.hi-name')!.textContent).toBeTruthy()
    expect(active.querySelector('.hi-nameplate-sub')).toBeTruthy()

    handle.destroy()
  })

  it('mounts the leaderboard size with the split image/text layout', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size: 'leaderboard',
    })

    const root = host.shadowRoot!.querySelector('.hi')!
    expect(root.classList.contains('hi--leaderboard')).toBe(true)

    const layer = root.querySelector('.hi-layer')!
    expect(layer.querySelector('.hi-body')).toBeTruthy()
    expect(layer.querySelector('.hi-media')).toBeTruthy()
    expect(layer.querySelector('.hi-panel')).toBeTruthy()
    expect(layer.querySelector('.hi-scrim')).toBeNull()

    await new Promise((r) => setTimeout(r, 0))

    const active = host.shadowRoot!.querySelector('.hi-layer.is-active')!
    expect(active.querySelector('.hi-name')!.textContent).toBeTruthy()

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
    await new Promise<void>((r) => queueMicrotask(() => r()))

    const errorBox = host.shadowRoot!.querySelector('.hi-error')!
    expect(errorBox).toBeTruthy()
    expect((errorBox as HTMLElement).style.display).toBe('flex')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // the internal loop retries after the 5s backoff
    vi.advanceTimersByTime(6000)
    // the resolved setTimeout schedules the fetch retry as a microtask
    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
    vi.clearAllTimers()
  })

  describe('parseRetryAfter', () => {
    it('parses numeric seconds into milliseconds', () => {
      expect(parseRetryAfter('30')).toBe(30000)
      expect(parseRetryAfter('1')).toBe(1000)
    })

    it('falls back to 60s for invalid or missing values', () => {
      expect(parseRetryAfter(null)).toBe(60000)
      expect(parseRetryAfter(undefined)).toBe(60000)
      expect(parseRetryAfter('invalid')).toBe(60000)
      expect(parseRetryAfter('-5')).toBe(60000)
    })
  })

  it('handles 429 rate limit responses with Retry-After header', async () => {
    vi.useFakeTimers()
    const rateLimitedResponse = {
      ok: false,
      status: 429,
      headers: {
        get: (header: string) => (header.toLowerCase() === 'retry-after' ? '12' : null),
      },
    }

    const fiveBillboards = [
      ...billboards,
      { ...billboards[0]!, slug: 'b3' },
      { ...billboards[0]!, slug: 'b4' },
      { ...billboards[0]!, slug: 'b5' },
    ]

    fetchMock
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(jsonResponse({ billboards: fiveBillboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })

    await new Promise<void>((r) => queueMicrotask(() => r()))

    const errorBox = host.shadowRoot!.querySelector('.hi-error')!
    expect(errorBox).toBeTruthy()
    expect((errorBox as HTMLElement).style.display).toBe('flex')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Advancing 10s should not trigger retry since Retry-After is 12s
    await vi.advanceTimersByTimeAsync(10000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Advancing past 12s triggers retry
    await vi.advanceTimersByTimeAsync(2500)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Second request succeeded; error box hidden
    expect((errorBox as HTMLElement).style.display).toBe('none')

    handle.destroy()
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('stops retrying after MAX_FETCH_RETRIES failures and shows persistent error state (issue #2)', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(Promise.reject(new Error('connection refused')))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })

    const errorBox = host.shadowRoot!.querySelector('.hi-error')!
    const sub = errorBox.querySelector('.hi-error-sub')!

    // Initial attempt
    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sub.textContent).toContain('Retrying…')

    // Retry 1: wait 5s
    await vi.advanceTimersByTimeAsync(6000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sub.textContent).toContain('Retrying…')

    // Retry 2: wait 15s
    await vi.advanceTimersByTimeAsync(16000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sub.textContent).toContain('Retrying…')

    // Retry 3: wait 45s
    await vi.advanceTimersByTimeAsync(46000)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(sub.textContent).toContain('Retrying…')

    // Retry 4: wait 90s (MAX_FETCH_RETRIES reached)
    await vi.advanceTimersByTimeAsync(91000)
    expect(fetchMock).toHaveBeenCalledTimes(MAX_FETCH_RETRIES)
    expect(sub.textContent).toContain('Maximum retries exceeded')

    // Further time passing does NOT trigger any more retries
    await vi.advanceTimersByTimeAsync(300000)
    expect(fetchMock).toHaveBeenCalledTimes(MAX_FETCH_RETRIES)

    // Clicking "Try again" resets error sub and triggers a new fetch attempt
    fetchMock.mockReturnValueOnce(jsonResponse({ billboards }))
    const retryBtn = errorBox.querySelector('.hi-retry') as HTMLButtonElement
    retryBtn.click()

    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(fetchMock).toHaveBeenCalledTimes(MAX_FETCH_RETRIES + 1)
    expect((errorBox as HTMLElement).style.display).toBe('none')

    handle.destroy()
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  it('shows error box on subsequent batch fetch failures when index >= 0 (issue #4)', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValueOnce(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })

    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const errorBox = host.shadowRoot!.querySelector('.hi-error') as HTMLElement
    const card = host.shadowRoot!.querySelector('.hi-card') as HTMLElement
    expect(errorBox.style.display).toBe('none')
    expect(card.style.visibility).toBe('visible')

    // Next fetch (subsequent batch) fails
    fetchMock.mockReturnValue(Promise.reject(new Error('subsequent failure')))

    // Advance timer or trigger step near end of queue: with 2 billboards, index=0 is length-2 <= 3
    // In fact show() was called for index 0, queue has 2 items. length - index = 2 <= 3 triggers fetchBatch!
    // But fetchBatch was already running for initial fetch; let's trigger next step so show() checks again:
    const nextBtn = host.shadowRoot!.querySelector('.hi-next') as HTMLButtonElement
    nextBtn.click()
    await new Promise<void>((r) => queueMicrotask(() => r()))

    // The subsequent batch fetch failed, so errorBox must be shown and card hidden
    expect(errorBox.style.display).toBe('flex')
    expect(card.style.visibility).toBe('hidden')

    // Now let retry succeed
    fetchMock.mockReturnValueOnce(jsonResponse({ billboards }))
    await vi.advanceTimersByTimeAsync(6000)
    await new Promise<void>((r) => queueMicrotask(() => r()))

    expect(errorBox.style.display).toBe('none')
    expect(card.style.visibility).toBe('visible')

    handle.destroy()
    vi.useRealTimers()
    vi.clearAllTimers()
  })
})
