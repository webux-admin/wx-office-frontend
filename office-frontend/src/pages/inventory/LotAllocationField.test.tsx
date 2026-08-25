// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lot, LotProposal, Product, StockBalance, StockLocation } from '../../lib/types'
import { BookStockDialog } from './BookStockDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A product nobody tracks: no number anywhere in the dialog. */
const PLAIN: Product = {
  id: 42,
  productNumber: 'P-001',
  name: 'Schraube',
  productType: 'GOODS',
  unit: 'PIECE',
  vatCategory: 'STANDARD',
  stockManaged: true,
  tracking: 'NONE',
}

/** A product kept in batches, the everyday case for food and chemicals. */
const BATCHED: Product = { ...PLAIN, id: 43, productNumber: 'P-002', name: 'Farbe', tracking: 'LOT' }

/** A product kept piece by piece, each with its own number. */
const SERIALISED: Product = {
  ...PLAIN,
  id: 44,
  productNumber: 'P-003',
  name: 'Messgerät',
  tracking: 'SERIAL',
}

const MAIN: StockLocation = { id: 1, code: 'HAUPT', name: 'Hauptlager', defaultLocation: true }

const BALANCES: StockBalance[] = [
  {
    productId: 43,
    locationId: 1,
    quantity: 12,
    reservedQuantity: 0,
    availableQuantity: 12,
    productName: 'Farbe',
    unitShortName: 'Stk',
  },
]

/** Three of the batch that runs out first, the rest out of the next one. */
const PROPOSAL: LotProposal = {
  lines: [
    {
      lotId: 7,
      lotNumber: 'CH-A',
      expiryDate: '2026-09-30',
      expired: false,
      available: 3,
      proposed: 3,
    },
    {
      lotId: 8,
      lotNumber: 'CH-B',
      expiryDate: '2026-12-31',
      expired: false,
      available: 9,
      proposed: 2,
    },
  ],
  withoutNumber: {
    lotId: null,
    lotNumber: null,
    expiryDate: null,
    expired: false,
    available: 0,
    proposed: 0,
  },
  uncovered: 0,
}

const KNOWN_LOTS: Lot[] = [
  {
    id: 7,
    productId: 43,
    kind: 'LOT',
    lotNumber: 'CH-A',
    expiryDate: '2026-09-30',
    expired: false,
    blocked: false,
    quantity: 3,
    locations: [{ locationId: 1, locationName: 'Hauptlager', quantity: 3 }],
  },
]

let container: HTMLDivElement
let root: Root

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/lot-proposal')
      ? PROPOSAL
      : url.includes('/lots')
        ? { content: KNOWN_LOTS, page: 0, size: 20, totalElements: 1, totalPages: 1, sort: '' }
        : url.includes('/inventory/balances')
          ? BALANCES
          : url.includes('/catalogues')
            ? { 'movement-reason': [{ code: 'RECEIPT', name: 'Wareneingang' }] }
            : url.includes('/products')
              ? { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, sort: '' }
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

/** Renders the booking dialog with a product already taken over, as the product mask opens it. */
async function show(product: Product) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BookStockDialog
          open
          onClose={() => undefined}
          tenantId={TENANT}
          locations={[MAIN]}
          product={product}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
}

/**
 * Lets the requests of the dialog land, so the field has an answer to draw.
 *
 * <p>A macrotask, not only flushed microtasks: the proposal travels through TanStack Query,
 * which schedules its own notification, and the rows are seeded from the answer.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function field(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  const id = found?.getAttribute('for')
  return document.getElementById(id ?? '') as HTMLInputElement
}

function fields(label: string): HTMLInputElement[] {
  return [...document.querySelectorAll('label')]
    .filter((element) => element.textContent?.trim() === label)
    .map((element) => document.getElementById(element.getAttribute('for') ?? ''))
    .filter((element): element is HTMLInputElement => element !== null)
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(input: HTMLInputElement, key: string) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
}

function chips(): string[] {
  return [...document.querySelectorAll('li')]
    .map((element) => element.querySelector('span')?.textContent ?? '')
    .filter((text) => text !== '')
}

describe('LotAllocationField', () => {
  /**
   * The one invariant of the field: while a piece carries no number the button stays dark, and
   * the reason stands next to it before anybody presses it.
   */
  it('lotAllocationFieldBlocksTheBookingWhileOpenTest', async () => {
    await show(BATCHED)

    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    // The line carries the quantity but no number yet, so nothing is allocated: the header,
    // the field and the foot of the dialog all say the same thing.
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 0 · offen 5')
    expect(document.body.textContent).toContain('Jede Zeile braucht eine Charge.')
    expect(document.body.textContent).toContain('5 sind noch keiner Charge zugeordnet.')
    expect(button('Buchen')?.disabled).toBe(true)

    await act(async () => {
      type(field('Chargennummer'), 'CH-2026-04')
    })
    await settle()

    expect(button('Buchen')?.disabled).toBe(false)
  })

  /**
   * The everyday receipt: one delivery, one batch. The quantity is already in the line, so the
   * only thing left to do is the number off the supplier's label.
   */
  it('lotAllocationFieldPrefillsTheBatchLineTest', async () => {
    await show(BATCHED)

    await act(async () => {
      type(field('Menge'), '40')
    })
    await settle()

    const quantities = fields('Menge')
    expect(quantities).toHaveLength(2)
    expect(quantities[1].value).toBe('40')
  })

  /**
   * The everyday issue: the server proposes, the field shows what it proposed, and nothing has
   * to be typed at all.
   */
  it('lotAllocationFieldPrefillsTheProposalTest', async () => {
    await show(BATCHED)

    await act(async () => {
      button('Abgang')?.click()
    })
    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(document.body.textContent).toContain('CH-A')
    expect(document.body.textContent).toContain('CH-B')
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 5 · offen 0')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /** An expiry date is a word on the screen, not only a colour. */
  it('lotAllocationFieldNamesTheExpiryDateTest', async () => {
    await show(BATCHED)

    await act(async () => {
      button('Abgang')?.click()
    })
    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(document.body.textContent).toContain('haltbar bis 30.09.2026')
  })

  /** Scan, Enter, chip — and the field is empty again for the next piece. */
  it('lotAllocationFieldTakesASerialNumberTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    await act(async () => {
      type(field('Seriennummer'), 'SN-4711')
      press(field('Seriennummer'), 'Enter')
    })
    await settle()

    expect(chips()).toContain('SN-4711')
    expect(field('Seriennummer').value).toBe('')
    expect(document.body.textContent).toContain('Es fehlen noch 1 Seriennummern.')
  })

  /** The same label scanned twice is a slip of the hand, not a second piece. */
  it('lotAllocationFieldTakesTheSameSerialNumberOnlyOnceTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    for (const attempt of ['SN-4711', 'SN-4711']) {
      await act(async () => {
        type(field('Seriennummer'), attempt)
        press(field('Seriennummer'), 'Enter')
      })
    }
    await settle()

    expect(chips().filter((chip) => chip === 'SN-4711')).toHaveLength(1)
    expect(document.body.textContent).toContain('Es fehlen noch 1 Seriennummern.')
  })

  /** Backspace in the empty field takes the last number back, as a chip list should. */
  it('lotAllocationFieldRemovesTheLastSerialNumberTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    await act(async () => {
      type(field('Seriennummer'), 'SN-1')
      press(field('Seriennummer'), 'Enter')
    })
    await act(async () => {
      press(field('Seriennummer'), 'Backspace')
    })
    await settle()

    expect(chips()).not.toContain('SN-1')
  })

  /** Every number carries one piece, so the whole quantity is spoken for and the button opens. */
  it('lotAllocationFieldOpensTheButtonWhenEverySerialNumberIsThereTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    for (const number of ['SN-1', 'SN-2']) {
      await act(async () => {
        type(field('Seriennummer'), number)
        press(field('Seriennummer'), 'Enter')
      })
    }
    await settle()

    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /** A product nobody tracks has no number to give, and is asked for none. */
  it('lotAllocationFieldIsAbsentForAnUntrackedProductTest', async () => {
    await show(PLAIN)

    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(field('Chargennummer')).toBeNull()
    expect(field('Seriennummer')).toBeNull()
    expect(button('Buchen')?.disabled).toBe(false)
  })
})
