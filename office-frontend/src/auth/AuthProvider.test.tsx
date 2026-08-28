// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import type { AuthState, SignInResult } from './authContext'
import { useAuth } from './useAuth'
import { RequireAuth } from './RequireAuth'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/**
 * A fetch whose answers the test hands out one by one, on the fetch level so the real
 * client in `lib/api.ts` runs. An abort rejects immediately, the way fetch does; everything
 * else stays pending until {@link answerNextRequest} — that gap in time is the point,
 * because the bug only shows when the aborted request settles in a render of its own.
 */
const pendingRequests: ((response: Response) => void)[] = []

function stubFetch() {
  pendingRequests.length = 0
  vi.stubGlobal(
    'fetch',
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          // An aborted request has no answer coming; it must not swallow the next one.
          pendingRequests.splice(pendingRequests.indexOf(resolve), 1)
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
        pendingRequests.push(resolve)
      }),
  )
}

async function answerNextRequest(status: number, body: unknown) {
  await act(async () => {
    pendingRequests.shift()?.(new Response(JSON.stringify(body), { status }))
  })
}

/** The routes a reloaded deep link travels through, with markers instead of real screens. */
function appOn(path: string) {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/anmelden" element={<div>Anmeldemaske</div>} />
            <Route
              path="/offerten"
              element={
                <RequireAuth>
                  <div>Offertenliste</div>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  )
}

/** The session the probe below reads, with the modules of its one tenant. */
function signedIn(modules: string[]) {
  return {
    userId: 1,
    username: 'admin',
    activeTenantId: 1,
    superuser: false,
    tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules }],
    permissions: [],
  }
}

/** The session as the last render saw it, so a test can call into it. */
let state: AuthState | null = null

/**
 * A tree that shows the module list of the session and hands the state out.
 *
 * <p>Not under StrictMode: the double mount of the two tests above is what they are about,
 * and here it would only make the request bookkeeping harder to read.
 */
function sessionProbe() {
  function Probe() {
    state = useAuth()
    const active = state.user?.tenants.find((tenant) => tenant.id === state?.user?.activeTenantId)
    return <div>Module: {active?.modules.join(', ') || '—'}</div>
  }
  return (
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('AuthProvider', () => {
  it('authProviderKeepsDeepLinkOnStrictModeRemountTest', async () => {
    // The bug this pins down: StrictMode aborts the first mount's session request, and the
    // abort ended the loading state while no user was known yet. That moment rendered the
    // login redirect, which threw every reloaded deep link onto the dashboard.
    stubFetch()

    // Mounting twice under StrictMode aborts the first request; its rejection settles here,
    // before the second request has answered — the moment the bug used to redirect in.
    act(() => root.render(appOn('/offerten')))
    await act(async () => {})

    await answerNextRequest(200, {
      userId: 1,
      username: 'admin',
      activeTenantId: 1,
      superuser: false,
      tenants: [],
      permissions: [],
    })

    expect(container.textContent).toContain('Offertenliste')
  })

  it('authProviderWithoutSessionShowsLoginTest', async () => {
    stubFetch()

    act(() => root.render(appOn('/offerten')))
    await act(async () => {})
    await answerNextRequest(401, null)

    expect(container.textContent).toContain('Anmeldemaske')
  })

  /**
   * What the module screen calls after switching a module: the session is read again, so
   * sidebar and overview see the new module list without a page reload (ADR-0018).
   */
  it('refreshTest', async () => {
    stubFetch()
    act(() => root.render(sessionProbe()))
    await act(async () => {})
    await answerNextRequest(200, signedIn(['INVENTORY']))
    expect(container.textContent).toContain('Module: INVENTORY')

    await act(async () => {
      void state?.refresh()
    })
    await answerNextRequest(200, signedIn([]))

    expect(container.textContent).toContain('Module: —')
  })

  // --- the second factor ----------------------------------------------------

  /** Puts the probe on screen with nobody signed in, ready for a `signIn` call. */
  async function signedOutProbe() {
    stubFetch()
    act(() => root.render(sessionProbe()))
    await act(async () => {})
    await answerNextRequest(401, null)
  }

  /**
   * The third exit. Without it the login screen could not tell «wrong password» from «not
   * finished», which is the whole reason the backend answers 200 here rather than 401.
   */
  it('signInReportsThatASecondFactorIsOwedTest', async () => {
    await signedOutProbe()

    let result: SignInResult | undefined
    await act(async () => {
      void state?.signIn('anna', 'geheim').then((answer) => {
        result = answer
      })
    })
    await answerNextRequest(200, {
      secondFactorRequired: true,
      method: 'TOTP',
      methods: ['TOTP', 'EMAIL'],
    })

    expect(result?.kind).toBe('secondFactor')
    expect(result).toMatchObject({ method: 'TOTP', methods: ['TOTP', 'EMAIL'] })
  })

  /**
   * The property the whole feature stands on, seen from the browser: between the two steps
   * the session is not a session. A screen behind the login must not draw itself.
   */
  it('signInDoesNotSignInWhileASecondFactorIsOwedTest', async () => {
    await signedOutProbe()

    await act(async () => {
      void state?.signIn('anna', 'geheim')
    })
    await answerNextRequest(200, {
      secondFactorRequired: true,
      method: 'TOTP',
      methods: ['TOTP'],
    })

    expect(state?.user).toBeNull()
  })

  it('completeSecondFactorSignsInTest', async () => {
    await signedOutProbe()
    await act(async () => {
      void state?.signIn('anna', 'geheim')
    })
    await answerNextRequest(200, {
      secondFactorRequired: true,
      method: 'TOTP',
      methods: ['TOTP'],
    })

    await act(async () => {
      void state?.completeSecondFactor('123456')
    })
    await answerNextRequest(200, signedIn(['INVENTORY']))

    expect(state?.user?.username).toBe('admin')
    expect(container.textContent).toContain('Module: INVENTORY')
  })

  /** A user without a factor keeps the one step the login always had. */
  it('signInWithoutASecondFactorTest', async () => {
    await signedOutProbe()

    let result: SignInResult | undefined
    await act(async () => {
      void state?.signIn('admin', 'geheim').then((answer) => {
        result = answer
      })
    })
    await answerNextRequest(200, signedIn([]))

    expect(result?.kind).toBe('signedIn')
    expect(state?.user?.username).toBe('admin')
  })

  /** Nobody is signed in: asking anyway would answer 401 and look like a session ending. */
  it('refreshWithoutSessionTest', async () => {
    stubFetch()
    act(() => root.render(sessionProbe()))
    await act(async () => {})
    await answerNextRequest(401, null)
    expect(pendingRequests).toHaveLength(0)

    await act(async () => {
      void state?.refresh()
    })

    expect(pendingRequests).toHaveLength(0)
  })
})
