// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product, StockBalance, StockLocation } from '../../lib/types'
import { BookStockDialog } from './BookStockDialog'

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

const MAIN: StockLocation = { id: 1, code: 'HAUPT', name: 'Hauptlager', defaultLocation: true }
const OUTER: StockLocation = { id: 2, code: 'AUSSEN', name: 'Aussenlager' }

/** Twelve pieces at the main location, nothing anywhere else. */
const BALANCES: StockBalance[] = [
  {
    productId: 42,
    locationId: 1,
    quantity: 12,
    reservedQuantity: 0,
    availableQuantity: 12,
    productName: 'Schraube',
    unitShortName: 'Stk',
  },
]

let container: HTMLDivElement
let root: Root

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/inventory/balances')
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

/** Renders the dialog with a product already taken over, as the product mask opens it. */
async function show(locations: StockLocation[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BookStockDialog
          open
          onClose={() => undefined}
          tenantId={TENANT}
          locations={locations}
          product={SCREW}
        />
      </QueryClientProvider>,
    )
  })
  // Lets the balance request settle, so the preview has numbers to work with.
  await act(async () => {
    await Promise.resolve()
  })
}

function field(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  const id = found?.getAttribute('for')
  return document.getElementById(id ?? '') as HTMLInputElement
}

function select(label: string): HTMLSelectElement {
  return field(label) as unknown as HTMLSelectElement
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function choose(element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  )?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
}

describe('BookStockDialog', () => {
  /** The one chance to see a mistake before the row becomes unchangeable. */
  it('bookStockDialogShowsThePreviewLineTest', async () => {
    await show([MAIN, OUTER])

    await act(async () => {
      type(field('Menge'), '8')
    })

    expect(document.body.textContent).toContain('Hauptlager: 12 → 20')
  })

  /** A typed minus never reaches the field: the sign is made by the operation. */
  it('bookStockDialogKeepsTheQuantityPositiveTest', async () => {
    await show([MAIN, OUTER])

    await act(async () => {
      type(field('Menge'), '-3')
    })

    expect(field('Menge').value).toBe('3')
    expect(document.body.textContent).toContain('Hauptlager: 12 → 15')
  })

  /** One location is nothing to choose, so the field is not drawn at all. */
  it('bookStockDialogHidesTheLocationWithOneLocationTest', async () => {
    await show([MAIN])

    expect(field('Lagerort')).toBeNull()

    await act(async () => {
      type(field('Menge'), '8')
    })
    // It still books against the default location, which the preview line proves.
    expect(document.body.textContent).toContain('Hauptlager: 12 → 20')
  })

  /** Below zero at a location that warns: a yellow line and a second press, not a stop. */
  it('bookStockDialogOffersBookAnywayOnWarningTest', async () => {
    await show([MAIN, OUTER])

    await act(async () => {
      button('Abgang')?.click()
    })
    await act(async () => {
      type(field('Menge'), '20')
    })

    expect(document.body.textContent).toContain('Hauptlager steht danach auf -8.')
    expect(button('Buchen')).toBeDefined()

    await act(async () => {
      button('Buchen')?.click()
    })

    expect(button('Trotzdem buchen')).toBeDefined()
  })

  /**
   * A scanned code nothing matches: the field keeps it so it can be corrected, and the mask
   * says what happened instead of leaving the reader with an empty product field.
   */
  it('barcodeScannerUnknownCodeShowsMessageTest', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
      },
    })
    ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
      detect() {
        return Promise.resolve([{ rawValue: '7612345678901' }])
      }
    }
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await show([MAIN, OUTER])

    const camera = [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === 'Mit der Kamera scannen',
    )
    await act(async () => {
      camera?.click()
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(300)
    })
    // The lookup answers an empty page, which is what the stub does for /products.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('Kein Artikel zu 7612345678901 gefunden.')
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
    vi.useRealTimers()
  })

  /** A transfer onto the location it starts from cannot be sent at all. */
  it('bookStockDialogBlocksSameLocationTransferTest', async () => {
    await show([MAIN, OUTER])

    await act(async () => {
      button('Umlagerung')?.click()
    })
    await act(async () => {
      type(field('Menge'), '5')
    })
    await act(async () => {
      choose(select('Nach'), '1')
    })

    expect(button('Buchen')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('Quelle und Ziel müssen verschieden sein.')

    await act(async () => {
      choose(select('Nach'), '2')
    })

    expect(button('Buchen')?.disabled).toBe(false)
  })
})
