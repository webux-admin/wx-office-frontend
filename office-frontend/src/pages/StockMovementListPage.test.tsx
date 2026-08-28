// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { StockLocation, StockMovement } from '../lib/types'
import { StockMovementListPage } from './StockMovementListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** The number of the count list whose bookings the mask links here with. */
const STOCKTAKE_NUMBER = 'INV-2026-0001'

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', active: true }

/** A count adjustment: what booking a stocktake leaves in the journal. */
const ADJUSTMENT: StockMovement = {
  id: 900,
  productId: 11,
  productNumber: 'P-100',
  productName: 'Schraube M4',
  unitShortName: 'Stk',
  locationId: 7,
  quantity: -2,
  reason: 'COUNT_ADJUSTMENT',
  bookedOn: '2026-01-20',
  sourceKind: 'STOCKTAKE',
  sourceId: 42,
  sourceNumber: STOCKTAKE_NUMBER,
}

/** A delivery of another day, so a narrowed journal has something to leave out. */
const ISSUE: StockMovement = {
  id: 901,
  productId: 12,
  productNumber: 'P-200',
  productName: 'Mutter M6',
  unitShortName: 'Stk',
  locationId: 7,
  quantity: -5,
  reason: 'ISSUE',
  bookedOn: '2026-01-19',
  sourceKind: 'DOCUMENT',
  sourceId: 5,
  sourceNumber: 'LS-2026-0007',
}

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
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'INVENTORY_READ',
}

let container: HTMLDivElement
let root: Root
/** Every journal request the list sent, in order. */
let asked: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** The rows the endpoint answers with; narrowed the way the server narrows them. */
const ROWS = [ADJUSTMENT, ISSUE]

function stubFetch() {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/inventory/locations')) return json([MAIN])
    if (url.includes('/inventory/movements')) {
      asked.push(url)
      // The quick search of the journal reads the source number as well, which is what makes
      // a document number the way into the rows it wrote (backend `MovementQueries`).
      const term = decodeURIComponent(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
      const found = ROWS.filter((row) =>
        `${row.productNumber} ${row.productName} ${row.sourceNumber}`.toLowerCase().includes(term),
      )
      return json({
        content: found,
        page: 0,
        size: 50,
        totalElements: found.length,
        totalPages: 1,
        sort: 'bookedOn,desc',
      })
    }
    if (url.includes('/catalogues')) return json({})
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

/** Opens the journal at the given address, the way a link from another mask does. */
async function render(address = '/lagerbewegungen') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[address]}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <StockMovementListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''

/** The last journal request, so what a link asked for can be held against it. */
const lastRequest = () => asked[asked.length - 1] ?? ''

/** What stands in the quick search field of the journal. */
function searchField(): HTMLInputElement | undefined {
  return [...container.querySelectorAll('input')].find(
    (input) => input.getAttribute('placeholder') === 'Produkt, Belegnummer oder Charge',
  )
}

describe('StockMovementListPage', () => {
  /**
   * A link into the journal carries what it wants to see. The «Buchungen» panel of a booked
   * count list carries its number in `suche`, and the journal has to open on those rows —
   * a parameter that is quietly dropped opens the whole journal and says nothing about it.
   */
  it('stockMovementListPageOpensWithTheTermFromTheLinkTest', async () => {
    await render(`/lagerbewegungen?suche=${STOCKTAKE_NUMBER}`)

    expect(lastRequest()).toContain(`search=${encodeURIComponent(STOCKTAKE_NUMBER)}`)
    // And the field says what the list is narrowed by, so it can be widened again.
    expect(searchField()?.value).toBe(STOCKTAKE_NUMBER)
    expect(text()).toContain('Schraube M4')
    expect(text()).not.toContain('Mutter M6')
  })

  /** Without the parameter the journal opens on everything, and asks for no term. */
  it('stockMovementListPageWithoutATermInTheLinkTest', async () => {
    await render()

    expect(lastRequest()).not.toContain('search=')
    expect(searchField()?.value).toBe('')
    expect(text()).toContain('Schraube M4')
    expect(text()).toContain('Mutter M6')
  })

  /**
   * An empty parameter is no filter. A link built from a count list that has no number yet
   * would otherwise narrow the journal to the empty string and show nothing.
   */
  it('stockMovementListPageWithAnEmptyTermInTheLinkTest', async () => {
    await render('/lagerbewegungen?suche=')

    expect(lastRequest()).not.toContain('search=')
    expect(text()).toContain('Mutter M6')
  })
})
