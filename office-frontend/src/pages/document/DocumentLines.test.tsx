// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ORDER_KIND } from '../../lib/salesDocument'
import type { DocumentLine, SalesDocument } from '../../lib/types'
import { DocumentLines } from './DocumentLines'
import type { FreeLine, ProductLine, StructureLine } from './lineForm'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

// Which of the four kinds it is only decides the way back out of a position dialog.

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

function salesDocument(
  lines: DocumentLine[],
  subtotalsIncludeVat: boolean,
  pricesIncludeVat: boolean,
): SalesDocument {
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
    subtotalsIncludeVat,
    pricesIncludeVat,
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
  /** True while a change to a line is on its way and its answer is still to come. */
  busy?: boolean
  /** True where every line change is refused, the way the backend refuses one. */
  refused?: boolean
  /** What the panel says instead of nothing when the write right is missing. */
  readOnlyNote?: string
  /** What is shown under the table and at the head of an open dialog. */
  error?: unknown
  /** True where the subtotals of the document lead with the gross amount. */
  subtotalsIncludeVat?: boolean
  /** True where every charged line is priced gross, the way a gross price group prices it. */
  pricesIncludeVat?: boolean
}

async function render(lines: DocumentLine[], setup: Setup = {}): Promise<Calls> {
  const {
    editable = true,
    busy = false,
    refused = false,
    readOnlyNote,
    error = null,
    subtotalsIncludeVat = false,
    pricesIncludeVat = false,
  } = setup
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
          <DocumentLines
          tenantId={TENANT}
          kind={ORDER_KIND}
          document={salesDocument(lines, subtotalsIncludeVat, pricesIncludeVat)}
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
          busy={busy}
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

/** The checkbox a label points at, so a test can read whether it is ticked. */
function checkbox(label: string): HTMLInputElement {
  const control = field(label)
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`"${label}" ist kein Kontrollkästchen`)
  }
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

describe('DocumentLines', () => {
  it('documentLinesShowsEveryKindOfLineTest', async () => {
    await render(LINES)

    expect(text()).toContain('Wartung Serverraum')
    expect(text()).toContain('Arbeiten ausserhalb der Bürozeiten')
    // The subtotal is the backend's figure, shown with its caption from the catalogue.
    expect(text()).toContain('Zwischentotal')
    expect(text()).toContain('675.00')
    expect(text()).toContain('Seitenwechsel')
  })

  it('documentLinesShowsBothKindsOfDiscountTest', async () => {
    await render(LINES)

    expect(text()).toContain('10 %')
    expect(text()).toContain('5.00 CHF')
  })

  it('documentLinesWithoutLinesTest', async () => {
    await render([])

    expect(text()).toContain('Noch keine Position')
    expect(text()).toContain('lässt sich nicht ausstellen')
  })

  it('documentLinesWhenIssuedTest', async () => {
    await render(LINES, { editable: false })

    expect(text()).toContain('Wartung Serverraum')
    expect(container.querySelector('[aria-label="Position 1 bearbeiten"]')).toBeNull()
    expect(container.querySelector('[aria-label="Position 1 verschieben"]')).toBeNull()
  })

  it('documentLinesMovesALineTest', async () => {
    const calls = await render(LINES)

    press(byLabel('Position 2 verschieben'), 'ArrowUp')

    expect(calls.moved).toEqual([{ lineNumber: 2, position: 1 }])
  })

  it('documentLinesCannotMoveTheFirstLineUpTest', async () => {
    const calls = await render(LINES)

    press(byLabel('Position 1 verschieben'), 'ArrowUp')
    press(byLabel('Position 5 verschieben'), 'ArrowDown')

    expect(calls.moved).toEqual([])
  })

  it('documentLinesRemovesALineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 2 entfernen'))
    click(byText('Entfernen'))

    expect(calls.removed).toEqual([2])
  })

  it('documentLinesAsksBeforeRemovingALineTest', async () => {
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

  it('documentLinesOpensNoDialogOverALineWhileAChangeRunsTest', async () => {
    const calls = await render(LINES, { busy: true })

    click(byLabel('Position 2 entfernen'))
    click(byLabel('Position 1 bearbeiten'))

    // The bug this pins down: a dialog carries the line as this render numbers it, and the
    // backend numbers the lines afresh with every change. Asked while the removal of the
    // first line was still running, the question read "Position 3" and, by the time its
    // button came free, took the line that had moved up into position 3 off the document.
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(calls.removed).toEqual([])
  })

  it('documentLinesAddsAFreeLineOnceOnADoubleClickTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    const add = byText('Hinzufügen')
    click(add)
    click(add)

    // Both presses land in the same tick, which is where the second click of a double click
    // lands when the backend is quick. On a document an amount is a statement, and a
    // statement must not stand there twice.
    expect(calls.addedFree).toHaveLength(1)
  })

  it('documentLinesAddsAFreeLineOnceWhileTheBoxFadesOutTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    const add = byText('Hinzufügen')
    click(add)
    await settle()

    // The backend has answered and the box has been told to go, but it is still on screen for
    // as long as it fades — with the button of the render before, which is not locked.
    expect(container.contains(add)).toBe(true)
    click(add)

    expect(calls.addedFree).toHaveLength(1)
  })

  it('documentLinesAddsAnotherFreeLineAfterTheFirstOneTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    click(byText('Hinzufügen'))
    await settle()
    await fadeOut()

    // One press per opened dialog, not one per document: opening the dialog again starts over.
    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Anfahrt')
    type(field('Einzelpreis') as HTMLInputElement, '90')
    click(byText('Hinzufügen'))

    expect(calls.addedFree).toHaveLength(2)
    expect(calls.addedFree[1].description).toBe('Anfahrt')
  })

  it('documentLinesSendsACorrectedFreeLineAfterARefusalTest', async () => {
    const calls = await render(LINES, { refused: true })

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    click(byText('Hinzufügen'))
    await settle()

    // The backend said no, so the dialog stayed open with everything in it. The lock on a
    // second press has to come off with the refusal, or the message in the dialog names
    // something nobody can put right any more.
    type(field('Einzelpreis') as HTMLInputElement, '60')
    click(byText('Hinzufügen'))

    expect(calls.addedFree).toHaveLength(2)
    expect(calls.addedFree[1].unitPrice).toBe(60)
  })

  it('documentLinesAddsAStructureLineOnceOnADoubleClickTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    type(field('Text') as HTMLInputElement, 'Lieferung frei Haus')
    const insert = byText('Einfügen')
    click(insert)
    click(insert)

    expect(calls.addedStructure).toEqual([{ kind: 'COMMENT', text: 'Lieferung frei Haus' }])
  })

  it('documentLinesAddsACatalogueLineOnceOnADoubleClickTest', async () => {
    const calls = await render(LINES)

    click(byText('Aus Katalog'))
    await settle()
    press(field('Produkt') as HTMLInputElement, 'Enter')
    const add = byText('Hinzufügen')
    click(add)
    click(add)

    expect(calls.added).toHaveLength(1)
  })

  it('documentLinesRemovesALineOnceOnADoubleClickTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 2 entfernen'))
    const remove = byText('Entfernen')
    click(remove)
    click(remove)

    // The second press reads the line of the render before it, and the lines below have moved
    // up by then — it would take a different one off the document than the one asked about.
    expect(calls.removed).toEqual([2])
  })

  it('documentLinesRemovesAnotherLineAfterTheFirstOneTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 2 entfernen'))
    click(byText('Entfernen'))
    await fadeOut()
    click(byLabel('Position 4 entfernen'))
    click(byText('Entfernen'))

    expect(calls.removed).toEqual([2, 4])
  })

  it('documentLinesEditsAFreeLineTest', async () => {
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

  it('documentLinesEditsACatalogueLineTest', async () => {
    await render(LINES)

    click(byLabel('Position 5 bearbeiten'))

    expect(text()).toContain('Position bearbeiten')
    // The field names what is on the line, not what the catalogue calls the product today.
    expect((field('Produkt') as HTMLInputElement).value).toBe('P-100 · Ersatzteil')
    expect((field('Rabatt als Betrag') as HTMLInputElement).value).toBe('5')
  })

  it('documentLinesStartsAFreeLineOnThePriceBaseOfTheDocumentTest', async () => {
    const calls = await render(LINES, { subtotalsIncludeVat: true, pricesIncludeVat: true })

    click(byText('Freie Zeile'))

    // The document knows how it is priced, and it is the mask that has to say so — a net
    // line slipped into a gross document drops every subtotal on it by the VAT.
    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(true)

    type(field('Bezeichnung'), 'Reisespesen')
    type(field('Einzelpreis'), '120')
    click(byText('Hinzufügen'))

    expect(calls.addedFree).toHaveLength(1)
    expect(calls.addedFree[0].priceIncludesVat).toBe(true)
  })

  it('documentLinesStartsAFreeLineGrossWhereTheDocumentShowsNoVatTest', async () => {
    // A delivery note of a tenant who sells gross: every line is priced gross, but the
    // document states no VAT, so its subtotals stay net. The tick asks how the document is
    // priced, not what its subtotals lead with — reading the second one has the user type a
    // gross price into a net field, and the invoice taken over from it comes out mixed.
    const calls = await render(LINES, { subtotalsIncludeVat: false, pricesIncludeVat: true })

    click(byText('Freie Zeile'))

    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(true)

    type(field('Bezeichnung'), 'Verpackung')
    type(field('Einzelpreis'), '18')
    click(byText('Hinzufügen'))

    expect(calls.addedFree).toHaveLength(1)
    expect(calls.addedFree[0].priceIncludesVat).toBe(true)
  })

  it('documentLinesKeepsThePriceBaseOfAnEditedLineTest', async () => {
    // Only a new line takes the base of the document. Line 1 was written net, and opening it
    // must not turn its price into a gross one behind the user's back.
    const calls = await render(LINES, { subtotalsIncludeVat: true, pricesIncludeVat: true })

    click(byLabel('Position 1 bearbeiten'))

    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(false)

    click(byText('Übernehmen'))

    expect(calls.updatedFree).toHaveLength(1)
    expect(calls.updatedFree[0].line.priceIncludesVat).toBe(false)
  })

  it('documentLinesLocksTheOtherDiscountFieldTest', async () => {
    await render(LINES)
    click(byText('Freie Zeile'))

    type(field('Rabatt in Prozent') as HTMLInputElement, '12')

    expect((field('Rabatt als Betrag') as HTMLInputElement).disabled).toBe(true)
  })

  it('documentLinesEmptiesTheOtherDiscountFieldTest', async () => {
    await render(LINES)
    click(byLabel('Position 5 bearbeiten'))

    type(field('Rabatt in Prozent') as HTMLInputElement, '12')

    expect((field('Rabatt als Betrag') as HTMLInputElement).value).toBe('')
  })

  it('documentLinesAddsACommentTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    type(field('Text') as HTMLInputElement, 'Lieferung frei Haus')
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([{ kind: 'COMMENT', text: 'Lieferung frei Haus' }])
  })

  it('documentLinesRefusesACommentWithoutTextTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([])
    expect(text()).toContain('Eine Kommentarzeile braucht einen Text.')
  })

  it('documentLinesAddsAPageBreakWithoutTextTest', async () => {
    const calls = await render(LINES)

    click(byText('Zeile einfügen'))
    type(field('Zeilenart') as HTMLSelectElement, 'PAGE_BREAK')
    click(byText('Einfügen'))

    expect(calls.addedStructure).toEqual([{ kind: 'PAGE_BREAK', text: undefined }])
    expect(text()).toContain('Ein Seitenwechsel trägt keinen Text.')
  })

  it('documentLinesEditsAStructureLineTest', async () => {
    const calls = await render(LINES)

    click(byLabel('Position 3 bearbeiten'))
    expect((field('Zeilenart') as HTMLSelectElement).value).toBe('SUBTOTAL')

    type(field('Beschriftung') as HTMLInputElement, 'Zwischensumme Material')
    click(byText('Übernehmen'))

    expect(calls.updatedStructure).toEqual([
      { lineNumber: 3, line: { kind: 'SUBTOTAL', text: 'Zwischensumme Material' } },
    ])
  })

  it('documentLinesKeepsTheDialogOpenWhenTheLineIsRefusedTest', async () => {
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

  it('documentLinesClosesTheDialogWhenTheLineIsTakenTest', async () => {
    await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    click(byText('Hinzufügen'))
    await settle()
    await fadeOut()

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('documentLinesShowsWhyALineWasRefusedInTheDialogTest', async () => {
    await render(LINES, { error: new Error('quantity must not be zero') })

    click(byText('Freie Zeile'))

    expect(text()).toContain('quantity must not be zero')
  })

  it('documentLinesRefusesAQuantityOfZeroTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    type(field('Menge') as HTMLInputElement, '0')

    expect(text()).toContain('Die Menge darf nicht null sein.')

    click(byText('Hinzufügen'))

    // The button takes the press rather than sitting there locked, and the line still does
    // not go out.
    expect(calls.addedFree).toEqual([])
  })

  it('documentLinesRefusesADiscountOverAHundredTest', async () => {
    const calls = await render(LINES)

    click(byText('Freie Zeile'))
    type(field('Bezeichnung') as HTMLInputElement, 'Beratung')
    type(field('Einzelpreis') as HTMLInputElement, '50')
    type(field('Rabatt in Prozent') as HTMLInputElement, '150')

    expect(text()).toContain('Der Rabatt liegt zwischen 0 und 100 Prozent.')

    click(byText('Hinzufügen'))

    expect(calls.addedFree).toEqual([])
  })

  it('documentLinesWarnsWhenAStoredDiscountIsDroppedTest', async () => {
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

  it('documentLinesExplainsAMissingWriteRightTest', async () => {
    await render(LINES, {
      editable: false,
      readOnlyNote: 'Zum Ändern der Positionen fehlt das Recht ORDER_WRITE.',
    })

    expect(text()).toContain('fehlt das Recht ORDER_WRITE')
  })

  it('documentLinesShowsAStoredServiceDateTest', async () => {
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

  it('documentLinesKeepsTheServiceDatesOutOfTheWayTest', async () => {
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
