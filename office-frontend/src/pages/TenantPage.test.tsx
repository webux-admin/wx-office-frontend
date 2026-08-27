// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Tenant } from '../lib/types'
import { TenantPage } from './TenantPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const PERMISSIONS = ['TENANT_READ', 'TENANT_WRITE']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, inventoryEnabled: true }],
    permissions: PERMISSIONS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => PERMISSIONS.includes(permission),
}

/** The label of the two fields under test, as the user reads them. */
const PERCENT = 'Begründungspflicht ab'
const MINIMUM = 'Untergrenze der Begründungspflicht'

/**
 * The tenant the mask reads.
 *
 * <p>Thresholds away from the shipped 5 % and 1 on purpose: a field that shows the default no
 * matter what the tenant stored would pass a test built on the default.
 */
function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT,
    code: 'WEBUX',
    active: true,
    name: 'Webux GmbH',
    address: { postalCode: '8001', town: 'Zürich', country: 'CH' },
    baseCurrency: 'CHF',
    fiscalYearStartMonth: 1,
    defaultLanguage: 'de',
    cashRoundingEnabled: true,
    cashRoundingIncrement: 0.05,
    inventoryEnabled: true,
    stocktakeReasonPercent: 12.5,
    stocktakeReasonMinimum: 3,
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** The tenant the endpoint answers with; every test sets what it is about. */
let stored: Tenant
/** Every write the mask sent: method and body per request. */
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
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(stored)
    }
    if (url.includes('/catalogues')) return json({})
    if (url.endsWith(`/api/tenants/${TENANT}`)) return json(stored)
    return json([])
  })
}

beforeEach(() => {
  stored = tenant()
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/mandanten/${TENANT}`]}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/mandanten/:id" element={<TenantPage />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The input the given label points at, or undefined while the mask does not show it. */
function field(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

function fill(input: HTMLInputElement | undefined, value: string) {
  expect(input).toBeDefined()
  if (!input) return
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function save() {
  const button = [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === 'Speichern',
  )
  expect(button).toBeDefined()
  await act(async () => {
    button?.click()
  })
  await settle()
}

describe('TenantPage', () => {
  it('tenantPageShowsStocktakeReasonThresholdsTest', async () => {
    await render()

    expect(field(PERCENT)?.value).toBe('12.5')
    expect(field(MINIMUM)?.value).toBe('3')
  })

  it('tenantPageShowsZeroStocktakeReasonPercentTest', async () => {
    // Zero is a threshold and not an empty field: it means «always a reason».
    stored = tenant({ stocktakeReasonPercent: 0, stocktakeReasonMinimum: 0 })

    await render()

    expect(field(PERCENT)?.value).toBe('0')
    expect(field(MINIMUM)?.value).toBe('0')
  })

  it('tenantPageSavesStocktakeReasonThresholdsTest', async () => {
    await render()

    fill(field(PERCENT), '7.5')
    fill(field(MINIMUM), '2')
    await save()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(written[0].body.stocktakeReasonPercent).toBe(7.5)
    expect(written[0].body.stocktakeReasonMinimum).toBe(2)
  })

  it('tenantPageSavesZeroStocktakeReasonPercentTest', async () => {
    await render()

    fill(field(PERCENT), '0')
    await save()

    // Zero has to reach the endpoint as zero. Sent as «nothing», it would arrive as «not
    // stated», and the backend would keep the old threshold instead of asking for a reason
    // on every difference.
    expect(written[0].body.stocktakeReasonPercent).toBe(0)
  })

  it('tenantPageHidesStocktakeReasonThresholdsWithoutInventoryTest', async () => {
    stored = tenant({ inventoryEnabled: false })

    await render()

    expect(field(PERCENT)).toBeUndefined()
    // Nothing shown, nothing sent: the stored threshold stays as it is.
    await save()
    expect(written[0].body.stocktakeReasonPercent).toBeUndefined()
  })
})
