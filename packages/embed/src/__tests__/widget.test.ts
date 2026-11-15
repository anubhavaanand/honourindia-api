import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Load the widget so window.HonourIndia is defined
import { parseRetryAfter, MAX_FETCH_RETRIES, MAX_IMAGE_RETRIES, preload, DEFAULT_PRELOAD_TIMEOUT, mountAll, setupObserver } from '../index'

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

  it('sends the API key in the Authorization header, never in the query string (issue #44)', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      key: 'hi_secret_key',
    })

    await new Promise((r) => setTimeout(r, 0))

    const url = fetchMock.mock.calls[0]![0]
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(url).toBe('http://localhost/api/v1/billboards/random?count=14')
    expect(String(url)).not.toContain('hi_secret_key')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer hi_secret_key')
    handle.destroy()
  })

  it('sends the updated API key in the Authorization header (issue #44)', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      key: 'hi_first_key',
    })

    await new Promise((r) => setTimeout(r, 0))

    handle.update({ key: 'hi_second_key' })
    await new Promise((r) => setTimeout(r, 0))

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!
    const init = lastCall[1] as RequestInit
    expect(String(lastCall[0])).not.toContain('hi_second_key')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer hi_second_key')
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

  it('retries image load on error before falling back to monogram (issue #6)', async () => {
    vi.useFakeTimers()
    const figureWithImage = [
      {
        slug: 'cv-raman',
        name: 'C. V. Raman',
        years: '1888–1970',
        field: 'Physics',
        tagline: 'Discovered Raman effect.',
        quote: null,
        image: { url: '/images/portraits/cv-raman.webp' },
        link: 'https://en.wikipedia.org/wiki/C._V._Raman',
      },
    ]

    fetchMock.mockReturnValue(jsonResponse({ billboards: figureWithImage }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1', preloadTimeout: 500 })

    // Let fetch resolve, then advance preload timer (500ms)
    await new Promise<void>((r) => queueMicrotask(() => r()))
    await vi.advanceTimersByTimeAsync(600)

    const active = host.shadowRoot!.querySelector('.hi-layer.is-active')!
    const media = active.querySelector('.hi-media')!
    let img = media.querySelector('img') as HTMLImageElement
    expect(img).toBeTruthy()
    const originalSrc = img.src

    // 1st error: should not immediately show monogram, schedules retry
    img.dispatchEvent(new Event('error'))
    expect(media.querySelector('.hi-noimg')).toBeNull()
    expect(media.querySelector('img')).toBeTruthy()

    // Advance timer past first retry delay (300ms)
    await vi.advanceTimersByTimeAsync(350)
    expect(img.src).toContain('retry=1')

    // 2nd error: schedules second retry
    img.dispatchEvent(new Event('error'))
    expect(media.querySelector('.hi-noimg')).toBeNull()
    await vi.advanceTimersByTimeAsync(650)
    expect(img.src).toContain('retry=2')

    // 3rd error (exceeded MAX_IMAGE_RETRIES): falls back to monogram
    img.dispatchEvent(new Event('error'))
    expect(media.querySelector('img')).toBeNull()
    const fallback = media.querySelector('.hi-noimg')!
    expect(fallback).toBeTruthy()
    expect(fallback.textContent).toBe('CV')

    handle.destroy()
    vi.useRealTimers()
    vi.clearAllTimers()
  })

  describe('preload (issue #7)', () => {
    it('resolves immediately when billboard has no image', async () => {
      const b = { ...billboards[0]!, image: null }
      await expect(preload(b, 'http://localhost')).resolves.toBeUndefined()
    })

    it('resolves on timeout when image takes too long, respecting custom timeoutMs', async () => {
      vi.useFakeTimers()
      const b = {
        ...billboards[0]!,
        image: { url: '/images/portraits/test.webp' },
      }

      let resolved = false
      const p = preload(b, 'http://localhost', 3000).then(() => {
        resolved = true
      })

      await vi.advanceTimersByTimeAsync(2000)
      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(1100)
      expect(resolved).toBe(true)
      await p

      vi.useRealTimers()
      vi.clearAllTimers()
    })

    it('uses DEFAULT_PRELOAD_TIMEOUT of 8000ms by default', () => {
      expect(DEFAULT_PRELOAD_TIMEOUT).toBe(8000)
    })
  })

  it('updates options dynamically after mount via handle.update() (issue #8)', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size: 'rectangle',
      theme: 'dark',
      interval: 10,
    })

    await new Promise<void>((r) => queueMicrotask(() => r()))

    const root = host.shadowRoot!.querySelector('.hi')!
    expect(root.classList.contains('hi--dark')).toBe(true)
    expect(root.classList.contains('hi--rectangle')).toBe(true)

    // Update theme
    handle.update({ theme: 'light' })
    expect(root.classList.contains('hi--light')).toBe(true)
    expect(root.classList.contains('hi--dark')).toBe(false)

    // Update size to poster
    handle.update({ size: 'poster' })
    const updatedRoot = host.shadowRoot!.querySelector('.hi')!
    expect(updatedRoot.classList.contains('hi--poster')).toBe(true)
    expect(updatedRoot.querySelector('.hi-nameplate-sub')).toBeTruthy()

    // Update api triggers a re-fetch
    const initialCalls = fetchMock.mock.calls.length
    handle.update({ api: 'http://localhost/api/v2' })
    await new Promise<void>((r) => queueMicrotask(() => r()))
    expect(fetchMock).toHaveBeenCalledTimes(initialCalls + 1)
    expect(fetchMock.mock.calls[initialCalls]![0]).toContain('http://localhost/api/v2/billboards/random')

    handle.destroy()
  })

  describe('mountAll and MutationObserver (issue #9)', () => {
    it('mountAll finds and mounts all unmounted [data-honourindia] elements', async () => {
      fetchMock.mockReturnValue(jsonResponse({ billboards }))

      const div1 = document.createElement('div')
      div1.setAttribute('data-honourindia', '')
      div1.setAttribute('data-theme', 'light')
      const div2 = document.createElement('div')
      div2.setAttribute('data-honourindia', '')
      document.body.append(div1, div2)

      const handles = mountAll()
      expect(handles).toHaveLength(2)
      expect(div1.getAttribute('data-honourindia-mounted')).toBe('1')
      expect(div2.getAttribute('data-honourindia-mounted')).toBe('1')
      expect(div1.shadowRoot).toBeTruthy()
      expect(div2.shadowRoot).toBeTruthy()

      // Calling mountAll again ignores already mounted elements
      const emptyHandles = mountAll()
      expect(emptyHandles).toHaveLength(0)

      handles.forEach((h) => h.destroy())
    })

    it('MutationObserver mounts dynamically added [data-honourindia] elements', async () => {
      fetchMock.mockReturnValue(jsonResponse({ billboards }))

      const observer = setupObserver()
      expect(observer).toBeTruthy()

      const dynamicEl = document.createElement('div')
      dynamicEl.setAttribute('data-honourindia', '')
      dynamicEl.setAttribute('data-theme', 'dark')

      const container = document.createElement('section')
      const nestedEl = document.createElement('div')
      nestedEl.setAttribute('data-honourindia', '')
      container.appendChild(nestedEl)

      document.body.append(dynamicEl, container)

      // Wait for MutationObserver callback
      await new Promise<void>((r) => setTimeout(r, 10))

      expect(dynamicEl.getAttribute('data-honourindia-mounted')).toBe('1')
      expect(dynamicEl.shadowRoot).toBeTruthy()
      expect(nestedEl.getAttribute('data-honourindia-mounted')).toBe('1')
      expect(nestedEl.shadowRoot).toBeTruthy()

      observer?.disconnect()
    })
  })

  it('provides ARIA live region that announces figure changes (issue #10)', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })

    const liveRegion = host.shadowRoot!.querySelector('.hi-sr-only[aria-live="polite"]')!
    expect(liveRegion).toBeTruthy()
    expect(liveRegion.getAttribute('aria-atomic')).toBe('true')

    // Let the fetch + show cycle flush
    await new Promise((r) => setTimeout(r, 0))

    // Should announce the active figure
    expect(liveRegion.textContent).toBeTruthy()
    const activeText = liveRegion.textContent
    expect(
      activeText === 'C. V. Raman, Physics' || activeText === 'Srinivasa Ramanujan, Mathematics'
    ).toBe(true)

    // Step to the next figure
    const nextBtn = host.shadowRoot!.querySelector('.hi-next') as HTMLButtonElement
    nextBtn.click()
    await new Promise((r) => setTimeout(r, 0))

    const updatedText = liveRegion.textContent
    expect(
      updatedText === 'C. V. Raman, Physics' || updatedText === 'Srinivasa Ramanujan, Mathematics'
    ).toBe(true)

    handle.destroy()
  })

  it('sets loading="lazy" on portrait images by default and respects lazyLoad option (issue #12)', async () => {
    const figuresWithImg = [
      {
        slug: 'cv-raman',
        name: 'C. V. Raman',
        years: '1888–1970',
        field: 'Physics',
        tagline: 'Discovered Raman effect.',
        quote: null,
        image: { url: '/images/portraits/cv-raman.webp' },
        link: 'https://en.wikipedia.org/wiki/C._V._Raman',
      },
    ]

    fetchMock.mockReturnValue(jsonResponse({ billboards: figuresWithImg }))

    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size: 'poster',
      preloadTimeout: 10,
    })

    await new Promise((r) => setTimeout(r, 20))

    const active = host.shadowRoot!.querySelector('.hi-layer.is-active')!
    const img = active.querySelector('img') as HTMLImageElement
    expect(img).toBeTruthy()
    // loading attribute should be "lazy" by default
    expect(img.loading).toBe('lazy')

    // Disabling lazyLoad sets loading to eager
    const eagerHost = document.createElement('div')
    document.body.appendChild(eagerHost)
    const handleEager = window.HonourIndia!.mount(eagerHost, {
      api: 'http://localhost/api/v1',
      lazyLoad: false,
      preloadTimeout: 10,
    })
    await new Promise((r) => setTimeout(r, 20))
    const eagerImg = eagerHost.shadowRoot!.querySelector('.hi-layer.is-active img') as HTMLImageElement
    expect(eagerImg.loading).toBe('eager')

    handle.destroy()
    handleEager.destroy()
  })

  it('supports keyboard navigation and accessible focus indicators on billboard controls', async () => {
    fetchMock.mockReturnValue(jsonResponse({ billboards }))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const handle = window.HonourIndia!.mount(host, {
      api: 'http://localhost/api/v1',
      preloadTimeout: 10,
    })

    await new Promise((r) => setTimeout(r, 20))

    const shadow = host.shadowRoot!
    const root = shadow.querySelector('.hi') as HTMLElement
    expect(root).toBeTruthy()
    expect(root.getAttribute('tabindex')).toBe('0')
    expect(root.getAttribute('role')).toBe('region')

    const prevBtn = shadow.querySelector('.hi-prev') as HTMLButtonElement
    const nextBtn = shadow.querySelector('.hi-next') as HTMLButtonElement
    expect(prevBtn).toBeTruthy()
    expect(nextBtn).toBeTruthy()
    expect(prevBtn.type).toBe('button')
    expect(nextBtn.type).toBe('button')
    expect(prevBtn.getAttribute('aria-label')).toBe('Previous figure')
    expect(nextBtn.getAttribute('aria-label')).toBe('Next figure')

    const initialName = shadow.querySelector('.hi-layer.is-active .hi-name')?.textContent

    // ArrowRight advances to next figure
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    const secondName = shadow.querySelector('.hi-layer.is-active .hi-name')?.textContent
    expect(secondName).toBeTruthy()
    expect(secondName).not.toBe(initialName)

    // ArrowLeft returns to previous figure
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    const backName = shadow.querySelector('.hi-layer.is-active .hi-name')?.textContent
    expect(backName).toBe(initialName)

    // Next button click advances
    nextBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    const thirdName = shadow.querySelector('.hi-layer.is-active .hi-name')?.textContent
    expect(thirdName).toBe(secondName)

    // Stylesheet includes focus-visible rules
    const style = shadow.querySelector('style')!.textContent
    expect(style).toContain('.hi-nav:focus-visible')
    expect(style).toContain('.hi:focus-visible')

    handle.destroy()
  })
})
