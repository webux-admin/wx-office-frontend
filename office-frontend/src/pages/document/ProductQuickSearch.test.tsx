// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { originState } from '../../lib/origin'
import type { Product } from '../../lib/types'
import { ProductQuickSearch } from './ProductQuickSearch'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BACK = originState('/auftraege/42', 'Auftrag')

const PRODUCTS: Product[] = [
  {
    id: 7,
    productNumber: 'P-100',
    name: 'Wartung',
    productType: 'SERVICE',
    unit: 'HOUR',
    unitLabel: 'Std',
    revenueAccount: '3400',
    vatCategory: 'STANDARD',
  },
  {
    id: 8,
    productNumber: 'P-200',
    name: 'Wartungsvertrag',
    productType: 'SERVICE',
    unit: 'PIECE',
    unitLabel: 'Stk',
    revenueAccount: '3400',
    vatCategory: 'STANDARD',
  },
  {
    id: 9,
    productNumber: 'K-010',
    name: 'Kabel',
    productType: 'GOODS',
    unit: 'PIECE',
    unitLabel: 'Stk',
    revenueAccount: '3000',
    vatCategory: 'STANDARD',
  },
]

let container: HTMLDivElement
let root: Root
/** Every product request the field sent, in order, so a test can read the search term off it. */
let asked: string[]
/** Every availability request, so a test can count them against the number of hits. */
let availabilityAsked: string[]
/** How long an answer takes, so a test can look at the field while one is on its way. */
let latency = 0
/** Set to refuse every further answer, the way an expired session refuses a refetch. */
let refuseFromNowOn = false
/** Every element the marked hit was scrolled to, so a test can check it happened. */
let scrolledTo: string[]

/**
 * What is free of one product. The two services keep no stock, the cable does — so the hit
 * list shows a figure for one of the three and none for the other two.
 */
function availabilityOf(productId: number) {
  if (productId !== 9) return { productId, stockManaged: false }
  return {
    productId,
    stockManaged: true,
    onHand: 12,
    reserved: 0,
    availableQuantity: 12,
  }
}

/**
 * Answers the catalogue with whatever matches the term, the way the backend does over number
 * and name at once. Caught at `fetch`, not by mocking `lib/api`.
 */
function stubFetch(status = 200) {
  asked = []
  availabilityAsked = []
  latency = 0
  refuseFromNowOn = false
  vi.stubGlobal('fetch', (url: string) => {
    // What is free of the hits on screen. One answer for the whole list, the way the backend
    // reads it: one statement with an IN list. Counted apart from the catalogue requests, so
    // a test can hold the two against each other.
    if (url.includes('/inventory/availability')) {
      availabilityAsked.push(url)
      const ids = (/productIds=([^&]*)/.exec(url)?.[1] ?? '')
        .split(',')
        .filter((id) => id !== '')
        .map(Number)
      return Promise.resolve(
        new Response(JSON.stringify(ids.map(availabilityOf)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    asked.push(url)
    if (refuseFromNowOn) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: 'Kein Zugriff' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    const term = (/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
    const found = PRODUCTS.filter(
      (product) =>
        term === '' ||
        product.name.toLowerCase().includes(decodeURIComponent(term)) ||
        (product.productNumber ?? '').toLowerCase().includes(decodeURIComponent(term)),
    )
    const body =
      status === 200
        ? { content: found, page: 0, size: 20, totalElements: found.length, totalPages: 1, sort: '' }
        : { detail: 'Kein Zugriff' }
    const response = new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
    if (latency === 0) return Promise.resolve(response)
    return new Promise((resolve) => setTimeout(() => resolve(response), latency))
  })
}

/**
 * A session that may read the inventory, which is what the stock figures hang on.
 *
 * <p>The real application always has one; the components ask it before they fire a request
 * that would come back 403 for a user without the right.
 */
function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    can: () => true,
  }
}

beforeEach(() => {
  stubFetch()
  // jsdom knows no scrolling; the field calls it optionally, so a stub is the only way to
  // see whether the marked hit is actually brought into view.
  scrolledTo = []
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value(this: Element) {
      scrolledTo.push(this.id)
    },
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

/** What the field reported back, so a test can check what was chosen. */
type Calls = { chosen: Product[]; withAdd: boolean[] }

function Harness({ calls, chosen = false }: { calls: Calls; chosen?: boolean }) {
  const [term, setTerm] = useState(chosen ? 'P-100 · Wartung' : '')
  const [taken, setTaken] = useState(chosen)
  return (
    <ProductQuickSearch
      tenantId={TENANT}
      term={term}
      onTerm={(typed) => {
        setTerm(typed)
        setTaken(false)
      }}
      chosen={taken}
      onChoose={(product, andAdd) => {
        calls.chosen.push(product)
        calls.withAdd.push(andAdd)
        setTerm(`${product.productNumber} · ${product.name}`)
        setTaken(true)
      }}
      vatOf={(category) => (category === 'STANDARD' ? '8.1 %' : undefined)}
      back={BACK}
    />
  )
}

async function render(chosen = false): Promise<Calls> {
  const calls: Calls = { chosen: [], withAdd: [] }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth()}>
          <QueryClientProvider client={client}>
            <Harness calls={calls} chosen={chosen} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
  return calls
}

/** Lets a stretch of time pass while React works off what it triggers. */
async function wait(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** Waits out the debounce of the field and the answer that follows it. */
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const input = () => container.querySelector('input') as HTMLInputElement
const options = () => [...container.querySelectorAll('[role="option"]')]
const text = () => container.textContent ?? ''

function type(value: string) {
  const control = input()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(key: string, modifier: 'ctrl' | undefined = undefined) {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: modifier === 'ctrl', bubbles: true }),
    )
  })
}

/** What the live region of the open box currently announces. */
const announced = () =>
  container.querySelector('[aria-live="polite"]')?.textContent ?? undefined

describe('ProductQuickSearch', () => {
  it('productQuickSearchShowsWhatWasFoundTest', async () => {
    await render()

    expect(options()).toHaveLength(3)
    expect(text()).toContain('P-100')
    expect(text()).toContain('Wartung')
    // Unit, revenue account and VAT rate stand next to every hit.
    expect(text()).toContain('Std · 3400 · 8.1 %')
  })

  /**
   * The reason the batch endpoint exists. Twenty hits and a search that fires every 200 ms
   * would be twenty round trips per keystroke if every row asked for itself.
   */
  it('productQuickSearchAsksAvailabilityOnceForAllHitsTest', async () => {
    await render()

    expect(options()).toHaveLength(3)
    expect(availabilityAsked).toHaveLength(1)
    expect(availabilityAsked[0]).toContain('productIds=7,8,9')
  })

  it('productQuickSearchShowsNoQuantityForUnmanagedProductsTest', async () => {
    await render()

    // The cable keeps a stock and says so; the two services keep none and say nothing — a
    // «0 verfügbar» next to a service reads as «sold out».
    const rows = options().map((option) => option.textContent ?? '')
    expect(rows[2]).toContain('12 verfügbar')
    expect(rows[0]).not.toContain('verfügbar')
    expect(rows[1]).not.toContain('verfügbar')
  })

  it('productQuickSearchAsksTheServerForTheTermTest', async () => {
    await render()
    type('wartung')
    await settle()

    expect(asked.at(-1)).toContain('search=wartung')
    expect(asked.at(-1)).toContain('activeOnly=true')
    // Twenty at a time, not the whole catalogue.
    expect(asked.at(-1)).toContain('size=20')
    expect(options()).toHaveLength(2)
  })

  it('productQuickSearchHoldsTheSearchBackWhileTypingTest', async () => {
    await render()
    const before = asked.length

    type('w')
    type('wa')
    type('war')

    // Nothing stood still yet, so no request has gone out for any of the three.
    expect(asked.length).toBe(before)

    await settle()

    expect(asked.length).toBe(before + 1)
    expect(asked.at(-1)).toContain('search=war')
  })

  it('productQuickSearchKeepsTheLastHitsWhileSearchingTest', async () => {
    await render()
    latency = 200

    type('kabel')
    await wait(250)

    // The answer is still on its way. Emptying the list now would make it flicker exactly
    // while it is being read.
    expect(options()).toHaveLength(3)

    await wait(250)

    expect(options()).toHaveLength(1)
  })

  it('productQuickSearchMarksTheTermInAHitTest', async () => {
    await render()
    type('wartung')
    await settle()

    const marked = [...container.querySelectorAll('mark')].map((one) => one.textContent)
    expect(marked).toContain('Wartung')
  })

  it('productQuickSearchIsAComboboxTest', async () => {
    await render()

    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
    expect(input().getAttribute('aria-controls')).toBe(
      container.querySelector('[role="listbox"]')?.id,
    )
    // The first hit is marked, so Enter takes it without an arrow key first.
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id)
  })

  it('productQuickSearchMovesTheMarkWithTheArrowKeysTest', async () => {
    await render()
    act(() => input().focus())

    press('ArrowDown')

    expect(options()[1].getAttribute('aria-selected')).toBe('true')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id)
    // The focus never leaves the field, so typing goes on where it left off.
    expect(document.activeElement).toBe(input())

    press('ArrowUp')

    expect(options()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('productQuickSearchWrapsAtTheEndsTest', async () => {
    await render()

    press('ArrowUp')

    expect(options()[2].getAttribute('aria-selected')).toBe('true')
  })

  it('productQuickSearchTakesTheMarkedHitWithEnterTest', async () => {
    const calls = await render()

    press('ArrowDown')
    press('Enter')

    expect(calls.chosen.map((product) => product.id)).toEqual([8])
    // Taken over, so the list is out of the way again.
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(input().getAttribute('aria-expanded')).toBe('false')
  })

  it('productQuickSearchTakesAHitOnClickTest', async () => {
    const calls = await render()

    act(() => {
      ;(options()[2] as HTMLElement).click()
    })

    expect(calls.chosen.map((product) => product.id)).toEqual([9])
  })

  it('productQuickSearchWithoutAHitTest', async () => {
    await render()
    type('Zahnrad')
    await settle()

    expect(options()).toHaveLength(0)
    expect(text()).toContain('«Zahnrad» gibt es keinen Treffer')
    // The way on is offered right where the search failed.
    expect(text()).toContain('In der Produktmaske suchen')
  })

  it('productQuickSearchWithARefusedCatalogueTest', async () => {
    stubFetch(403)
    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Der Produktkatalog konnte nicht gelesen werden.',
    )
  })

  it('productQuickSearchLinksIntoTheProductMaskWithTheTermTest', async () => {
    await render()
    type('wartung')
    await settle()

    const link = container.querySelector('a') as HTMLAnchorElement
    expect(link.textContent).toBe('In der Produktmaske suchen')
    expect(link.getAttribute('href')).toBe('/produkte?suche=wartung')
  })

  it('productQuickSearchRefusesEnterOnHitsOfThePreviousTermTest', async () => {
    const calls = await render()
    latency = 200

    type('kabel')
    await wait(250)

    // The debounce is over and the request is out, but the rows on screen are still those of
    // the empty term. Enter here used to take "Wartung" for somebody who typed "kabel".
    expect(options()).toHaveLength(3)
    press('Enter')

    expect(calls.chosen).toEqual([])

    await wait(250)
    press('Enter')

    expect(calls.chosen.map((product) => product.name)).toEqual(['Kabel'])
  })

  it('productQuickSearchRefusesEnterAfterARefusedRefetchTest', async () => {
    const calls = await render()
    refuseFromNowOn = true

    type('kabel')
    await settle()

    // The refusal is on screen, and the rows of the last answer are not offered any more.
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(options()).toHaveLength(0)

    press('Enter')

    expect(calls.chosen).toEqual([])
  })

  it('productQuickSearchClaimsNoListboxWithoutOneTest', async () => {
    stubFetch(403)
    await render()

    // Otherwise a screen reader is told about an open list with an active entry, and there
    // is neither.
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(input().getAttribute('aria-controls')).toBeNull()
    expect(input().getAttribute('aria-activedescendant')).toBeNull()
  })

  it('productQuickSearchClaimsNoListboxWithoutAHitTest', async () => {
    await render()
    type('Zahnrad')
    await settle()

    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(input().getAttribute('aria-controls')).toBeNull()
    expect(input().getAttribute('aria-activedescendant')).toBeNull()
  })

  it('productQuickSearchAnnouncesTheEmptyResultTest', async () => {
    await render()

    expect(announced()).toBe('3 Treffer')

    type('Zahnrad')
    await settle()

    // The same region, with other words: a region inserted together with its text is not a
    // change, and a screen reader stays silent on it.
    expect(announced()).toBe('Kein Treffer')
  })

  it('productQuickSearchScrollsTheMarkedHitIntoViewTest', async () => {
    await render()
    scrolledTo = []

    press('ArrowDown')
    press('ArrowDown')

    expect(scrolledTo).toEqual([options()[1].id, options()[2].id])
  })

  it('productQuickSearchTakesAHitWithControlEnterAndAsksForItToBeAddedTest', async () => {
    const calls = await render()

    press('Enter', 'ctrl')

    expect(calls.chosen.map((product) => product.id)).toEqual([7])
    // The dialog is told that the shortcut asked for more than taking the hit over.
    expect(calls.withAdd).toEqual([true])
  })

  it('productQuickSearchLeavesTheListShutForAChosenProductTest', async () => {
    await render(true)

    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(input().getAttribute('aria-expanded')).toBe('false')

    // Typing gives the product up and opens the list again.
    type('kabel')
    await settle()

    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('productQuickSearchDoesNotOpenTheListWithTheLabelOfAChosenProductTest', async () => {
    await render(true)
    const before = asked.length

    press('ArrowDown')
    await settle()

    // The field carries "P-100 · Wartung", which is a label and not a search term.
    // Searching for it reports no hit for a product that plainly exists.
    expect(asked.length).toBe(before)
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(text()).not.toContain('gibt es keinen Treffer')
  })

  it('productQuickSearchWithAnEmptyCatalogueTest', async () => {
    // Every product deactivated: the query runs with activeOnly=true, so an empty answer
    // says nothing about whether the catalogue itself is empty.
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [],
            page: 0,
            size: 20,
            totalElements: 0,
            totalPages: 0,
            sort: '',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    await render()

    expect(text()).toContain('Kein aktives Produkt im Katalog.')
  })
})
