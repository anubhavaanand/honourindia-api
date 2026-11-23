import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'

type Size = 'rectangle' | 'leaderboard' | 'poster'
type Theme = 'dark' | 'light'

type Billboard = {
  slug: string
  name: string
  years: string | null
  field: string
  tagline: string
  quote: { text: string; source?: string } | null
  image: { url: string; credit?: string; license?: string } | null
  link: string
}

const PORTRAIT: Billboard = {
  slug: 'cv-raman',
  name: 'C. V. Raman',
  years: '1888–1970',
  field: 'Physics',
  tagline: 'Discovered how light shifts colour as it scatters.',
  quote: {
    text: 'The true wealth of a nation is its intellectual strength.',
    source: 'attributed',
  },
  image: {
    url: '/images/cv-raman.jpg',
    credit: 'A. Photographer',
    license: 'CC BY-SA 4.0',
  },
  link: 'https://en.wikipedia.org/wiki/C._V._Raman',
}

const MONOGRAM: Billboard = {
  slug: 'monogram-person',
  name: 'Monogram Person',
  years: '1900–1980',
  field: 'Mathematics',
  tagline: 'No freely licensed portrait is available.',
  quote: null,
  image: null,
  link: 'https://en.wikipedia.org/wiki/Monogram_Person',
}

const SIZES = ['rectangle', 'leaderboard', 'poster'] as const
const THEMES = ['dark', 'light'] as const

const handles: Array<{ destroy(): void }> = []

function jsonResponse(billboards: Billboard[]) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ billboards }),
  }
}

async function mountWidget({
  size,
  theme,
  billboard,
  fetchImpl,
}: {
  size: Size
  theme: Theme
  billboard: Billboard
  fetchImpl?: () => Promise<unknown>
}) {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const fetchMock =
    fetchImpl ?? vi.fn(() => Promise.resolve(jsonResponse([billboard])) as Promise<unknown>)
  vi.stubGlobal('fetch', fetchMock)

  const handle = mount(host, {
    api: 'http://localhost/api/v1',
    size,
    theme,
    lazyLoad: true,
  })
  handles.push(handle)

  return { host, handle, fetchMock }
}

async function waitForActiveLayer(host: HTMLElement) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const layer = host.shadowRoot?.querySelector('.hi-layer.is-active')
    if (layer) return layer
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('billboard did not render')
}

function widgetSnapshot(host: HTMLElement) {
  const root = host.shadowRoot?.querySelector('.hi')
  if (!root) throw new Error('widget root not found')
  return root.outerHTML
}

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  // Keep the widget deterministic: no rotation and no viewport-triggered work.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  )
  vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver)
})

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('widget visual regression (issue #70)', () => {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      it(`renders the ${size} billboard in ${theme} mode`, async () => {
        const { host } = await mountWidget({ size, theme, billboard: PORTRAIT })
        const layer = await waitForActiveLayer(host)

        const root = host.shadowRoot!.querySelector('.hi')!
        expect(root.classList.contains(`hi--${size}`)).toBe(true)
        expect(root.classList.contains(`hi--${theme}`)).toBe(true)
        expect(layer.textContent).toContain('C. V. Raman')
        expect(layer.textContent).toContain('Physics')
        expect(layer.querySelector('.hi-media img')?.getAttribute('src')).toBe(
          'http://localhost/images/cv-raman.jpg',
        )

        expect(widgetSnapshot(host)).toMatchSnapshot()
      })
    }
  }

  for (const [size, theme] of [
    ['rectangle', 'dark'],
    ['poster', 'light'],
  ] as const) {
    it(`renders an initials monogram for the ${size} billboard in ${theme} mode`, async () => {
      const { host } = await mountWidget({ size, theme, billboard: MONOGRAM })
      const active = await waitForActiveLayer(host)

      const monogram = active.querySelector('.hi-noimg')
      expect(monogram).toBeTruthy()
      expect(monogram!.textContent).toBe('MP')
      expect(active.querySelector('.hi-media img')).toBeNull()
      // No portrait means no photo to credit (#216): the attribution is empty.
      expect(active.querySelector('.hi-attr')?.textContent).toBe('')

      expect(widgetSnapshot(host)).toMatchSnapshot()
    })
  }

  it('renders the loading state before the first billboard arrives', async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const { host } = await mountWidget({
      size: 'rectangle',
      theme: 'dark',
      billboard: PORTRAIT,
      fetchImpl: fetchMock as () => Promise<unknown>,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const loading = host.shadowRoot!.querySelector('.hi-loading')!
    expect(loading.classList.contains('hi-loading-hidden')).toBe(false)
    expect(host.shadowRoot!.querySelector('.hi-layer.is-active')).toBeNull()
    expect(widgetSnapshot(host)).toMatchSnapshot()

    resolveFetch(jsonResponse([PORTRAIT]))
    await waitForActiveLayer(host)
    expect(
      host.shadowRoot!.querySelector('.hi-loading')!.classList.contains('hi-loading-hidden'),
    ).toBe(true)
  })

  it('keeps the documented size, theme, and reduced-motion rules in the shadow stylesheet', async () => {
    const { host } = await mountWidget({
      size: 'rectangle',
      theme: 'dark',
      billboard: PORTRAIT,
    })
    await waitForActiveLayer(host)

    const css = host.shadowRoot!.querySelector('style')!.textContent ?? ''
    const expectedRules = [
      '.hi--rectangle { max-width: 300px; aspect-ratio: 300 / 250; }',
      '.hi--poster { max-width: 480px; aspect-ratio: 1 / 1; }',
      '.hi--leaderboard { max-width: 728px; aspect-ratio: auto; height: 96px; }',
      '.hi--dark { background: #0a0a0c; color: #f2efe9; }',
      '.hi--light { background: #faf7f0; color: #1a1d21; }',
      '.hi--poster .hi-panel { display: none; }',
      '.hi--leaderboard .hi-media { right: auto; width: 96px; }',
      '@media (prefers-reduced-motion: reduce)',
      '.hi-layer { transition: none; }',
    ]

    for (const rule of expectedRules) expect(css).toContain(rule)
  })
})
