// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, StockLocation, Stocktake } from '../../lib/types'
import { NewStocktakeDialog } from './NewStocktakeDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', defaultLocation: true }

/** Three stock managed articles, the way the catalogue answers a search. */
const PRODUCTS: Product[] = [
  {
    id: 42,
    productNumber: 'P-100',
    name: 'Schraube M4',
    productType: 'GOODS',
    unit: 'PIECE',
    stockManaged: true,
  },
  {
    id: 43,
    productNumber: 'P-200',
    name: 'Winkel 40',
    productType: 'GOODS',
    unit: 'PIECE',
    stockManaged: true,
  },
  {
    id: 44,
    productNumber: 'P-300',
    name: 'Motor',
    productType: 'GOODS',
    unit: 'PIECE',
    stockManaged: true,
  },
]

/**
 * What the backend answers when a second open list already covers these goods.
 *
 * <p>The wording is the one `StocktakeOverlapException` builds: it names the list in the way
 * and who started it, because «Überschneidung» alone leaves the reader looking for it.
 */
const OVERLAP_DETAIL = 'Diese Ware wird bereits von INV-2026-0001 gezählt (anna)'

let container: HTMLDivElement
let root: Root
/** The body of every POST the dialog sent, in order. */
let posted: Record<string, unknown>[]
/** Set by a test that wants the creation refused with 409 and that detail. */
let refusal: string | null

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    if (options?.method === 'POST' && url.includes('/inventory/stocktakes')) {
      posted.push(JSON.parse(String(options.body)) as Record<string, unknown>)
      if (refusal !== null) return json({ detail: refusal }, 409)
      return json({ id: 99, locationId: MAIN.id, status: 'DRAFT', scope: 'ALL' } as Stocktake)
    }
    if (url.includes('/inventory/locations')) return json([MAIN])
    if (url.includes('/products')) {
      const term = decodeURIComponent(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
      const found = PRODUCTS.filter(
        (product) =>
          term === '' ||
          product.name.toLowerCase().includes(term) ||
          (product.productNumber ?? '').toLowerCase().includes(term),
      )
      return json({
        content: found,
        page: 0,
        size: 20,
        totalElements: found.length,
        totalPages: 1,
        sort: '',
      })
    }
    return json([])
  })
}

beforeEach(() => {
  posted = []
  refusal = null
  stubFetch()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: () => undefined,
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

/** What the dialog handed back, so a test can see what it created. */
type Created = { stocktakes: Stocktake[] }

async function show(): Promise<Created> {
  const created: Created = { stocktakes: [] }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <NewStocktakeDialog
          tenantId={TENANT}
          open
          onClose={() => undefined}
          onCreated={(stocktake) => created.stocktakes.push(stocktake)}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
  return created
}

/** Lets the debounce of the type-ahead and the answer that follows it run out. */
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function control(label: string): HTMLElement | null {
  const found = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  return document.getElementById(found?.getAttribute('for') ?? '')
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function choose(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function press(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

const text = () => document.body.textContent ?? ''

/** Switches the scope to the product selection. */
function pickSelection() {
  choose(control('Umfang') as HTMLSelectElement, 'SELECTION')
}

/** Types a term into the product field and takes the first hit over with Enter. */
async function take(term: string) {
  const field = control('Produkte') as HTMLInputElement
  type(field, term)
  await settle()
  press(field, 'Enter')
}

describe('NewStocktakeDialog', () => {
  /** The whole location is the everyday case, and it has nothing to pick. */
  it('newStocktakeDialogHidesThePickerForTheWholeLocationTest', async () => {
    await show()

    expect(control('Umfang')).not.toBeNull()
    expect(control('Produkte')).toBeNull()
  })

  it('newStocktakeDialogShowsThePickerForASelectionTest', async () => {
    await show()

    pickSelection()

    expect(control('Produkte')).not.toBeNull()
  })

  /**
   * The case the selection exists for: a handful of articles rather than the whole location —
   * the opening stock of a new tenant, or a sample count between two full ones.
   */
  it('newStocktakeDialogCreatesASelectionTest', async () => {
    await show()
    pickSelection()

    await take('Schraube')
    await take('Winkel')
    await act(async () => {
      button('Anlegen')?.click()
    })
    await settle()

    expect(posted).toHaveLength(1)
    expect(posted[0].scope).toBe('SELECTION')
    expect(posted[0].productIds).toEqual([42, 43])
    // Both chosen articles are on screen, so nobody creates a list over the wrong ones.
    expect(text()).toContain('Schraube M4')
    expect(text()).toContain('Winkel 40')
  })

  /** A selection without a single product is nothing to count; the backend refuses it too. */
  it('newStocktakeDialogRefusesASelectionWithoutAProductTest', async () => {
    await show()

    pickSelection()

    expect(button('Anlegen')?.disabled).toBe(true)
  })

  /**
   * The overlap message has to help: it names the list in the way and who started it. What the
   * mask shows is what the backend said — a sentence of its own here would be a second truth.
   */
  it('newStocktakeDialogShowsTheOverlapMessageTest', async () => {
    refusal = OVERLAP_DETAIL
    await show()
    pickSelection()

    await take('Schraube')
    await act(async () => {
      button('Anlegen')?.click()
    })
    await settle()

    expect(text()).toContain(OVERLAP_DETAIL)
    // Nothing was handed on: there is no list to open.
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
  })

  /**
   * A guard rather than a find: the whole location is what the mask could do all along, and it
   * has to keep sending exactly that while the scope switch is new.
   */
  it('newStocktakeDialogCreatesTheWholeLocationTest', async () => {
    const created = await show()

    await act(async () => {
      button('Anlegen')?.click()
    })
    await settle()

    expect(posted).toHaveLength(1)
    expect(posted[0].scope).toBe('ALL')
    expect(posted[0].productIds).toBeUndefined()
    expect(created.stocktakes.map((stocktake) => stocktake.id)).toEqual([99])
  })

  /**
   * The scope exists for articles that never moved — the opening stock of a new tenant. The
   * catalogue therefore offers ones with nothing lying at this location, and the field has to
   * say that picking such an article is meant: it becomes a line with an expected quantity of
   * zero, and the backend writes it (ADR-0070).
   */
  it('newStocktakeDialogSaysAPickedProductWithoutStockIsCountedTest', async () => {
    await show()

    pickSelection()

    expect(text()).toContain('auch solche ohne Bestand an diesem Lagerort')
  })
})
