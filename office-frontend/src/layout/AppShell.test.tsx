// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { AppShell } from './AppShell'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
    permissions: ['PARTNER_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'PARTNER_READ',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // The counters at the menu entries ask the backend; an empty answer is enough here.
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/** jsdom has no `matchMedia`; every test says which width it stands at. */
function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

/** A session that tracks time: the module runs and the user holds `TIME_TRACK`. */
const TRACKING: AuthState = {
  ...SESSION,
  user: SESSION.user && {
    ...SESSION.user,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['TIMETRACKING'] }],
    permissions: ['TIME_TRACK'],
  },
  can: (permission: string) => permission === 'TIME_TRACK',
}

/** No stopwatch runs: the backend answers 204. */
function stubNoStopwatch() {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      url.endsWith('/time-entries/mine/timer')
        ? new Response(null, { status: 204 })
        : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
}

/** The stopwatch button, found by what it says or what it is called. */
function stopwatchButtons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (entry) =>
      entry.textContent?.trim() === 'Zeit starten' ||
      entry.getAttribute('aria-label') === 'Zeit starten',
  )
}

async function render(session: AuthState = SESSION) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={session}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<p>Inhalt</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
}

const sidebar = () => container.querySelector('aside')

function menuButton(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === 'Navigation',
  )
}

describe('AppShell', () => {
  it('appShellHidesTheSidebarOnANarrowScreenTest', async () => {
    stubViewport(false)
    await render()

    expect(sidebar()).toBeNull()
    expect(menuButton()).toBeDefined()
    expect(container.textContent).toContain('Inhalt')
  })

  it('appShellOpensTheDrawerFromTheMenuTest', async () => {
    stubViewport(false)
    await render()

    await act(async () => {
      menuButton()?.click()
    })

    expect(sidebar()).not.toBeNull()
    expect(menuButton()?.getAttribute('aria-expanded')).toBe('true')
  })

  it('appShellClosesTheDrawerWithEscapeTest', async () => {
    stubViewport(false)
    await render()
    await act(async () => {
      menuButton()?.click()
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(sidebar()).toBeNull()
  })

  it('appShellClosesTheDrawerOnTheBackdropTest', async () => {
    stubViewport(false)
    await render()
    await act(async () => {
      menuButton()?.click()
    })

    const backdrop = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Navigation schliessen"]',
    )
    await act(async () => {
      backdrop?.click()
    })

    expect(sidebar()).toBeNull()
  })

  it('appShellClosesTheDrawerWithItsOwnButtonTest', async () => {
    stubViewport(false)
    await render()
    await act(async () => {
      menuButton()?.click()
    })

    const close = container.querySelector<HTMLButtonElement>(
      'aside button[aria-label="Navigation einklappen"]',
    )
    await act(async () => {
      close?.click()
    })

    expect(close).not.toBeNull()
    expect(sidebar()).toBeNull()
  })

  it('appShellKeepsTheSidebarOnAWideScreenTest', async () => {
    stubViewport(true)
    await render()

    expect(sidebar()).not.toBeNull()
    expect(menuButton()).toBeUndefined()
  })

  /** The stopwatch stands in the head of the sidebar, on every page. */
  it('appShellShowsTheStopwatchInTheSidebarTest', async () => {
    stubViewport(true)
    stubNoStopwatch()

    await render(TRACKING)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const [stopwatch] = stopwatchButtons()
    expect(stopwatch?.closest('aside')).not.toBeNull()
    expect(stopwatchButtons()).toHaveLength(1)
  })

  /** On a phone it stands in the bar beside the menu, and the drawer does not repeat it. */
  it('appShellShowsTheStopwatchInTheBarOfAPhoneTest', async () => {
    stubViewport(false)
    stubNoStopwatch()
    await render(TRACKING)

    await act(async () => {
      menuButton()?.click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const [stopwatch] = stopwatchButtons()
    expect(stopwatch?.closest('aside')).toBeNull()
    expect(stopwatch?.parentElement).toBe(menuButton()?.parentElement)
    expect(stopwatchButtons()).toHaveLength(1)
  })

  /** Without the right or the module there is no stopwatch, and nothing is asked. */
  it('appShellWithoutTheStopwatchTest', async () => {
    stubViewport(true)
    const requests: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      requests.push(url)
      return Promise.resolve(new Response('{}', { status: 200 }))
    })

    await render()

    expect(stopwatchButtons()).toHaveLength(0)
    expect(requests.some((url) => url.includes('/timer'))).toBe(false)
  })
})
