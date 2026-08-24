// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { ShortageRow, StockLocation } from '../lib/types'
import { StockShortageListPage } from './StockShortageListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', active: true }
const OUTER: StockLocation = { id: 8, code: 'AUSSEN', name: 'Aussenlager', active: true }

/** A buying job: the minimum belongs to the product, so this row carries no location. */
const BELOW_MINIMUM: ShortageRow = {
  productId: 42,
  productNumber: 'P-001',
  productName: 'Schraube',
  unitShortName: 'Stk',
  quantity: 8,
  availableQuantity: 8,
  minimumQuantity: 10,
  missingQuantity: 2,
  cause: 'BELOW_MINIMUM',
}

/** A booking mistake, fixable only where it happened. */
const NEGATIVE: ShortageRow = {
  productId: 43,
  productNumber: 'P-002',
  productName: 'Kabel',
  unitShortName: 'kg',
  locationId: 8,
  locationName: 'Aussenlager',
  quantity: -3,
  availableQuantity: -3,
  missingQuantity: 3,
  cause: 'NEGATIVE',
}

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, inventoryEnabled: true }],
    permissions: ['INVENTORY_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => permission === 'INVENTORY_READ',
}

let container: HTMLDivElement
let root: Root
let locations: StockLocation[]
let rows: ShortageRow[]
/** Every shortfall request the list sent, in order. */
let asked: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/inventory/locations')) return json(locations)
    if (url.includes('/inventory/stock/shortages')) {
      asked.push(url)
      const cause = /[?&]cause=([^&]*)/.exec(url)?.[1]
      const found = cause === undefined ? rows : rows.filter((row) => row.cause === cause)
      return json({
        content: found,
        page: 0,
        size: 50,
        totalElements: found.length,
        totalPages: 1,
        sort: 'missingQuantity,desc',
      })
    }
    if (url.includes('/catalogues')) return json({})
    return json([])
  })
}

beforeEach(() => {
  locations = [MAIN, OUTER]
  rows = [NEGATIVE, BELOW_MINIMUM]
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

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <StockShortageListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const bodyRows = () => [...container.querySelectorAll('tbody tr')]

function chip(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === label,
  )
  if (found === undefined) throw new Error(`Kein Filter «${label}»`)
  return found
}

describe('StockShortageListPage', () => {
  it('shortageListPageTest', async () => {
    await render()

    expect(bodyRows()).toHaveLength(2)
    expect(text()).toContain('Unterdeckung')
    expect(text()).toContain('Fehlmenge')
    expect(text()).toContain('Negativ')
    expect(text()).toContain('Unter Mindestbestand')
  })

  /**
   * A shortfall is the buying job of a product, not of a place — and a BELOW_MINIMUM row has
   * no location to filter by at all.
   */
  it('shortageListPageHasNoLocationFilterTest', async () => {
    await render()

    expect(container.querySelector('select')).toBeNull()
    // The column is there, because this tenant has two locations. Only the filter is not.
    expect(text()).toContain('Lagerort')
  })

  it('shortageListPageNamesTheMissingLocationTest', async () => {
    await render()

    // An empty cell would read as a missing value, so the row says which places it counts.
    expect(text()).toContain('Alle Lagerorte')
    expect(text()).toContain('Aussenlager')
  })

  /** The location column follows the same rule as everywhere else (ADR-0014). */
  it('shortageListPageHidesTheLocationColumnWithOneLocationTest', async () => {
    locations = [MAIN]
    await render()

    expect(text()).not.toContain('Lagerort')
    expect(text()).not.toContain('Alle Lagerorte')
  })

  it('shortageListPageFiltersByCauseTest', async () => {
    await render()

    await act(async () => {
      chip('Negativ').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await settle()

    expect(asked.at(-1)).toContain('cause=NEGATIVE')
    expect(bodyRows()).toHaveLength(1)
    expect(text()).toContain('Kabel')
    expect(text()).not.toContain('Schraube')
  })

  /** The biggest gap is worked first, so the list asks for that order itself. */
  it('shortageListPageAsksForTheBiggestGapFirstTest', async () => {
    await render()

    expect(asked.at(-1)).toContain('sort=missingQuantity%2Cdesc')
  })

  /** Every quantity leads onto the movements that explain it; a summed row without a place. */
  it('shortageListPageLinksEveryQuantityToTheJournalTest', async () => {
    await render()

    const hrefs = [...container.querySelectorAll('tbody a')].map((link) =>
      link.getAttribute('href'),
    )

    expect(hrefs).toEqual([
      '/lagerbewegungen?produkt=43&lagerort=8',
      '/lagerbewegungen?produkt=42',
    ])
  })

  /** Nothing to do means no button either: there is no filter to reset and nothing to book. */
  it('shortageListPageSaysNothingIsShortTest', async () => {
    rows = []
    await render()

    expect(text()).toContain('Kein Bestand ist unterdeckt.')
    expect(container.querySelector('tbody')).toBeNull()
  })
})
