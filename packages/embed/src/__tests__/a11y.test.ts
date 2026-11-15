import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axe from 'axe-core'
import { mount, mountAll } from '../index'

type MountOptions = NonNullable<Parameters<typeof mount>[1]>

const billboards = [
  {
    slug: 'cv-raman',
    name: 'C. V. Raman',
    years: '1888–1970',
    field: 'Physics',
    tagline: 'Discovered the Raman effect.',
    quote: null,
    image: { url: '/images/portraits/cv-raman.jpg', credit: 'Someone', license: 'CC BY-SA 4.0' },
    link: 'https://en.wikipedia.org/wiki/C._V._Raman',
  },
]

// jsdom has no layout engine, so the contrast rules cannot run here.
const A11Y_OPTIONS = { rules: { 'color-contrast': { enabled: false } } }

describe('widget accessibility (issue #69)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ billboards }) }),
    )
    globalThis.fetch = fetchMock as any
    // @ts-expect-error jsdom has no matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function violationsFor(
    size: MountOptions['size'],
    theme: MountOptions['theme'],
  ): Promise<string[]> {
    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, {
      api: 'http://localhost/api/v1',
      size,
      theme,
      preloadTimeout: 10,
    })

    await vi.waitFor(() => {
      const name = host.shadowRoot!.querySelector('.hi-layer.is-active .hi-name')
      expect(name).not.toBeNull()
      expect(name!.textContent).toBe('C. V. Raman')
    })

    const results = await axe.run(host, A11Y_OPTIONS)
    handle.destroy()
    return results.violations.map((v) => `${v.id}: ${v.help}`)
  }

  it.each(['rectangle', 'leaderboard', 'poster'] as const)(
    'passes in the %s size',
    async (size) => {
      expect(await violationsFor(size, 'dark')).toEqual([])
    },
  )

  it('passes in the light theme', async () => {
    expect(await violationsFor('rectangle', 'light')).toEqual([])
  })

  it('passes while the API is unreachable (error box shown)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const host = document.createElement('div')
    document.body.appendChild(host)

    // @ts-expect-error global set by the widget bundle
    const handle = window.HonourIndia.mount(host, { api: 'http://localhost/api/v1' })
    await vi.waitFor(() => {
      expect((host.shadowRoot!.querySelector('.hi-error') as HTMLElement).style.display).toBe(
        'flex',
      )
    })

    const results = await axe.run(host, A11Y_OPTIONS)
    handle.destroy()
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  it('mounts through the data attribute path without violations', async () => {
    document.body.innerHTML = '<div data-honourindia data-preload-timeout="10"></div>'
    mountAll()
    const host = document.querySelector('[data-honourindia]')!

    await vi.waitFor(() => {
      const name = host.shadowRoot!.querySelector('.hi-layer.is-active .hi-name')
      expect(name).not.toBeNull()
      expect(name!.textContent).toBe('C. V. Raman')
    })

    const results = await axe.run(host, A11Y_OPTIONS)
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
