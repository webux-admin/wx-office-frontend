// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS } from '../lib/accounting'
import type { Account, Page, Product } from '../lib/types'
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

/** An article that already carries a revenue account out of the chart. */
const STORED: Product = {
  id: 7,
  productNumber: 'P-100',
  productType: 'GOODS',
  name: 'Bohrmaschine',
  unit: 'PIECE',
  unitLabel: 'Stk',
  revenueAccount: '3000',
  vatCategory: 'STANDARD',
  active: true,
}

const REVENUE_ACCOUNTS: Page<Account> = {
  content: [
    {
      id: 3,
      accountNumber: '3000',
      name: 'Warenertrag',
      accountType: 'REVENUE',
      orPosition: 'ER_NETTOERLOESE',
      directPostingAllowed: true,
      active: true,
    },
  ],
  page: 0,
  size: 200,
  totalElements: 1,
  totalPages: 1,
  sort: 'accountNumber,asc',
}

let container: HTMLDivElement
let root: Root
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({ url, method, body: JSON.parse(String(init?.body ?? '{}')) })
      return json(STORED)
    }
    if (url.includes('/vat-rates')) return json({ STANDARD: 8.1, REDUCED: 2.6 })
    if (url.includes('/accounting/accounts')) return json(REVENUE_ACCOUNTS)
    if (url.includes('/products/7')) return json(STORED)
    return json([])
  })
}

beforeEach(() => {
  written = []
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
 * The mask, for a new article by default.
 *
 * <p>`neu` needs no stored product, which is all a test about the register bar wants. A test
 * about what a save carries names {@link STORED} instead, by its id.
 */
async function render(auth: AuthState, id = 'neu') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/produkte/${id}`]}>
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

/** The button that finishes the mask. */
function save(): HTMLElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === 'Speichern',
  )
}

async function openAccountingRegister() {
  await act(async () => register('Buchhaltung')?.click())
  await settle()
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

  it('productPageShowsTheRevenueAccountWithRightAndModuleTest', async () => {
    await render(
      session([...READS_PRODUCTS, ACCOUNTING_RIGHTS.read], [ACCOUNTING_MODULE]),
      '7',
    )
    await openAccountingRegister()

    expect(text()).toContain('Ertragskonto')
    // Out of the chart, not out of a maintained list: number and name in one line.
    expect(text()).toContain('3000 · Warenertrag')
  })

  it('productPageHidesTheRevenueAccountWithoutTheRightTest', async () => {
    await render(session(READS_PRODUCTS, [ACCOUNTING_MODULE]), '7')
    await openAccountingRegister()

    expect(text()).not.toContain('Ertragskonto')
    // The register itself stays: the VAT treatment in it needs no bookkeeping right.
    expect(text()).toContain('MwSt-Behandlung')
  })

  /** The right alone is not enough: a tenant that keeps no books here has no chart to pick from. */
  it('productPageHidesTheRevenueAccountWithoutTheModuleTest', async () => {
    await render(session([...READS_PRODUCTS, ACCOUNTING_RIGHTS.read], []), '7')
    await openAccountingRegister()

    expect(text()).not.toContain('Ertragskonto')
    expect(text()).toContain('MwSt-Behandlung')
  })

  /**
   * The proof test: a hidden field must not empty the record behind it.
   *
   * <p>The backend replaces the stored revenue account with whatever the payload carries, so a
   * save without it clears the account. A product clerk holding no bookkeeping right never sees
   * the field — and would otherwise wipe the account off every article they correct.
   */
  it('productPageKeepsTheStoredRevenueAccountWhileTheFieldIsHiddenTest', async () => {
    await render(session(READS_PRODUCTS, []), '7')

    expect(text()).toContain('Bohrmaschine')
    await act(async () => save()?.click())
    await settle()

    const put = written.find((request) => request.method === 'PUT')
    expect(put?.url).toBe('/api/tenants/1/products/7')
    expect(put?.body.revenueAccount).toBe('3000')
  })
})
