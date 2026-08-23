// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentLine, DocumentStatus, SalesDocument } from '../../lib/types'
import { LinesTable } from './LinesTable'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const CATALOGUES = {
  'line-kind': [
    { code: 'ITEM', name: 'Position' },
    { code: 'SUBTOTAL', name: 'Zwischentotal' },
  ],
}

const UNITS = [{ code: 'PIECE', name: 'Stück', shortName: 'Stk', isDefault: true }]

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
  line({ lineNumber: 1, description: 'Wartung', quantity: 3, unit: 'PIECE', unitPrice: 250, vatRate: 8.1, lineNet: 675 }),
  line({ lineNumber: 2, kind: 'SUBTOTAL', subtotalNet: 675, subtotalVat: 54.68, subtotalGross: 729.68 }),
  line({ lineNumber: 3, description: 'Ersatzteil', quantity: 1, unit: 'PIECE', unitPrice: 75, vatRate: 8.1, lineNet: 75 }),
]

function order(
  lines: DocumentLine[],
  status: DocumentStatus = 'DRAFT',
  subtotalsIncludeVat = false,
  /** How the lines are priced, which the table asks nowhere: only the subtotals decide. */
  pricesIncludeVat = subtotalsIncludeVat,
): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status,
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
const moved: { lineNumber: number; position: number }[] = []
/** Which line the table asked to have edited or taken off, by its number. */
const edited: number[] = []
const removed: number[] = []

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(url.includes('/units') ? UNITS : CATALOGUES), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  moved.length = 0
  edited.length = 0
  removed.length = 0
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

/** Draws the table, and draws it again when a test needs a second state. */
async function draw(document: SalesDocument, editable = true, busy = false) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <LinesTable
          tenantId={TENANT}
          document={document}
          editable={editable}
          busy={busy}
          onEdit={(one) => edited.push(one.lineNumber)}
          onMove={(one, position) => moved.push({ lineNumber: one.lineNumber, position })}
          onRemove={(one) => removed.push(one.lineNumber)}
        />
      </QueryClientProvider>,
    )
  })
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function text(): string {
  return container.textContent ?? ''
}

function byLabel(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
  if (!found) throw new Error(`Kein Element mit der Beschriftung "${label}"`)
  return found
}

/**
 * Which grid column a cell ends in, counted by adding up the spans before it.
 *
 * <p>That is the only way to see whether the total stands under the amounts: a `colSpan` that
 * is one too wide pushes the figure into the next column without changing a single character
 * of the text.
 */
function lastColumnOf(row: HTMLTableRowElement): number {
  return [...row.cells].reduce((column, cell) => column + cell.colSpan, 0)
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

/**
 * Fires one step of a drag the way a browser does.
 *
 * <p>jsdom knows no `DragEvent` and carries no `dataTransfer`; the table reads the transfer
 * only when there is one, so a plain bubbling event is enough to walk through a drag.
 */
function drag(element: HTMLElement, step: 'dragstart' | 'dragover' | 'drop') {
  act(() => {
    element.dispatchEvent(new Event(step, { bubbles: true, cancelable: true }))
  })
}

describe('LinesTable', () => {
  it('linesTableTotalsStandUnderTheLineAmountsTest', async () => {
    await draw(order(LINES))

    const body = container.querySelector('tbody') as HTMLTableSectionElement
    const foot = container.querySelector('tfoot') as HTMLTableSectionElement
    // A row carries the grip, the position, the five value columns and the controls; the
    // amount of the first position and the net total have to end in the same column. Five,
    // not six: without a discount anywhere the Rabatt column is not drawn.
    expect(lastColumnOf(body.rows[0])).toBe(8)
    expect(lastColumnOf(foot.rows[0])).toBe(7)
    expect(foot.rows[0].cells[0].colSpan).toBe(6)
  })

  /** With a discount the column is back, and everything still lines up. */
  it('linesTableTotalsStandUnderTheLineAmountsWithADiscountTest', async () => {
    await draw(order([{ ...LINES[0], discountPercent: 5 }, LINES[1], LINES[2]]))

    const body = container.querySelector('tbody') as HTMLTableSectionElement
    const foot = container.querySelector('tfoot') as HTMLTableSectionElement
    expect(lastColumnOf(body.rows[0])).toBe(9)
    expect(lastColumnOf(foot.rows[0])).toBe(8)
    expect(foot.rows[0].cells[0].colSpan).toBe(7)
  })

  it('linesTableTotalsStandUnderTheLineAmountsWhenIssuedTest', async () => {
    await draw(order(LINES), false)

    const foot = container.querySelector('tfoot') as HTMLTableSectionElement
    expect(lastColumnOf(foot.rows[0])).toBe(6)
  })

  /** The point of it: an empty column is a question the reader has to answer themselves. */
  it('linesTableHidesTheDiscountColumnWithoutADiscountTest', async () => {
    await draw(order(LINES))

    expect(text()).not.toContain('Rabatt')
  })

  it('linesTableShowsTheDiscountColumnWithADiscountTest', async () => {
    await draw(order([{ ...LINES[0], discountPercent: 5 }, LINES[1], LINES[2]]))

    expect(text()).toContain('Rabatt')
  })

  it('linesTableShowsTheCurrencyOnASubtotalTaxTest', async () => {
    await draw(order(LINES))

    // In the column headed "MwSt" a position shows a rate; a subtotal shows an amount, and
    // without its currency the 54.68 would read as a rate of 54.68 per cent.
    expect(text()).toContain('54.68 CHF')
  })

  it('linesTableLeadsTheSubtotalWithTheNetAmountTest', async () => {
    await draw(order(LINES))

    // The lines of this document are priced net, so the subtotal is the net one and the
    // gross amount stands under it, named.
    expect(text()).toContain('729.68 brutto')
    expect(text()).not.toContain('netto')
  })

  it('linesTableLeadsTheSubtotalWithTheGrossAmountTest', async () => {
    await draw(order(LINES, 'DRAFT', true))

    // Every charged line carries a gross price, so the subtotal the user adds up to is the
    // gross one — the same figure the document is going to print.
    expect(text()).toContain('675.00 netto')
    expect(text()).not.toContain('brutto')
  })

  it('linesTableLeadsTheSubtotalWithTheNetAmountWithoutAVatStatementTest', async () => {
    // A delivery note of a tenant who sells gross: the lines are priced gross, but the
    // document states no VAT and so its subtotals stay net. The row follows the subtotals,
    // never the price base — the two answer different questions.
    await draw(order(LINES, 'DRAFT', false, true))

    expect(text()).toContain('729.68 brutto')
    expect(text()).not.toContain('netto')
  })

  it('linesTableShowsTheSecondDescriptionAndTheCommentTest', async () => {
    await draw(
      order([
        line({
          lineNumber: 1,
          description: 'Beratung vor Ort',
          subtitle: 'Anfahrt inbegriffen',
          note: 'Termin nach Absprache,\nMaterial separat verrechnet',
          quantity: 4,
          unit: 'PIECE',
          unitPrice: 180,
          vatRate: 8.1,
          lineNet: 720,
        }),
      ]),
    )

    // Both are printed, so the mask has to show them too — otherwise the document says more
    // than the screen it was written on.
    expect(text()).toContain('Anfahrt inbegriffen')
    expect(text()).toContain('Material separat verrechnet')
  })

  it('linesTableWithoutASecondDescriptionTest', async () => {
    await draw(order(LINES))

    const body = container.querySelector('tbody') as HTMLTableSectionElement
    // A line without the two texts keeps its cell to the one description.
    expect(body.rows[0].cells[2].textContent).toBe('Wartung')
  })

  it('linesTableWithoutLinesInADraftTest', async () => {
    await draw(order([]), false)

    expect(text()).toContain('Noch keine Position')
    expect(text()).toContain('lässt sich nicht ausstellen')
    expect(text()).not.toContain('ausgestellt.')
  })

  it('linesTableWithoutLinesOnAnIssuedDocumentTest', async () => {
    await draw(order([], 'FINALISED'), false)

    expect(text()).toContain('trägt keine Positionen')
  })

  it('linesTableSortsWithTheGripInsteadOfArrowsTest', async () => {
    await draw(order(LINES))

    // Every position carries a grip, and no line is moved by an arrow any more.
    expect(container.querySelectorAll('[aria-label$="verschieben"]')).toHaveLength(3)
    expect(container.querySelector('[aria-label="Position 1 nach unten"]')).toBeNull()
    expect(container.querySelector('[aria-label="Position 3 nach oben"]')).toBeNull()
  })

  it('linesTableMovesALineWithTheArrowKeysTest', async () => {
    await draw(order(LINES))

    press(byLabel('Position 3 verschieben'), 'ArrowUp')

    expect(moved).toEqual([{ lineNumber: 3, position: 2 }])
  })

  it('linesTableKeepsTheFirstLineWhereItIsTest', async () => {
    await draw(order(LINES))

    press(byLabel('Position 1 verschieben'), 'ArrowUp')
    press(byLabel('Position 3 verschieben'), 'ArrowDown')

    // There is nothing above the first line and nothing below the last.
    expect(moved).toEqual([])
  })

  it('linesTableMovesNoLineWhileBusyTest', async () => {
    await draw(order(LINES), true, true)

    press(byLabel('Position 3 verschieben'), 'ArrowUp')

    // A second move on top of a running one would be counted against lines the backend has
    // already renumbered.
    expect(moved).toEqual([])
  })

  it('linesTableLocksTheLineControlsWhileBusyTest', async () => {
    await draw(order(LINES), true, true)

    // The backend numbers the lines afresh after every change, so an action begun on top of a
    // running one names a position that is about to be a different line. The grip has always
    // refused one; the pencil and the bin now do the same, and say so to a reader.
    expect(byLabel('Position 3 bearbeiten').getAttribute('aria-disabled')).toBe('true')
    expect(byLabel('Position 3 entfernen').getAttribute('aria-disabled')).toBe('true')
    expect(byLabel('Position 3 verschieben').disabled).toBe(true)

    click(byLabel('Position 3 bearbeiten'))
    click(byLabel('Position 3 entfernen'))

    expect(edited).toEqual([])
    expect(removed).toEqual([])
  })

  it('linesTableKeepsTheLockedControlsFocusableTest', async () => {
    await draw(order(LINES), true, true)

    // Said to be unavailable, not switched off. A dialog gives the focus back to the control
    // that opened it, and that control is locked at exactly that moment — the change it
    // started is still running. With the DOM attribute the focus would land nowhere and the
    // reader would tab through the whole mask again.
    byLabel('Position 3 entfernen').focus()

    expect(document.activeElement).toBe(byLabel('Position 3 entfernen'))
  })

  it('linesTableFreesTheLineControlsOnceTheChangeIsThroughTest', async () => {
    await draw(order(LINES), true, true)
    await draw(order(LINES))

    click(byLabel('Position 3 bearbeiten'))
    click(byLabel('Position 3 entfernen'))

    // Locked is only for as long as the change runs: afterwards the table works again.
    expect(byLabel('Position 3 bearbeiten').getAttribute('aria-disabled')).toBe(null)
    expect(edited).toEqual([3])
    expect(removed).toEqual([3])
  })

  it('linesTableKeepsTheFocusOnTheMovedLineTest', async () => {
    await draw(order(LINES))

    byLabel('Position 3 verschieben').focus()
    press(byLabel('Position 3 verschieben'), 'ArrowUp')
    expect(moved).toEqual([{ lineNumber: 3, position: 2 }])

    // While the change is on its way the grip is disabled and the browser drops the focus.
    await draw(order(LINES), true, true)
    // The backend has answered and renumbered: the line that was third is now second.
    await draw(
      order([LINES[0], { ...LINES[2], lineNumber: 2 }, { ...LINES[1], lineNumber: 3 }]),
    )

    // The focus follows the line, not the position it was pressed at.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Position 2 verschieben')
  })

  it('linesTableDropsALineOnThePositionItLandsOnTest', async () => {
    await draw(order(LINES))

    const body = container.querySelector('tbody') as HTMLTableSectionElement
    drag(byLabel('Position 1 verschieben'), 'dragstart')
    drag(body.rows[2], 'dragover')
    drag(body.rows[2], 'drop')

    // The line the grip held takes over the position it was dropped on.
    expect(moved).toEqual([{ lineNumber: 1, position: 3 }])
  })

  it('linesTableDropsALineOnItselfWithoutMovingTest', async () => {
    await draw(order(LINES))

    const body = container.querySelector('tbody') as HTMLTableSectionElement
    drag(byLabel('Position 2 verschieben'), 'dragstart')
    drag(body.rows[1], 'dragover')
    drag(body.rows[1], 'drop')

    // A line dropped where it started is no change, and must not be sent as one.
    expect(moved).toEqual([])
  })
})
