// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { StockLocation, StockRow } from '../lib/types'
import { StockListPage } from './StockListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', active: true }
const OUTER: StockLocation = { id: 8, code: 'AUSSEN', name: 'Aussenlager', active: true }

const ROWS: StockRow[] = [
  {
    productId: 42,
    productNumber: 'P-001',
    productName: 'Schraube',
    productEan: '4006381333931',
    unitShortName: 'Stk',
    locationId: 7,
    locationName: 'Hauptlager',
    quantity: 8,
    reservedQuantity: 3,
    availableQuantity: 5,
    minimumQuantity: 10,
    shortage: 'BELOW_MINIMUM',
  },
  {
    productId: 43,
    productNumber: 'P-002',
    productName: 'Kabel',
    unitShortName: 'kg',
    locationId: 7,
    locationName: 'Hauptlager',
    quantity: -3,
    reservedQuantity: 0,
    availableQuantity: -3,
    shortage: 'NEGATIVE',
  },
  {
    productId: 44,
    productNumber: 'P-003',
    productName: 'Mutter',
    unitShortName: 'Stk',
    locationId: 7,
    locationName: 'Hauptlager',
    quantity: 40,
    reservedQuantity: 28,
    availableQuantity: 12,
    minimumQuantity: 10,
  },
]

/** A session that may read the inventory but not book in it. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['INVENTORY'] }],
    permissions: ['INVENTORY_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'INVENTORY_READ',
}

let container: HTMLDivElement
let root: Root
/** The locations the tenant has; the location column hangs on how many there are. */
let locations: StockLocation[]
/** The rows the stock endpoint answers with, before the search narrows them. */
let rows: StockRow[]
/** Every stock request the list sent, in order. */
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
    if (url.includes('/inventory/stock')) {
      asked.push(url)
      const term = decodeURIComponent(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
      const found = rows.filter((row) => row.productName.toLowerCase().includes(term))
      return json({
        content: found,
        page: 0,
        size: 50,
        totalElements: found.length,
        totalPages: 1,
        sort: 'productName,asc',
      })
    }
    if (url.includes('/catalogues')) return json({})
    return json([])
  })
}

beforeEach(() => {
  locations = [MAIN]
  rows = ROWS
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

/** Lets the debounce of the search field and the answer that follows it run out. */
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
            <StockListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const bodyRows = () => [...container.querySelectorAll('tbody tr')]
const searchField = () => container.querySelector('input[type="search"], input') as HTMLInputElement

function type(value: string) {
  const control = searchField()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('StockListPage', () => {
  it('stockListPageTest', async () => {
    await render()

    expect(bodyRows()).toHaveLength(3)
    expect(text()).toContain('Schraube')
    expect(text()).toContain('P-001')
    expect(text()).toContain('Bestand')
  })

  /**
   * One location means nothing to choose from: neither the filter nor the column carries
   * information, and both would take up room on every row (ADR-0014).
   */
  it('stockListPageHidesTheLocationColumnWithOneLocationTest', async () => {
    await render()

    expect(text()).not.toContain('Lagerort')
    expect(container.querySelector('select')).toBeNull()
  })

  it('stockListPageShowsTheLocationColumnWithTwoLocationsTest', async () => {
    locations = [MAIN, OUTER]
    await render()

    expect(text()).toContain('Lagerort')
    expect(text()).toContain('Aussenlager')
    expect(container.querySelector('select')).not.toBeNull()
  })

  /**
   * A computed figure without a way to check it is not believed. The projection is a cache;
   * the click leads onto the journal it was computed from.
   */
  it('stockListPageLinksEveryQuantityToTheJournalTest', async () => {
    await render()

    const hrefs = [...container.querySelectorAll('tbody a')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => href?.startsWith('/lagerbewegungen'))

    // Two per row: the free quantity and the stock behind it both lead into the journal.
    expect(hrefs).toEqual(
      ROWS.flatMap((row) => {
        const journal = `/lagerbewegungen?produkt=${row.productId}&lagerort=${row.locationId}`
        return [journal, journal]
      }),
    )
  })

  /**
   * The free quantity is what somebody may promise a customer, so it leads and the stock
   * stands beside it as the explanation (backend ADR-0066).
   */
  it('stockListPageShowsAvailableBeforeStockTest', async () => {
    await render()

    const headers = [...container.querySelectorAll('thead th')].map((cell) => cell.textContent)

    expect(headers.indexOf('Verfügbar')).toBeGreaterThanOrEqual(0)
    expect(headers.indexOf('Verfügbar')).toBeLessThan(headers.indexOf('Bestand'))
    expect(headers).toContain('Reserviert')
  })

  /** A reserved quantity is checkable too: it links into the rows that took it away. */
  it('stockListPageLinksTheReservedQuantityTest', async () => {
    await render()

    const hrefs = [...container.querySelectorAll('tbody a')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => href?.startsWith('/reservierungen'))

    // Only the two rows that actually hold a reservation; a zero stays a dash.
    expect(hrefs).toEqual(['/reservierungen?produkt=42', '/reservierungen?produkt=44'])
  })

  /** The state has to be readable as a word, not only as a colour. */
  it('stockListPageNamesTheShortageCauseTest', async () => {
    await render()

    expect(text()).toContain('Negativ')
    expect(text()).toContain('Unter Mindestbestand')
  })

  it('stockListPageExplainsTheEmptyCatalogueTest', async () => {
    rows = []
    await render()

    expect(text()).toContain('Noch kein Produkt wird im Lager geführt.')
    expect(text()).toContain('lagergeführt')
    expect(container.querySelector('a[href="/produkte"]')).not.toBeNull()
  })

  /** Nothing found is not the same as nothing there, and the way out is a different one. */
  it('stockListPageTellsNoHitsFromNoStockTest', async () => {
    await render()

    type('gibtsnicht')
    await settle()

    expect(text()).toContain('Keine Treffer.')
    expect(text()).toContain('Filter zurücksetzen')
    expect(text()).not.toContain('Noch kein Produkt wird im Lager geführt.')
  })

  /** The switch is not the default: a stock of 0 is an answer to the question. */
  it('stockListPageAsksWithoutTheStockFilterByDefaultTest', async () => {
    await render()

    expect(asked.at(-1)).not.toContain('withStockOnly')
  })
})
