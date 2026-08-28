// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { Product, StockBalance, StockLocation, StockMovement } from '../../lib/types'
import { ProductStock } from './ProductStock'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const SCREW: Product = {
  id: 42,
  productNumber: 'P-001',
  name: 'Schraube',
  productType: 'GOODS',
  unit: 'PIECE',
  vatCategory: 'STANDARD',
  stockManaged: true,
}

const LOCATIONS: StockLocation[] = [
  { id: 1, code: 'HAUPT', name: 'Hauptlager', defaultLocation: true },
  { id: 2, code: 'AUSSEN', name: 'Aussenlager' },
]

const BALANCES: StockBalance[] = [
  {
    productId: 42,
    locationId: 1,
    quantity: 12,
    reservedQuantity: 2,
    availableQuantity: 10,
    productName: 'Schraube',
    unitShortName: 'Stk',
  },
  {
    productId: 42,
    locationId: 2,
    quantity: 5,
    reservedQuantity: 0,
    availableQuantity: 5,
    productName: 'Schraube',
    unitShortName: 'Stk',
  },
]

const MOVEMENTS: StockMovement[] = [
  {
    id: 11,
    productId: 42,
    productName: 'Schraube',
    locationId: 1,
    quantity: 12,
    reason: 'RECEIPT',
    bookedOn: '2026-08-20',
    sourceKind: 'MANUAL',
  },
]

/** A session that may look at stock but not book it. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: ['INVENTORY_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'INVENTORY_READ',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/inventory/locations')
      ? LOCATIONS
      : url.includes('/inventory/balances')
        ? BALANCES
        : url.includes('/inventory/movements/latest')
          ? MOVEMENTS
          : url.includes('/catalogues')
            ? { 'movement-reason': [{ code: 'RECEIPT', name: 'Wareneingang' }] }
            : []
    return Promise.resolve(
      new Response(JSON.stringify(body), {
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

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext value={SESSION}>
          <MemoryRouter>
            <ProductStock tenantId={TENANT} product={SCREW} />
          </MemoryRouter>
        </AuthContext>
      </QueryClientProvider>,
    )
  })
  // Three requests go out in parallel; a couple of macrotasks let all of them settle.
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('ProductStock', () => {
  /**
   * «Warum 17?» is answered by the journal, so every number is the way into it — narrowed to
   * this product and, where the number belongs to one, to that location.
   */
  it('productStockLinksEachNumberToTheJournalTest', async () => {
    await show()

    const links = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))

    expect(links).toContain('/lagerbewegungen?produkt=42&lagerort=1')
    expect(links).toContain('/lagerbewegungen?produkt=42&lagerort=2')
    // The totals lead to the whole journal of the product, over every location.
    expect(links).toContain('/lagerbewegungen?produkt=42')
  })

  it('productStockShowsEveryLocationAndATotalTest', async () => {
    await show()

    expect(container.textContent).toContain('Hauptlager')
    expect(container.textContent).toContain('Aussenlager')
    expect(container.textContent).toContain('Total')
    // 12 + 5, of which 2 are spoken for.
    expect(container.textContent).toContain('17')
    expect(container.textContent).toContain('15')
  })

  /** Booking is a right of its own; a reader without it sees numbers and no button. */
  it('productStockHidesBookingWithoutTheRightTest', async () => {
    await show()

    const buttons = [...container.querySelectorAll('button')].map((element) =>
      element.textContent?.trim(),
    )
    expect(buttons).not.toContain('Bestand buchen')
  })
})
