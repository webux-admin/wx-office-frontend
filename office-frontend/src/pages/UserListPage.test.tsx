// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { User } from '../lib/types'
import { UserListPage } from './UserListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'admin',
    activeTenantId: 1,
    superuser: false,
    tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
    permissions: ['USER_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'USER_READ',
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    username: 'anna',
    email: 'anna@example.ch',
    displayName: 'Anna Muster',
    active: true,
    superuser: false,
    locked: false,
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** The rows the list endpoint answers. */
let rows: User[]
/** Every address the list asked for. */
let asked: string[]

beforeEach(() => {
  rows = [user()]
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    return Promise.resolve(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/benutzer']}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <UserListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

describe('UserListPage', () => {
  it('userListPageShowsTheSecondFactorMethodTest', async () => {
    rows = [
      user({ id: 7, username: 'anna', secondFactorMethod: 'TOTP' }),
      user({ id: 8, username: 'berta', secondFactorMethod: 'EMAIL' }),
      user({ id: 9, username: 'carla' }),
    ]
    await render()

    expect(container.textContent).toContain('Authenticator-App')
    expect(container.textContent).toContain('Code per E-Mail')
    expect(container.textContent).toContain('Nein')
  })

  /**
   * The whole point of the field on the answer. One request for the list, not one per row —
   * a hundred accounts would otherwise mean a hundred requests for one badge each.
   */
  it('userListPageAsksOnceForTheWholeListTest', async () => {
    rows = [
      user({ id: 7, secondFactorMethod: 'TOTP' }),
      user({ id: 8, secondFactorMethod: 'EMAIL' }),
      user({ id: 9 }),
    ]
    await render()

    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('/api/users')
    expect(asked.some((url) => url.includes('/two-factor'))).toBe(false)
  })

  /** A method a later backend adds shows as its code rather than blanking the cell. */
  it('userListPageShowsAnUnknownMethodAsItIsTest', async () => {
    rows = [user({ secondFactorMethod: 'WEBAUTHN' })]
    await render()

    expect(container.textContent).toContain('WEBAUTHN')
  })
})
