// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentLine, SalesDocument } from '../../lib/types'
import { OrderLines } from './OrderLines'
import type { FreeLine, ProductLine, StructureLine } from './lineForm'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** What the selection endpoints answer, so the mask has its labels. */
const CATALOGUES = {
  'line-kind': [
    { code: 'ITEM', name: 'Position' },
    { code: 'COMMENT', name: 'Kommentar' },
    { code: 'SUBTOTAL', name: 'Zwischentotal' },
    { code: 'PAGE_BREAK', name: 'Seitenwechsel' },
  ],
  'vat-category': [{ code: 'STANDARD', name: 'Normalsatz' }],
}

const UNITS = [{ code: 'PIECE', name: 'Stück', shortName: 'Stk', isDefault: true }]

const PRODUCTS = {
  content: [
    { id: 7, productNumber: 'P-100', name: 'Wartung', productType: 'SERVICE', unit: 'PIECE' },
    // Marked as not discountable after a line had already been written with a discount.
    {
      id: 8,
      productNumber: 'P-200',
      name: 'Sonderteil',
      productType: 'GOODS',
      unit: 'PIECE',
      discountable: false,
    },
  ],
  page: 0,
  size: 200,
  totalElements: 2,
  totalPages: 1,
  sort: '',
}

/** One line, with only what the test cares about spelled out. */
function line(fields: Partial<DocumentLine> & { lineNumber: number }): DocumentLine {
  return {
    kind: 'ITEM',
    priceIncludesVat: false,
    lineNet: 0,
    lineVat: 0,
    lineGross: 0,
    ...fields,
  }
}

const LINES: DocumentLine[] = [
  line({
    lineNumber: 1,
    kind: 'ITEM',
    description: 'Wartung Serverraum',
    quantity: 3,
    unit: 'PIECE',
    unitPrice: 250,
    discountPercent: 10,
    vatRate: 8.1,
    lineNet: 675,
  }),
  line({ lineNumber: 2, kind: 'COMMENT', description: 'Arbeiten ausserhalb der Bürozeiten' }),
  line({
    lineNumber: 3,
    kind: 'SUBTOTAL',
    subtotalNet: 675,
    subtotalVat: 54.68,
    subtotalGross: 729.68,
  }),
  line({ lineNumber: 4, kind: 'PAGE_BREAK' }),
  line({
    lineNumber: 5,
    kind: 'ITEM',
    productId: 7,
    productNumber: 'P-100',
    description: 'Ersatzteil',
    quantity: 1,
    unit: 'PIECE',
    unitPrice: 80,
    discountAmount: 5,
    vatRate: 8.1,
    lineNet: 75,
  }),
]

function order(lines: DocumentLine[]): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    currency: 'CHF',
    totalNet: 750,
    totalVat: 60.75,
    totalGross: 810.75,
    lines,
  }
}

let container: HTMLDivElement
let root: Root

/**
 * Answers the three selection requests the mask makes.
 *
 * <p>Caught at `fetch`, not by mocking `lib/api`: what the mask sends is a request with a
 * session cookie and a CSRF header, and that is worth going through.
 */
function stubFetch() {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(answer(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

/** What each of the endpoints the mask reads answers with. */
function answer(url: string): unknown {
  if (url.includes('/catalogues')) return CATALOGUES
  if (url.includes('/units')) return UNITS
  if (url.includes('/vat-rates')) return { STANDARD: 8.1 }
  if (url.includes('/price?')) return { productId: 7, partnerId: 3, price: 80, origin: 'BASE', includesVat: false }
  const single = /\/products\/(\d+)/.exec(url)
  if (single) return PRODUCTS.content.find((product) => String(product.id) === single[1])
  if (url.includes('/products')) return PRODUCTS
  return {}
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

/** What the mask reports back, so a test can check what was sent where. */
type Calls = {
  added: ProductLine[]
  updatedProduct: { lineNumber: number; line: ProductLine }[]
  addedFree: FreeLine[]
  updatedFree: { lineNumber: number; line: FreeLine }[]
  addedStructure: StructureLine[]
  updatedStructure: { lineNumber: number; line: StructureLine }[]
  moved: { lineNumber: number; position: number }[]
  removed: number[]
}

/** How the mask is put on screen for one test. */
type Setup = {
  editable?: boolean
  /** True where every line change is refused, the way the backend refuses one. */
  refused?: boolean
  /** What the panel says instead of nothing when the write right is missing. */
  readOnlyNote?: string
  /** What is shown under the table and at the head of an open dialog. */
  error?: unknown
}

async function render(lines: DocumentLine[], setup: Setup = {}): Promise<Calls> {
  const { editable = true, refused = false, readOnlyNote, error = null } = setup
  const calls: Calls = {
    added: [],
    updatedProduct: [],
    addedFree: [],
    updatedFree: [],
    addedStructure: [],
    updatedStructure: [],
    moved: [],
    removed: [],
  }
  // What the mask waits for before it closes a dialog. A refusal has to leave it open.
  const answer = () =>
    refused ? Promise.reject(new Error('Menge darf nicht null sein')) : Promise.resolve()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OrderLines
          tenantId={TENANT}
          order={order(lines)}
          editable={editable}
          onAddProductLine={(payload) => {
            calls.added.push(payload)
            return answer()
          }}
          onUpdateProductLine={(lineNumber, payload) => {
            calls.updatedProduct.push({ lineNumber, line: payload })
            return answer()
          }}
          onAddFreeLine={(payload) => {
            calls.addedFree.push(payload)
            return answer()
          }}
          onUpdateFreeLine={(lineNumber, payload) => {
            calls.updatedFree.push({ lineNumber, line: payload })
            return answer()
          }}
          onAddStructureLine={(payload) => {
            calls.addedStructure.push(payload)
            return answer()
          }}
          onUpdateStructureLine={(lineNumber, payload) => {
            calls.updatedStructure.push({ lineNumber, line: payload })
            return answer()
          }}
          onMoveLine={(lineNumber, position) => calls.moved.push({ lineNumber, position })}
          onRemoveLine={(lineNumber) => calls.removed.push(lineNumber)}
          busy={false}
          error={error}
            readOnlyNote={readOnlyNote}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
  await settle()
  return calls
}

/** Waits out the fade of a dialog, which is only taken out of the tree when it is over. */
async function fadeOut() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
}

/** Waits until the selection lists have arrived and the mask has drawn them. */
async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function text(): string {
  return container.textContent ?? ''
}

function byLabel(label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (!found) throw new Error(`Kein Element mit der Beschriftung "${label}"`)
  return found
}

function byText(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

/** The control a form label points at. */
function field(label: string): HTMLInputElement | HTMLSelectElement {
  const owner = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const id = owner?.getAttribute('for')
  const control = id ? container.querySelector<HTMLInputElement>(`[id="${id}"]`) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control
}

function click(element: HTMLElement) {
  act(() => {
    element.click()
  })
}

/** Presses a key on an element the way a browser does, so React sees it bubble up. */
function press(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(control: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

describe('OrderLines', () => {
  it('orderLinesShowsEveryKindOfLineTest', async () => {
    await render(LINES)

    expect(text()).toContain('Wartung Serverraum')
    expect(text()).toContain('Arbeiten ausserhalb der Bürozeiten')
    // The subtotal is the backend's figure, shown with its caption from the catalogue.
    expect(text()).toContain('Zwischentotal')
    expect(text()).toContain('675.00')
    expect(text()).toContain('Seitenwechsel')
  })

  it('orderLinesShowsBothKindsOfDiscountTest', async () => {
    await render(LINES)

    expect(text()).toContain('10 %')
    expect(text()).toContain('5.00 CHF')
  })

  it('orderLinesWithoutLinesTest', async () => {
    await render([])

    expect(text()).toContain('Noch keine Position')
    expect(text()).toContain('lässt sich nicht ausstellen')
  })

  it('orderLinesWhenIssuedTest', async () => {
    await render(LINES, { editable: false })

    expect(text()).toContain('Wartung Serverraum')
    expect(container.querySelector('[aria-label="Position 1 bearbeiten"]')).toBeNull()
    expect(container.querySelector('[aria-label="Position 1 verschieben"]')).toBeNull()
  })

  it('orderLinesMovesALineTest', async () => {
    const calls = await render(LINES)

    press(byLabel('Position 2 verschieben'), 'ArrowUp')

    expect(calls.moved).toEqual([{ lineNumber: 2, position: 1 }])
  })

  it('orderLinesCannotMoveTheFirstLineUpTest', async () => {
    const calls = await render(LINES)

    press(byLabel('Position 1 verschieben'), 'ArrowUp')
    press(byLabel('Position 5 verschieben'), 'ArrowDown')

    expect(calls.moved).toEqual([])
  })

  it('orderLinesRemovesALineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 2 entfernen'))
    click(byText('Entfernen'))

    expect(calls.removed).toEqual([2])
  })

  it('orderLinesAsksBeforeRemovingALineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 2 entfernen'))

    // One click is not a deletion: the line is gone for good and takes its discount, its
    // period of supply and its text with it.
    expect(calls.removed).toEqual([])
    expect(text()).toContain('Position entfernen')
    expect(text()).toContain('Rückgängig machen lässt sich das nicht.')

    click(byText('Abbrechen'))

    expect(calls.removed).toEqual([])
  })

  it('orderLinesEditsAFreeLineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 1 bearbeiten'))

    expect(text()).toContain('Freie Position bearbeiten')
    expect((field('Bezeichnung') as HTMLInputElement).value).toBe('Wartung Serverraum')
    expect((field('Menge') as HTMLInputElement).value).toBe('3')
    expect((field('Rabatt in Prozent') as HTMLInputElement).value).toBe('10')

    click(byText('Übernehmen'))

    expect(calls.updatedFree).toHaveLength(1)
    expect(calls.updatedFree[0].lineNumber).toBe(1)
    expect(calls.updatedFree[0].line.description).toBe('Wartung Serverraum')
    expect(calls.updatedFree[0].line.discountPercent).toBe(10)
  })

  it('orderLinesEditsACatalogueLineTest', async () => {
    await render(LINES)

    click(byLabel('Position 5 bearbeiten'))

    expect(text()).toContain('Position bearbeiten')
    // The field names what is on the line, not what the catalogue calls the product today.
    expect((field('Produkt') as HTMLInputElement).value).toBe('P-100 · Ersatzteil')
    expect((field('Rabatt als Betrag') as HTMLInputElement).value).toBe('5')
  })

  it('orderLinesLocksTheOtherDiscountFieldTest', async () => {
    await render(LINES)
    click(byText('Freie Zeile'))

    type(field('Rabatt in Prozent') as HTMLInputElement, '12')

    expect((field('Rabatt als Betrag') as HTMLInputElement).disabled).toBe(true)
  })

  it('orderLinesEmptiesTheOtherDiscountFieldTest', async () => {
    await render(LINES)
    click(byLabel('Position 5 bearbeiten'))

    type(field('Rabatt in Prozent') as HTMLInputElement, '12')

    expect((field('Rabatt als Betrag') as HTMLInputElement).value).toBe('')
  })

  it('orderLinesAddsACommentTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    type(field('Text') as HTMLInputElement, 'Lieferung frei Haus')
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([{ kind: 'COMMENT', text: 'Lieferung frei Haus' }])
  })

  it('orderLinesRefusesACommentWithoutTextTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([])
    expect(text()).toContain('Eine Kommentarzeile braucht einen Text.')
  })

  it('orderLinesAddsAPageBreakWithoutTextTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    type(field('Zeilenart') as HTMLSelectElement, 'PAGE_BREAK')
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([{ kind: 'PAGE_BREAK', text: undefined }])
    expect(text()).toContain('Ein Seitenwechsel trägt keinen Text.')
  })

  it('orderLinesEditsAStructureLineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 3 bearbeiten'))
    expect((field('Zeilenart') as HTMLSelectElement).value).toBe('SUBTOTAL')

    type(field('Beschriftung') as HTMLInputElement, 'Zwischensumme Material')
    click(byText('Übernehmen'))

    expect(calls.updatedStructure).toEqual([
      { lineNumber: 3, line: { kind: 'SUBTOTAL', text: 'Zwischensumme Material' } },
    ])
  })

  it('orderLinesKeepsTheDialogOpenWhenTheLineIsRefusedTest', async () => {
    const calls = await render(LINES, { refused: true })

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    click(byText('Hinzufügen'))
    await settle()
    await fadeOut()

    // The backend said no, so everything that was typed has to still be there.
    expect(calls.addedFree).toHaveLength(1)
    expect(text()).toContain('Freie Position')
    expect((field('Bezeichnung') as HTMLInputElement).value).toBe('Beratung')
    expect((field('Einzelpreis') as HTMLInputElement).value).toBe('50')
  })

  it('orderLinesClosesTheDialogWhenTheLineIsTakenTest', async () => {
    await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    click(byText('Hinzufügen'))
    await settle()
    await fadeOut()

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('orderLinesShowsWhyALineWasRefusedInTheDialogTest', async () => {
    await render(LINES, { error: new Error('quantity must not be zero') })

    click(byText('Freie Zeile'))

    expect(text()).toContain('quantity must not be zero')
  })

  it('orderLinesRefusesAQuantityOfZeroTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    type(field('Menge') as HTMLInputElement, '0')

    expect(byText('Hinzufügen').disabled).toBe(true)
    expect(text()).toContain('Die Menge darf nicht null sein.')

    click(byText('Hinzufügen'))

    expect(calls.addedFree).toEqual([])
  })

  it('orderLinesRefusesADiscountOverAHundredTest', async () => {
    await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    type(field('Rabatt in Prozent') as HTMLInputElement, '150')

    expect(byText('Hinzufügen').disabled).toBe(true)
    expect(text()).toContain('Der Rabatt liegt zwischen 0 und 100 Prozent.')
  })

  it('orderLinesWarnsWhenAStoredDiscountIsDroppedTest', async () => {
    await render([
      line({
        lineNumber: 1,
        productId: 8,
        productNumber: 'P-200',
        description: 'Sonderteil',
        quantity: 3,
        unit: 'PIECE',
        unitPrice: 50,
        discountPercent: 10,
        lineNet: 135,
      }),
    ])

    click(byLabel('Position 1 bearbeiten'))
    // The dialog reads the product of the line when it opens; whether it may be discounted
    // is the answer to that request.
    await settle()

    // The figure is still in the field but is not sent any more; saying nothing would let the
    // amount of the line rise without a word.
    expect((field('Rabatt in Prozent') as HTMLInputElement).value).toBe('10')
    expect(text()).toContain('Der gespeicherte Rabatt entfällt beim Übernehmen')
  })

  it('orderLinesExplainsAMissingWriteRightTest', async () => {
    await render(LINES, {
      editable: false,
      readOnlyNote: 'Zum Ändern der Positionen fehlt das Recht ORDER_WRITE.',
    })

    expect(text()).toContain('fehlt das Recht ORDER_WRITE')
  })

  it('orderLinesShowsAStoredServiceDateTest', async () => {
    await render([
      line({
        lineNumber: 1,
        description: 'Wartung',
        quantity: 1,
        unit: 'PIECE',
        unitPrice: 100,
        serviceDateFrom: '2023-12-20',
        lineNet: 100,
      }),
    ])

    click(byLabel('Position 1 bearbeiten'))

    // The day of supply decides the VAT rate, so a stored one must not sit behind a fold.
    expect(byText('Weitere Angaben').getAttribute('aria-expanded')).toBe('true')
    expect((field('Leistung von') as HTMLInputElement).value).toBe('2023-12-20')
  })

  it('orderLinesKeepsTheServiceDatesOutOfTheWayTest', async () => {
    await render(LINES)

    click(byText('Freie Zeile'))

    // Still there — the day of supply decides the VAT rate — but folded away.
    const more = byText('Weitere Angaben')
    expect(more.getAttribute('aria-expanded')).toBe('false')

    click(more)

    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(field('Leistung von')).toBeTruthy()
  })
})
