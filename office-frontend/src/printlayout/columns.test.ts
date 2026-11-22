import { describe, expect, it } from 'vitest'
import type { LayoutColumn } from '../lib/types'
import {
  chosenColumnsOf,
  columnBudgetOf,
  columnRowsOf,
  moveColumn,
  printedColumnsOf,
  resizeColumnBoundary,
  setFillColumn,
  toggleColumn,
  updateColumn,
} from './columns'
import { sampleCatalogue } from './fixtures'

const CATALOGUE = sampleCatalogue().columns
const column = (code: string, change: Partial<LayoutColumn> = {}): LayoutColumn => ({
  code,
  widthMm: null,
  label: null,
  align: null,
  ...change,
})
/** Three columns: 8 mm, the one that fills, 24 mm. */
const THREE = [column('position'), column('description'), column('lineNet')]

describe('chosenColumnsOf', () => {
  it('chosenColumnsOfTest', () => {
    expect(chosenColumnsOf({ columns: THREE }, CATALOGUE)).toBe(THREE)
  })

  it('chosenColumnsOfAnEmptyListTest', () => {
    // No columns named means the usual eight.
    expect(chosenColumnsOf({ columns: [] }, CATALOGUE).map((entry) => entry.code)).toEqual([
      'position',
      'productNumber',
      'description',
      'quantity',
      'unit',
      'unitPrice',
      'vatRate',
      'lineNet',
    ])
  })

  it('chosenColumnsOfWithASmallerCatalogueTest', () => {
    // A default the catalogue does not offer is not invented.
    const small = CATALOGUE.filter((entry) => entry.code !== 'vatRate')
    expect(chosenColumnsOf({ columns: [] }, small).map((entry) => entry.code)).not.toContain(
      'vatRate',
    )
    // Without any catalogue the defaults stand as they are.
    expect(chosenColumnsOf({ columns: [] }, [])).toHaveLength(8)
  })
})

describe('printedColumnsOf', () => {
  it('printedColumnsOfTest', () => {
    const printed = printedColumnsOf({ columns: THREE }, CATALOGUE)

    expect(printed.map((entry) => entry.heading)).toEqual(['Pos', 'Bezeichnung', 'Betrag'])
    expect(printed.map((entry) => entry.widthMm)).toEqual([8, 0, 24])
    expect(printed.map((entry) => entry.fills)).toEqual([false, true, false])
    // Numbers stand right, everything else left.
    expect(printed.map((entry) => entry.align)).toEqual(['left', 'left', 'right'])
  })

  it('printedColumnsOfWithOwnValuesTest', () => {
    const printed = printedColumnsOf(
      { columns: [column('lineNet', { widthMm: 30, label: 'Total', align: 'center' })] },
      CATALOGUE,
    )
    expect(printed[0]).toMatchObject({
      heading: 'Total',
      proposedHeading: 'Betrag',
      widthMm: 30,
      align: 'center',
    })
  })

  it('printedColumnsOfDropsWhatTheCatalogueDoesNotKnowTest', () => {
    const printed = printedColumnsOf({ columns: [column('gone'), column('position')] }, CATALOGUE)
    expect(printed.map((entry) => entry.code)).toEqual(['position'])
  })
})

describe('columnRowsOf', () => {
  it('columnRowsOfTest', () => {
    const rows = columnRowsOf({ columns: THREE }, CATALOGUE)

    // The chosen ones first in print order, then the rest of the catalogue.
    expect(rows.slice(0, 3).map((row) => [row.code, row.shown])).toEqual([
      ['position', true],
      ['description', true],
      ['lineNet', true],
    ])
    expect(rows).toHaveLength(CATALOGUE.length)
    expect(rows.slice(3).every((row) => !row.shown)).toBe(true)
  })

  it('columnRowsOfKeepsAnUnknownColumnVisibleTest', () => {
    const rows = columnRowsOf({ columns: [column('gone')] }, CATALOGUE)
    expect(rows[0]).toMatchObject({ code: 'gone', known: false, shown: true, heading: 'gone' })
    expect(rows).toHaveLength(CATALOGUE.length + 1)
  })

  it('columnRowsOfWithoutACatalogueTest', () => {
    expect(columnRowsOf({ columns: [] }, [])).toHaveLength(8)
  })
})

describe('toggleColumn', () => {
  it('toggleColumnTest', () => {
    expect(toggleColumn(THREE, 'quantity', true).map((entry) => entry.code)).toEqual([
      'position',
      'description',
      'lineNet',
      'quantity',
    ])
  })

  it('toggleColumnOffTest', () => {
    expect(toggleColumn(THREE, 'description', false).map((entry) => entry.code)).toEqual([
      'position',
      'lineNet',
    ])
  })

  it('toggleColumnThatAlreadyIsTest', () => {
    // Switching on what is on, or off what is off, changes nothing.
    expect(toggleColumn(THREE, 'position', true)).toEqual(THREE)
    expect(toggleColumn(THREE, 'quantity', false)).toEqual(THREE)
    expect(toggleColumn([], 'position', true)).toHaveLength(1)
  })
})

describe('moveColumn', () => {
  it('moveColumnTest', () => {
    expect(moveColumn(THREE, 2, 0).map((entry) => entry.code)).toEqual([
      'lineNet',
      'position',
      'description',
    ])
  })

  it('moveColumnToItsOwnPlaceTest', () => {
    expect(moveColumn(THREE, 1, 1)).toEqual(THREE)
  })

  it('moveColumnOutsideTheListTest', () => {
    expect(moveColumn(THREE, 0, -1)).toEqual(THREE)
    expect(moveColumn(THREE, 0, 3)).toEqual(THREE)
    expect(moveColumn(THREE, 9, 0)).toEqual(THREE)
  })
})

describe('updateColumn', () => {
  it('updateColumnTest', () => {
    const after = updateColumn(THREE, 'lineNet', { widthMm: 30, label: 'Total' })
    expect(after[2]).toEqual(column('lineNet', { widthMm: 30, label: 'Total' }))
    expect(after[0]).toBe(THREE[0])
  })

  it('updateColumnWithABlankHeadingTest', () => {
    // A blank heading means the proposal again.
    const named = updateColumn(THREE, 'lineNet', { label: 'Total' })
    expect(updateColumn(named, 'lineNet', { label: '  ' })[2].label).toBeNull()
    expect(updateColumn(named, 'lineNet', { label: '' })[2].label).toBeNull()
  })

  it('updateColumnThatIsNotChosenTest', () => {
    expect(updateColumn(THREE, 'quantity', { widthMm: 5 })).toEqual(THREE)
  })
})

describe('setFillColumn', () => {
  it('setFillColumnTest', () => {
    const after = setFillColumn(THREE, CATALOGUE, 'lineNet', true)

    // The amount fills now; the description goes back to a fixed width.
    expect(after.map((entry) => entry.widthMm)).toEqual([null, 40, 0])
    expect(printedColumnsOf({ columns: after }, CATALOGUE).filter((entry) => entry.fills)).toHaveLength(
      1,
    )
  })

  it('setFillColumnOffTest', () => {
    const after = setFillColumn(THREE, CATALOGUE, 'description', false)
    expect(after[1].widthMm).toBe(40)
  })

  it('setFillColumnBackToItsProposedWidthTest', () => {
    // A column the catalogue gives a width takes that one back, not the stand-in.
    const filled = setFillColumn(THREE, CATALOGUE, 'lineNet', true)
    const back = setFillColumn(filled, CATALOGUE, 'description', true)
    expect(back.map((entry) => entry.widthMm)).toEqual([null, 0, 24])
  })

  it('setFillColumnOffOnAFixedColumnTest', () => {
    expect(setFillColumn(THREE, CATALOGUE, 'position', false)).toEqual(THREE)
  })
})

describe('resizeColumnBoundary', () => {
  it('resizeColumnBoundaryTest', () => {
    // The border right of «Pos»: the filler is on its right, so «Pos» itself changes.
    const after = resizeColumnBoundary(THREE, CATALOGUE, 0, 4.2)
    expect(after.map((entry) => entry.widthMm)).toEqual([12, null, null])
  })

  it('resizeColumnBoundaryRightOfTheFillerTest', () => {
    // The border between the filler and «Betrag»: dragging right makes «Betrag» narrower,
    // so the border follows the pointer.
    const after = resizeColumnBoundary(THREE, CATALOGUE, 1, 4)
    expect(after.map((entry) => entry.widthMm)).toEqual([null, null, 20])
  })

  it('resizeColumnBoundaryDownToTheNarrowestTest', () => {
    expect(resizeColumnBoundary(THREE, CATALOGUE, 0, -500)[0].widthMm).toBe(5)
    expect(resizeColumnBoundary(THREE, CATALOGUE, 1, 500)[2].widthMm).toBe(5)
  })

  it('resizeColumnBoundaryWithoutAFillerTest', () => {
    const fixed = [column('position'), column('quantity'), column('lineNet')]
    expect(resizeColumnBoundary(fixed, CATALOGUE, 1, 2).map((entry) => entry.widthMm)).toEqual([
      null,
      20,
      null,
    ])
  })

  it('resizeColumnBoundaryThatIsNoBorderTest', () => {
    expect(resizeColumnBoundary(THREE, CATALOGUE, -1, 5)).toEqual(THREE)
    expect(resizeColumnBoundary(THREE, CATALOGUE, 2, 5)).toEqual(THREE)
    expect(resizeColumnBoundary([], CATALOGUE, 0, 5)).toEqual([])
  })
})

describe('columnBudgetOf', () => {
  const defaults = chosenColumnsOf({ columns: [] }, CATALOGUE)

  it('columnBudgetOfTest', () => {
    // Seven fixed columns: 8 + 22 + 18 + 13 + 22 + 13 + 24 = 120 mm of content and 2 mm of
    // padding each, 134 mm. The description takes the rest, less its own padding.
    expect(columnBudgetOf(defaults, CATALOGUE, 170)).toEqual({
      available: 170,
      used: 134,
      remaining: 34,
      fillCount: 1,
      tone: 'ok',
      message: null,
    })
  })

  it('columnBudgetOfTooWideTest', () => {
    // Columns that do not fit are no longer a remark: the server refuses the form.
    const budget = columnBudgetOf(defaults, CATALOGUE, 100)
    expect(budget.tone).toBe('error')
    expect(budget.remaining).toBe(-36)
    expect(budget.message).toBe(
      'Die Spalten brauchen 134 mm, Platz ist für 100 mm. Spalten schmaler machen oder ausblenden.',
    )
  })

  it('columnBudgetOfWithTooLittleLeftForTheFillerTest', () => {
    // 146 − 134 − 2 leaves 10 mm, and the filling column is counted at 20 at least.
    const budget = columnBudgetOf(defaults, CATALOGUE, 146)
    expect(budget.tone).toBe('error')
    expect(budget.message).toBe(
      'Für «Bezeichnung» bleiben nur 10 mm; nötig sind mindestens 20 mm. Andere Spalten schmaler machen oder ausblenden.',
    )
    // At exactly 20 mm it is fine, a tenth below it is not.
    expect(columnBudgetOf(defaults, CATALOGUE, 156).tone).toBe('ok')
    expect(columnBudgetOf(defaults, CATALOGUE, 155.9).tone).toBe('error')
    // The fixed columns fit to the millimetre, but the filler has no room at all.
    expect(columnBudgetOf(defaults, CATALOGUE, 134)).toMatchObject({
      remaining: -2,
      tone: 'error',
    })
  })

  it('columnBudgetOfWithoutAFillerTest', () => {
    const fixed = [column('position'), column('lineNet')]
    const budget = columnBudgetOf(fixed, CATALOGUE, 170)
    // 8 + 2 and 24 + 2.
    expect(budget).toMatchObject({ used: 36, remaining: 134, fillCount: 0, tone: 'info' })
    expect(budget.message).toBe('Keine Spalte füllt den Rest: 134 mm bleiben rechts frei.')
    // Fixed columns that add up exactly need no word.
    expect(columnBudgetOf(fixed, CATALOGUE, 36)).toMatchObject({ tone: 'ok', message: null })
  })

  it('columnBudgetOfWithTwoFillersTest', () => {
    const two = [column('description'), column('lineNet', { widthMm: 0 })]
    const budget = columnBudgetOf(two, CATALOGUE, 170)
    expect(budget.fillCount).toBe(2)
    expect(budget.tone).toBe('warning')
    expect(budget.message).toBe('Mehrere Spalten füllen den Rest. Genau eine sollte es sein.')
  })

  it('columnBudgetOfIgnoresUnknownColumnsTest', () => {
    // A column that is not printed takes no width.
    expect(
      columnBudgetOf([column('gone', { widthMm: 90 }), column('position')], CATALOGUE, 170).used,
    ).toBe(10)
    expect(columnBudgetOf([], CATALOGUE, 170)).toMatchObject({ used: 0, tone: 'info' })
  })
})
