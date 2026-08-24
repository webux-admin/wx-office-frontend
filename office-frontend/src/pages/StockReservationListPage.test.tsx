// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { DocumentType, StockLocation, StockReservation } from '../lib/types'
import { StockReservationListPage } from './StockReservationListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', active: true }

const ROWS: StockReservation[] = [
  {
    id: 11,
    productId: 42,
    productNumber: 'P-001',
    productName: 'Schraube',
    unitShortName: 'Stk',
    locationId: 7,
    locationName: 'Hauptlager',
    quantity: 10,
    quantityReleased: 4,
    openQuantity: 6,
    status: 'OPEN',
    sourceId: 300,
    sourceLineId: 3001,
    sourceNumber: 'AU-2026-0007',
    reservedOn: '2026-08-01',
  },
  {
    id: 12,
    productId: 43,
    productNumber: 'P-002',
    productName: 'Kabel',
    unitShortName: 'm',
    locationId: 7,
    locationName: 'Hauptlager',
    quantity: 5,
    quantityReleased: 5,
    openQuantity: 0,
    status: 'CONSUMED',
    sourceId: 301,
    sourceNumber: 'AU-2026-0008',
    reservedOn: '2026-07-02',
  },
]

/** A kind of document that reserves, so the empty state does not blame the setup. */
const ORDER_TYPE = {
  id: 5,
  code: 'AU',
  name: 'Auftrag',
  category: 'ORDER',
  stockEffect: 'RESERVE',
} as unknown as DocumentType

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, inventoryEnabled: true },
      ],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

let container: HTMLDivElement
let root: Root
/** The reservations the endpoint answers with. */
let rows: StockReservation[]
/** The kinds of document the tenant has; the empty state reads them. */
let documentTypes: DocumentType[]
/** Every reservation request the list sent, in order. */
let asked: string[]
/** Every release the dialog posted, as `[url, body]`. */
let released: [string, string][]

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
  released = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.includes('/inventory/locations')) return json([MAIN])
    if (url.includes('/document-types')) return json(documentTypes)
    if (url.includes('/release')) {
      released.push([url, String(init?.body ?? '')])
      return json({ ...rows[0], status: 'RELEASED' })
    }
    if (url.includes('/inventory/reservations')) {
      asked.push(url)
      const open = url.includes('status=OPEN')
      const found = open ? rows.filter((row) => row.status === 'OPEN') : rows
      return json({
        content: found,
        page: 0,
        size: 50,
        totalElements: found.length,
        totalPages: 1,
        sort: 'reservedOn,asc',
      })
    }
    if (url.includes('/catalogues')) return json({})
    return json([])
  })
}

beforeEach(() => {
  rows = ROWS
  documentTypes = [ORDER_TYPE]
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

async function render(permissions: string[] = ['INVENTORY_READ', 'INVENTORY_MOVE']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <StockReservationListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const bodyRows = () => [...container.querySelectorAll('tbody tr')]

function buttonNamed(label: string, within: ParentNode = container) {
  return [...within.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
}

/** The open dialog, so a label the table also carries is looked for inside it. */
function dialog(): ParentNode {
  return container.querySelector('[role="dialog"]') as ParentNode
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** The input belonging to a visible label, the way somebody would find it on screen. */
function fieldLabelled(label: string): HTMLInputElement {
  const element = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  // getElementById rather than a selector: useId hands out ids with colons in them.
  return document.getElementById(element?.htmlFor ?? '') as HTMLInputElement
}

function typeInto(control: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('StockReservationListPage', () => {
  /** The list opens on what still takes stock away; the consumed row is filtered out. */
  it('stockReservationListPageTest', async () => {
    await render()

    expect(bodyRows()).toHaveLength(1)
    expect(text()).toContain('Schraube')
    expect(text()).toContain('AU-2026-0007')
    expect(text()).toContain('Offen')
    expect(asked.at(-1)).toContain('status=OPEN')
  })

  /** Every row leads onto the order that spoke the quantity for. */
  it('stockReservationListPageLinksTheDocumentTest', async () => {
    await render()

    const href = container.querySelector('tbody a[href^="/auftraege"]')?.getAttribute('href')

    expect(href).toBe('/auftraege/300')
  })

  /** The tidy-up filter stands in the open, not hidden in a column setting. */
  it('stockReservationListPageOffersTheStaleFilterTest', async () => {
    await render()

    const stale = buttonNamed('Älter als 30 Tage')
    expect(stale).toBeDefined()

    click(stale as Element)
    await settle()

    expect(asked.at(-1)).toContain('olderThanDays=30')
  })

  /** Nothing reserved is not an error: it says what would create a reservation. */
  it('stockReservationListPageExplainsTheEmptyListTest', async () => {
    rows = []
    await render()

    expect(text()).toContain('Keine Treffer.')

    click(buttonNamed('Filter zurücksetzen') as Element)
    await settle()

    expect(text()).toContain('Zurzeit ist nichts reserviert.')
    expect(text()).toContain('Auftrag mit lagergeführten Positionen ausgestellt wird')
  })

  /** No kind of document reserves: then the cause is the setup, and the way there is shown. */
  it('stockReservationListPageBlamesTheDocumentTypesTest', async () => {
    rows = []
    documentTypes = [{ ...ORDER_TYPE, stockEffect: 'NONE' }]
    await render(['INVENTORY_READ', 'DOCUMENT_TYPE_READ'])

    click(buttonNamed('Filter zurücksetzen') as Element)
    await settle()

    expect(text()).toContain('Keine Belegart reserviert Bestand.')
    expect(container.querySelector('a[href="/belegarten"]')).not.toBeNull()
  })

  /** Releasing is bound to INVENTORY_MOVE. Convenience, not protection — the server decides. */
  it('stockReservationListPageHidesTheReleaseWithoutTheRightTest', async () => {
    await render(['INVENTORY_READ'])

    expect(buttonNamed('Freigeben')).toBeUndefined()
  })

  /** The button stays shut until a reason stands there: no complaint after the click. */
  it('stockReservationListPageReleasesWithAReasonTest', async () => {
    await render()

    click(buttonNamed('Freigeben') as Element)
    await settle(0)

    expect(buttonNamed('Freigeben', dialog())?.disabled).toBe(true)

    typeInto(fieldLabelled('Grund'), 'Kunde hat abbestellt')
    await settle(0)

    expect(buttonNamed('Freigeben', dialog())?.disabled).toBe(false)

    click(buttonNamed('Freigeben', dialog()) as Element)
    await settle()

    expect(released).toHaveLength(1)
    expect(released[0][0]).toContain('/inventory/reservations/11/release')
    expect(released[0][1]).toContain('Kunde hat abbestellt')
  })
})
