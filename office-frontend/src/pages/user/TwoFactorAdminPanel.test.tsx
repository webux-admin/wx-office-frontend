// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { TWO_FACTOR_RESET } from '../../lib/twoFactor'
import type { SecondFactorState, User } from '../../lib/types'
import { TwoFactorAdminPanel } from './TwoFactorAdminPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER: User = {
  id: 42,
  username: 'anna',
  email: 'anna@example.ch',
  displayName: 'Anna Muster',
  active: true,
  superuser: false,
  locked: false,
}

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'admin',
      activeTenantId: 1,
      superuser: false,
      tenants: [],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const MAY_RESET = session(['USER_READ', 'USER_WRITE', TWO_FACTOR_RESET])
const MAY_NOT = session(['USER_READ', 'USER_WRITE'])

let container: HTMLDivElement
let root: Root
let state: SecondFactorState
/** Every write the panel sent. */
let written: string[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === null ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  state = { enrolled: true, method: 'TOTP', remainingRecoveryCodes: 8 }
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      written.push(url)
      return json(null, 204)
    }
    return json(state)
  })
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

async function render(auth: AuthState = MAY_RESET) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <TwoFactorAdminPanel user={USER} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
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

describe('TwoFactorAdminPanel', () => {
  it('twoFactorAdminPanelShowsTheStateTest', async () => {
    await render()

    expect(container.textContent).toContain('Eingerichtet')
    expect(container.textContent).toContain('Authenticator-App')
    expect(container.textContent).toContain('Noch 8 Wiederherstellungscodes')
  })

  it('twoFactorAdminPanelSaysWhenNothingStandsTest', async () => {
    state = { enrolled: false, remainingRecoveryCodes: 0 }
    await render()

    expect(container.textContent).toContain('Nicht eingerichtet')
    expect(container.textContent).toContain('nur durch sein Passwort geschützt')
    expect(button('Zwei-Faktor zurücksetzen')).toBeUndefined()
  })

  /**
   * Its own right, not `USER_WRITE`: together with setting a password it is an account
   * takeover (backend ADR-0087).
   */
  it('twoFactorAdminPanelHidesTheResetWithoutTheRightTest', async () => {
    await render(MAY_NOT)

    expect(container.textContent).toContain('Eingerichtet')
    expect(button('Zwei-Faktor zurücksetzen')).toBeUndefined()
  })

  /** One of the few buttons that make an account weaker, so it asks first and says what for. */
  it('twoFactorAdminPanelAsksBeforeResettingTest', async () => {
    await render()

    await click(button('Zwei-Faktor zurücksetzen'))

    expect(container.textContent).toContain('nur noch mit seinem Passwort')
    expect(written).toHaveLength(0)

    await click(button('Zurücksetzen'))

    expect(written).toEqual(['/api/users/42/two-factor/reset'])
  })

  it('twoFactorAdminPanelCancelsWithoutResettingTest', async () => {
    await render()
    await click(button('Zwei-Faktor zurücksetzen'))

    await click(button('Abbrechen'))

    expect(written).toHaveLength(0)
  })
})
