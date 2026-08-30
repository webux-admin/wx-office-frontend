// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ProductPage } from './ProductPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[], modules: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules }],
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

const READS_PRODUCTS = ['PRODUCT_READ', 'PRODUCT_WRITE']

let container: HTMLDivElement
let root: Root

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/vat-rates')) return json({ STANDARD: 8.1, REDUCED: 2.6 })
    return json([])
  })
}

beforeEach(() => {
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * The mask for a new article.
 *
 * <p>`neu` on purpose: it needs no stored product, so this test is about the register bar and
 * nothing else.
 */
async function render(auth: AuthState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/produkte/neu']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/produkte/:id" element={<ProductPage />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

/** The register with that label, or undefined while the mask does not offer it. */
function register(label: string): HTMLElement | undefined {
  return [...container.querySelectorAll('button, [role=tab]')].find(
    (entry) => entry.textContent === label,
  ) as HTMLElement | undefined
}

describe('ProductPage', () => {
  it('productPageShowsTheStockRegisterWithRightAndModuleTest', async () => {
    await render(session([...READS_PRODUCTS, 'INVENTORY_READ'], ['INVENTORY']))

    expect(register('Lager')).toBeDefined()

    await act(async () => register('Lager')?.click())
    await settle()

    expect(text()).toContain('Im Lager führen')
  })

  it('productPageHidesTheStockRegisterWithoutTheRightTest', async () => {
    await render(session(READS_PRODUCTS, ['INVENTORY']))

    expect(register('Lager')).toBeUndefined()
    expect(text()).not.toContain('Im Lager führen')
  })

  /**
   * The proof test: the right alone is not enough.
   *
   * <p>A tenant that does not keep stock has none to show, however many rights the session
   * holds — and the sidebar has hidden the whole group already (backend ADR-0060, ADR-0032).
   */
  it('productPageHidesTheStockRegisterWithoutTheModuleTest', async () => {
    await render(session([...READS_PRODUCTS, 'INVENTORY_READ'], []))

    expect(register('Lager')).toBeUndefined()
    expect(text()).not.toContain('Im Lager führen')
    // The other registers are untouched — this is not a broken mask, just a shorter one.
    expect(register('Hauptdaten')).toBeDefined()
    expect(register('Preise')).toBeDefined()
    expect(register('Buchhaltung')).toBeDefined()
  })
})
