// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { PriceEntryRow, PriceGroup } from '../lib/types'
import { PriceEntryPage } from './PriceEntryPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const GROUPS: PriceGroup[] = [
  { id: 3, code: 'STD', name: 'Standard', isDefault: true },
  { id: 4, code: 'HANDEL', name: 'Handel' },
]

/** The bar code of the cable — what a scanner reads instead of the product number. */
const EAN = '7612345678901'

const ROWS: PriceEntryRow[] = [
  {
    productId: 7,
    productNumber: 'P-100',
    name: 'Wartung',
    effectivePrice: 150,
    origin: 'BASE',
  },
  {
    productId: 9,
    productNumber: 'S-010',
    name: 'Schraube',
    effectivePrice: 0.4,
    origin: 'PRICE_GROUP',
    ownPrice: 0.4,
    ownValidFrom: '2020-01-01',
  },
  {
    productId: 11,
    productNumber: 'K-001',
    name: 'Kabel',
    eanCode: EAN,
    effectivePrice: 12,
    origin: 'BASE',
  },
]

/** A session that may read and write prices. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: ['PRODUCT_READ', 'PRODUCT_WRITE'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission.startsWith('PRODUCT_'),
}

let container: HTMLDivElement
let root: Root
/** The body of every save the mask sent, in order. */
let saved: unknown[]

function stubFetch() {
  saved = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      saved.push(JSON.parse(String(init.body)))
      return Promise.resolve(
        new Response(JSON.stringify({ written: saved.length, removed: 0, closed: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    const term = decodeURIComponent(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
    // The same three columns the server matches over, bar code included (ADR-0072).
    const found = ROWS.filter((row) =>
      [row.name, row.productNumber ?? '', row.eanCode ?? ''].some((column) =>
        column.toLowerCase().includes(term),
      ),
    )
    const body = url.includes('/price-entry')
      ? { content: found, page: 0, size: 50, totalElements: found.length, totalPages: 1, sort: '' }
      : url.includes('/price-groups')
        ? GROUPS
        : []
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <PriceEntryPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** The price fields of the table, in the order they are read. */
const priceFields = () =>
  [...container.querySelectorAll('tbody input')] as HTMLInputElement[]

const rows = () => [...container.querySelectorAll('tbody tr')]

/** The catalogue search, found by its wording rather than by its place among the fields. */
const searchField = () =>
  container.querySelector(
    'input[placeholder="Nummer, Bezeichnung oder Strichcode"]',
  ) as HTMLInputElement

function type(control: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(control: HTMLInputElement, key: string) {
  act(() => {
    control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** The button that saves, found by its wording rather than by its position. */
function saveButton(): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')] as HTMLButtonElement[]
  const found = buttons.find((button) => button.textContent?.includes('Speichern'))
  if (found === undefined) throw new Error('Speichern-Schaltfläche nicht gefunden')
  return found
}

describe('PriceEntryPage', () => {
  it('priceEntryPageShowsThePriceOfEveryProductTest', async () => {
    await render()

    expect(priceFields()).toHaveLength(3)
    // The row with a price of its own carries it; the others stay empty and show what is
    // charged instead.
    expect(priceFields().map((field) => field.value)).toEqual(['', '0.4', ''])
    expect(container.textContent).toContain('Grundpreis')
  })

  it('priceEntryPageMovesDownTheColumnWithTheArrowKeysTest', async () => {
    await render()
    const fields = priceFields()
    fields[0].focus()

    press(fields[0], 'ArrowDown')

    expect(document.activeElement).toBe(fields[1])

    press(fields[1], 'ArrowUp')

    expect(document.activeElement).toBe(fields[0])
  })

  it('priceEntryPageCountsWhatWasTypedTest', async () => {
    await render()

    type(priceFields()[0], '140')

    expect(container.textContent).toContain('1 Preis geändert')
  })

  it('priceEntryPageTakesAFieldBackWithEscapeTest', async () => {
    await render()
    type(priceFields()[1], '0.55')
    expect(container.textContent).toContain('1 Preis geändert')

    press(priceFields()[1], 'Escape')

    expect(priceFields()[1].value).toBe('0.4')
    expect(container.textContent).not.toContain('1 Preis geändert')
  })

  it('priceEntryPageSendsOnlyWhatWasTypedTest', async () => {
    await render()
    type(priceFields()[0], '140')
    type(priceFields()[2], '13.5')

    act(() => saveButton().click())
    await settle()

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      priceGroupId: 3,
      closeOpenEnded: false,
      rows: [
        { productId: 7, price: 140 },
        { productId: 11, price: 13.5 },
      ],
    })
  })

  it('priceEntryPageRefusesAnAmountItCannotReadTest', async () => {
    await render()
    type(priceFields()[0], 'etwa 140')

    act(() => saveButton().click())
    await settle()

    expect(saved).toHaveLength(0)
    expect(container.textContent).toContain('ist keine Zahl')
  })

  it('priceEntryPageShowsTheBarCodeOfARowFoundByItTest', async () => {
    await render()

    type(searchField(), EAN)
    await settle(300)

    // Neither the number nor the name carries what was scanned, so without the code on the
    // row the article looks like an arbitrary hit.
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain(EAN)
  })

  it('priceEntryPageLeavesTheBarCodeOffARowFoundByNameTest', async () => {
    await render()

    type(searchField(), 'kabel')
    await settle(300)

    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).not.toContain(EAN)
  })

  it('priceEntryPageAsksBeforeAChangeThatWouldLoseWhatWasTypedTest', async () => {
    await render()
    type(priceFields()[0], '140')

    const select = container.querySelectorAll('select')[1] as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, '4')
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })))

    expect(container.textContent).toContain('Erfasste Preise verwerfen?')
    // Still counted: nothing is thrown away until the question is answered.
    expect(container.textContent).toContain('1 Preis geändert')
  })
})
