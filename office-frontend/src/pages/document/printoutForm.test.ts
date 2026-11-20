import { describe, expect, it } from 'vitest'
import type { DocumentPrintout } from '../../lib/types'
import {
  MAX_PRINTOUTS,
  MAX_SHEETS,
  describePrintStep,
  describeSheets,
  nextPrintoutRow,
  pdfPathOf,
  printoutComplaint,
  toPrintoutPayload,
  toPrintoutRows,
  printoutsKey,
  withMovedPrintout,
  type PrintoutRow,
} from './printoutForm'

/** One copy, with only what the test cares about spelled out. */
function printout(fields: Partial<DocumentPrintout> = {}): DocumentPrintout {
  return { id: 1, position: 1, label: 'Original', copies: 1, ...fields }
}

/** One row of the mask, with only what the test cares about spelled out. */
function row(fields: Partial<PrintoutRow> = {}): PrintoutRow {
  return {
    label: 'Original',
    copies: '1',
    documentLayoutId: '',
    internal: false,
    ...fields,
  }
}

describe('toPrintoutRows', () => {
  it('toPrintoutRowsTest', () => {
    const rows = toPrintoutRows([
      printout({ id: 1, position: 1, label: 'Original', copies: 1 }),
      printout({ id: 2, position: 2, label: 'Buchhaltung', copies: 2 }),
    ])

    expect(rows).toEqual([
      row({ id: 1, label: 'Original', copies: '1' }),
      row({ id: 2, label: 'Buchhaltung', copies: '2' }),
    ])
  })

  it('toPrintoutRowsCarriesTheFormAndTheInternalMarkTest', () => {
    const rows = toPrintoutRows([
      printout({ id: 3, label: 'Lager', documentLayoutId: 12, internal: true }),
    ])

    expect(rows[0].documentLayoutId).toBe('12')
    expect(rows[0].internal).toBe(true)
  })

  /** Absent means «like the document itself», which is an empty field, not a missing one. */
  it('toPrintoutRowsWithoutAFormOfItsOwnTest', () => {
    const rows = toPrintoutRows([printout()])

    expect(rows[0].documentLayoutId).toBe('')
    expect(rows[0].internal).toBe(false)
  })

  it('toPrintoutRowsWithoutCopiesTest', () => {
    expect(toPrintoutRows([])).toEqual([])
  })

  it('toPrintoutRowsWithoutAListTest', () => {
    expect(toPrintoutRows(undefined)).toEqual([])
  })
})

describe('toPrintoutPayload', () => {
  it('toPrintoutPayloadTest', () => {
    const payload = toPrintoutPayload([
      row({ id: 3, label: '  Original  ', copies: '1' }),
      row({ label: 'Buchhaltung', copies: '2' }),
    ])

    expect(payload).toEqual({
      printouts: [
        {
          label: 'Original',
          copies: 1,
          documentLayoutId: undefined,
          internal: false,
        },
        {
          label: 'Buchhaltung',
          copies: 2,
          documentLayoutId: undefined,
          internal: false,
        },
      ],
    })
  })

  it('toPrintoutPayloadCarriesTheFormAndTheInternalMarkTest', () => {
    const payload = toPrintoutPayload([row({ documentLayoutId: '12', internal: true })])

    expect(payload.printouts[0].documentLayoutId).toBe(12)
    expect(payload.printouts[0].internal).toBe(true)
  })

  it('toPrintoutPayloadWithoutAFormOfItsOwnTest', () => {
    const payload = toPrintoutPayload([row({ documentLayoutId: '' })])

    expect(payload.printouts[0].documentLayoutId).toBeUndefined()
  })

  /** Neither id nor position travels: the order of the list is the order on the paper. */
  it('toPrintoutPayloadCarriesNoPositionTest', () => {
    const payload = toPrintoutPayload([row({ id: 9 }), row({ id: 4 })])

    expect(payload.printouts.every((entry) => !('position' in entry) && !('id' in entry))).toBe(
      true,
    )
  })

  it('toPrintoutPayloadWithoutRowsTest', () => {
    expect(toPrintoutPayload([])).toEqual({ printouts: [] })
  })
})

describe('printoutComplaint', () => {
  it('printoutComplaintTest', () => {
    expect(printoutComplaint([row(), row({ label: 'Kopie', copies: '2' })])).toBeNull()
  })

  it('printoutComplaintWithoutRowsTest', () => {
    // No copy at all is a valid answer: this document is then not printed (ADR-0053).
    expect(printoutComplaint([])).toBeNull()
  })

  it('printoutComplaintWithAnEmptyLabelTest', () => {
    expect(printoutComplaint([row({ label: '   ' })])).toBe(
      'Eine Ausfertigung braucht eine Beschriftung. Sonst die Zeile entfernen.',
    )
  })

  it('printoutComplaintWithATooLongLabelTest', () => {
    expect(printoutComplaint([row({ label: 'x'.repeat(61) })])).toBe(
      'Eine Beschriftung darf höchstens 60 Zeichen lang sein.',
    )
  })

  it('printoutComplaintWithALabelOfExactlySixtyTest', () => {
    expect(printoutComplaint([row({ label: 'x'.repeat(60) })])).toBeNull()
  })

  it('printoutComplaintWithAnUnreadableCountTest', () => {
    expect(printoutComplaint([row({ copies: 'zwei' })])).toBe('Die Anzahl ist keine Zahl.')
  })

  it('printoutComplaintWithAFractionTest', () => {
    expect(printoutComplaint([row({ copies: '1.5' })])).toBe('Die Anzahl ist eine ganze Zahl.')
  })

  it('printoutComplaintWithZeroSheetsTest', () => {
    expect(printoutComplaint([row({ copies: '0' })])).toBe(
      `Die Anzahl liegt zwischen 1 und ${MAX_SHEETS}.`,
    )
  })

  it('printoutComplaintWithTooManySheetsTest', () => {
    expect(printoutComplaint([row({ copies: `${MAX_SHEETS + 1}` })])).toBe(
      `Die Anzahl liegt zwischen 1 und ${MAX_SHEETS}.`,
    )
  })

  it('printoutComplaintWithTheHighestSheetCountTest', () => {
    expect(printoutComplaint([row({ copies: `${MAX_SHEETS}` })])).toBeNull()
  })

  it('printoutComplaintWithTooManyRowsTest', () => {
    const rows = Array.from({ length: MAX_PRINTOUTS + 1 }, () => row())

    expect(printoutComplaint(rows)).toBe(
      `Ein Beleg wird in höchstens ${MAX_PRINTOUTS} Ausfertigungen gedruckt.`,
    )
  })

})

describe('withMovedPrintout', () => {
  it('withMovedPrintoutTest', () => {
    const rows = [row({ label: 'A' }), row({ label: 'B' }), row({ label: 'C' })]

    expect(withMovedPrintout(rows, 1, -1).map((entry) => entry.label)).toEqual(['B', 'A', 'C'])
  })

  it('withMovedPrintoutDownTest', () => {
    const rows = [row({ label: 'A' }), row({ label: 'B' })]

    expect(withMovedPrintout(rows, 0, 1).map((entry) => entry.label)).toEqual(['B', 'A'])
  })

  it('withMovedPrintoutBeyondTheTopTest', () => {
    const rows = [row({ label: 'A' }), row({ label: 'B' })]

    expect(withMovedPrintout(rows, 0, -1).map((entry) => entry.label)).toEqual(['A', 'B'])
  })

  it('withMovedPrintoutBeyondTheEndTest', () => {
    const rows = [row({ label: 'A' })]

    expect(withMovedPrintout(rows, 0, 1).map((entry) => entry.label)).toEqual(['A'])
  })

  it('withMovedPrintoutWithoutRowsTest', () => {
    expect(withMovedPrintout([], 0, 1)).toEqual([])
  })
})

describe('nextPrintoutRow', () => {
  it('nextPrintoutRowTest', () => {
    expect(nextPrintoutRow(2)).toEqual({
      label: 'Buchhaltung',
      copies: '1',
      documentLayoutId: '',
      internal: false,
    })
  })

  it('nextPrintoutRowForTheFirstTest', () => {
    expect(nextPrintoutRow(0).label).toBe('Original')
  })

  it('nextPrintoutRowBeyondTheUsualNamesTest', () => {
    expect(nextPrintoutRow(7).label).toBe('Exemplar 8')
  })
})

describe('describePrintStep', () => {
  it('describePrintStepTest', () => {
    expect(
      describePrintStep(2, 3, printout({ label: 'Buchhaltung', copies: 2 })),
    ).toBe('Ausfertigung 2 von 3: Buchhaltung, 2 Exemplare')
  })

  it('describePrintStepOfASingleCopyTest', () => {
    expect(describePrintStep(1, 1, printout())).toBe(
      'Ausfertigung 1 von 1: Original, 1 Exemplar',
    )
  })

  /** A document that names no copies at all is printed once, and says so. */
  it('describePrintStepWithoutACopyTest', () => {
    expect(describePrintStep(1, 1, undefined)).toBe(
      'Ausfertigung 1 von 1: Beleg ohne Beschriftung, 1 Exemplar',
    )
  })

  it('describePrintStepOfTheFirstOfTwoTest', () => {
    expect(describePrintStep(1, 2, printout())).toBe('Ausfertigung 1 von 2: Original, 1 Exemplar')
  })
})

describe('describeSheets', () => {
  it('describeSheetsTest', () => {
    expect(describeSheets(3)).toBe('3 Exemplare')
  })

  it('describeSheetsForOneTest', () => {
    expect(describeSheets(1)).toBe('1 Exemplar')
  })

  it('describeSheetsWithoutACountTest', () => {
    expect(describeSheets(undefined)).toBe('1 Exemplar')
  })

  it('describeSheetsWithZeroTest', () => {
    expect(describeSheets(0)).toBe('1 Exemplar')
  })
})

describe('printoutsKey', () => {
  it('printoutsKeyTest', () => {
    const key = printoutsKey([
      printout({ id: 1, position: 1, label: 'Original', copies: 1 }),
    ])

    expect(key).toBe('1:1:Original:1::')
  })

  it('printoutsKeyChangesWithTheFormTest', () => {
    const before = printoutsKey([printout()])
    const after = printoutsKey([printout({ documentLayoutId: 12 })])

    expect(after).not.toBe(before)
  })

  it('printoutsKeyChangesWithTheInternalMarkTest', () => {
    const before = printoutsKey([printout()])
    const after = printoutsKey([printout({ internal: true })])

    expect(after).not.toBe(before)
  })

  /** The point of it: a changed value has to produce a different key. */
  it('printoutsKeyChangesWithAValueTest', () => {
    const before = printoutsKey([printout({ copies: 1 })])
    const after = printoutsKey([printout({ copies: 2 })])

    expect(after).not.toBe(before)
  })

  it('printoutsKeyChangesWithTheOrderTest', () => {
    const one = printout({ id: 1, position: 1, label: 'Original' })
    const other = printout({ id: 2, position: 2, label: 'Kopie' })

    expect(printoutsKey([one, other])).not.toBe(printoutsKey([other, one]))
  })

  it('printoutsKeyWithoutCopiesTest', () => {
    expect(printoutsKey([])).toBe('')
  })

  it('printoutsKeyWithoutAListTest', () => {
    expect(printoutsKey(undefined)).toBe('')
  })
})

describe('pdfPathOf', () => {
  it('pdfPathOfTest', () => {
    expect(pdfPathOf('/api/tenants/1/orders/42', 815)).toBe(
      '/api/tenants/1/orders/42/pdf?printoutId=815',
    )
  })

  it('pdfPathOfTheWholeDocumentTest', () => {
    expect(pdfPathOf('/api/tenants/1/orders/42', undefined)).toBe('/api/tenants/1/orders/42/pdf')
  })
})

