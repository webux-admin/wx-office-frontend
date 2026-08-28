// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { SecurityPolicyPage } from './SecurityPolicyPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
/** What the backend says the rules are. */
let required: boolean
/** Every writing request the screen made. */
let written: { url: string; body: unknown }[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return json({ twoFactorRequired: required })
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    written.push({ url, body })
    required = body.twoFactorRequired === true
    return json({ twoFactorRequired: required })
  })
}

function session(superuser: boolean): AuthState {
  return {
    user: {
      userId: 1,
      username: superuser ? 'root' : 'anna',
      activeTenantId: 1,
      superuser,
      tenants: [],
      permissions: ['TENANT_WRITE', 'USER_WRITE'],
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => ['TENANT_WRITE', 'USER_WRITE'].includes(permission),
  }
}

beforeEach(() => {
  required = false
  stubFetch()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(superuser = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <AuthContext.Provider value={session(superuser)}>
            <SecurityPolicyPage />
          </AuthContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    element?.click()
  })
  await settle()
}

describe('SecurityPolicyPage', () => {
  it('securityPolicyPageShowsTheStateTest', async () => {
    await render()

    expect(container.textContent).toContain('Freiwillig')
    expect(button('Für alle verlangen')).toBeDefined()
  })

  /**
   * The sentence the screen exists for. «Pflicht» reads like a lock-out, and the first thing
   * anybody asks is what becomes of the people without an app.
   */
  it('securityPolicyPageSaysNobodyIsLockedOutTest', async () => {
    await render()

    expect(container.textContent).toContain('nächsten Anmeldung')
    expect(container.textContent).toContain('niemand ausgesperrt')
  })

  /** Switching it on is a decision, so it goes past a dialog that says what changes. */
  it('securityPolicyPageAsksBeforeSwitchingItOnTest', async () => {
    await render()

    await click(button('Für alle verlangen'))
    expect(written).toEqual([])
    expect(document.body.textContent).toContain('auch Ihre eigene')

    await click(button('Verlangen'))

    expect(written).toEqual([{ url: '/api/login-policy', body: { twoFactorRequired: true } }])
    expect(container.textContent).toContain('Für alle Pflicht')
  })

  /** Off again in one step: nothing is lost, and nobody is left outside. */
  it('securityPolicyPageSwitchesItOffWithoutAskingTest', async () => {
    required = true
    await render()

    await click(button('Pflicht aufheben'))

    expect(written).toEqual([{ url: '/api/login-policy', body: { twoFactorRequired: false } }])
    expect(container.textContent).toContain('Freiwillig')
  })

  /**
   * The reason there is no right for this. A right can be granted to a role of one tenant, and
   * one tenant's administrator must not switch how everyone else logs in.
   */
  it('securityPolicyPageOffersNoSwitchToATenantAdministratorTest', async () => {
    await render(false)

    expect(container.textContent).toContain('Freiwillig')
    expect(button('Für alle verlangen')).toBeUndefined()
    expect(container.textContent).toContain('nur von einem Superuser')
  })
})
