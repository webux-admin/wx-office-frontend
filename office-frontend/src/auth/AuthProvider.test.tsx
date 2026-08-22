// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
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
})
