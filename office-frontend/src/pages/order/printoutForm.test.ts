import { describe, expect, it } from 'vitest'
import type { DocumentPrintout, Printer } from '../../lib/types'
import {
  MAX_PRINTOUTS,
  MAX_SHEETS,
  describePrintStep,
  describeSheets,
  describeTarget,
  nextPrintoutRow,
  pdfPathOf,
  printerNameOf,
  printoutComplaint,
  toPrintoutPayload,
  toPrintoutRows,
  printoutsKey,
  selectablePrinters,
  trayNameOf,
  traysOf,
  withMovedPrintout,
  type PrintoutRow,
} from './printoutForm'

const PRINTERS: Printer[] = [
  {
    id: 7,
    code: 'EMPFANG',
    name: 'Empfang',
    trays: [
      { id: 71, code: 'S1', name: 'Schacht 1', position: 1 },
      { id: 72, code: 'S2', name: 'Schacht 2', position: 2 },
    ],
  },
  { id: 8, code: 'BUCHHALTUNG', name: 'Buchhaltung' },
]

/** One copy, with only what the test cares about spelled out. */
function printout(fields: Partial<DocumentPrintout> = {}): DocumentPrintout {
  return { id: 1, position: 1, label: 'Original', copies: 1, ...fields }
}

/** One row of the mask, with only what the test cares about spelled out. */
function row(fields: Partial<PrintoutRow> = {}): PrintoutRow {
  return { label: 'Original', copies: '1', printerId: '', trayId: '', ...fields }
}

describe('toPrintoutRows', () => {
  it('toPrintoutRowsTest', () => {
    const rows = toPrintoutRows([
      printout({ id: 1, position: 1, label: 'Original', copies: 1, printerId: 7, trayId: 71 }),
      printout({ id: 2, position: 2, label: 'Buchhaltung', copies: 2, printerId: 8 }),
    ])

    expect(rows).toEqual([
      { id: 1, label: 'Original', copies: '1', printerId: '7', trayId: '71' },
      { id: 2, label: 'Buchhaltung', copies: '2', printerId: '8', trayId: '' },
    ])
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
      row({ id: 3, label: '  Original  ', copies: '1', printerId: '7', trayId: '71' }),
      row({ label: 'Buchhaltung', copies: '2', printerId: '8' }),
    ])

    expect(payload).toEqual({
      printouts: [
        { label: 'Original', copies: 1, printerId: 7, trayId: 71 },
        { label: 'Buchhaltung', copies: 2, printerId: 8, trayId: undefined },
      ],
    })
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
    // No copies at all is a valid answer: the backend then prints one unlabelled sheet.
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

  it('printoutComplaintWithATrayButNoPrinterTest', () => {
    expect(printoutComplaint([row({ trayId: '71' })])).toBe(
      'Ein Schacht gehört zu einem Drucker. Bitte zuerst den Drucker wählen.',
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
      printerId: '',
      trayId: '',
    })
  })

  it('nextPrintoutRowForTheFirstTest', () => {
    expect(nextPrintoutRow(0).label).toBe('Original')
  })

  it('nextPrintoutRowBeyondTheUsualNamesTest', () => {
    expect(nextPrintoutRow(7).label).toBe('Exemplar 8')
  })
})

describe('printerNameOf', () => {
  it('printerNameOfTest', () => {
    expect(printerNameOf(printout({ printerId: 7 }), PRINTERS)).toBe('Empfang')
  })

  /** The frozen name wins: whoever prints may not be allowed to read the printers. */
  it('printerNameOfPrefersTheFrozenNameTest', () => {
    expect(printerNameOf({ printerId: 7, printerName: 'Empfang (alt)' }, [])).toBe('Empfang (alt)')
  })

  it('printerNameOfWithoutAPrinterTest', () => {
    expect(printerNameOf(printout(), PRINTERS)).toBeNull()
  })

  it('printerNameOfWithAnUnknownPrinterTest', () => {
    expect(printerNameOf(printout({ printerId: 99 }), PRINTERS)).toBeNull()
  })

  it('printerNameOfWithoutAnyPrintersTest', () => {
    expect(printerNameOf(printout({ printerId: 7 }))).toBeNull()
  })
})

describe('trayNameOf', () => {
  it('trayNameOfTest', () => {
    expect(trayNameOf(printout({ printerId: 7, trayId: 72 }), PRINTERS)).toBe('Schacht 2')
  })

  it('trayNameOfPrefersTheFrozenNameTest', () => {
    expect(trayNameOf({ printerId: 7, trayId: 72, trayName: 'Schacht zwei' }, [])).toBe(
      'Schacht zwei',
    )
  })

  it('trayNameOfWithoutATrayTest', () => {
    expect(trayNameOf(printout({ printerId: 7 }), PRINTERS)).toBeNull()
  })

  it('trayNameOfOnAPrinterWithoutTraysTest', () => {
    expect(trayNameOf(printout({ printerId: 8, trayId: 71 }), PRINTERS)).toBeNull()
  })
})

describe('traysOf', () => {
  it('traysOfTest', () => {
    expect(traysOf(PRINTERS, 7).map((tray) => tray.code)).toEqual(['S1', 'S2'])
  })

  it('traysOfAPrinterWithASingleTrayTest', () => {
    expect(traysOf(PRINTERS, 8)).toEqual([])
  })

  it('traysOfWithoutAPrinterTest', () => {
    expect(traysOf(PRINTERS, undefined)).toEqual([])
  })

  it('traysOfAnUnknownPrinterTest', () => {
    expect(traysOf(PRINTERS, 99)).toEqual([])
  })
})

describe('describeTarget', () => {
  it('describeTargetTest', () => {
    expect(describeTarget(printout({ printerId: 7, trayId: 71 }), PRINTERS)).toBe(
      'Empfang · Schacht 1',
    )
  })

  it('describeTargetWithoutATrayTest', () => {
    expect(describeTarget(printout({ printerId: 8 }), PRINTERS)).toBe('Buchhaltung')
  })

  it('describeTargetWithoutAPrinterTest', () => {
    expect(describeTarget(printout(), PRINTERS)).toBe('Kein Drucker hinterlegt')
  })
})

describe('describePrintStep', () => {
  it('describePrintStepTest', () => {
    expect(
      describePrintStep(2, 3, printout({ label: 'Buchhaltung', copies: 2, printerId: 7, trayId: 71 }), PRINTERS),
    ).toBe('Ausfertigung 2 von 3: Buchhaltung, 2 Exemplare, Empfang · Schacht 1')
  })

  it('describePrintStepOfASingleCopyTest', () => {
    expect(describePrintStep(1, 1, printout({ printerId: 8 }), PRINTERS)).toBe(
      'Ausfertigung 1 von 1: Original, 1 Exemplar, Buchhaltung',
    )
  })

  /** A document that names no copies at all is printed once, and says so. */
  it('describePrintStepWithoutACopyTest', () => {
    expect(describePrintStep(1, 1, undefined, PRINTERS)).toBe(
      'Ausfertigung 1 von 1: Beleg ohne Beschriftung, 1 Exemplar, Kein Drucker hinterlegt',
    )
  })

  it('describePrintStepWithoutPrintersTest', () => {
    expect(describePrintStep(1, 2, printout({ printerId: 7 }))).toBe(
      'Ausfertigung 1 von 2: Original, 1 Exemplar, Kein Drucker hinterlegt',
    )
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
      printout({ id: 1, position: 1, label: 'Original', copies: 1, printerId: 7, trayId: 71 }),
    ])

    expect(key).toBe('1:1:Original:1:7:71')
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

describe('selectablePrinters', () => {
  const RETIRED: Printer[] = [
    { id: 7, code: 'EMPFANG', name: 'Empfang', active: true },
    { id: 8, code: 'ALT', name: 'Altes Gerät', active: false },
  ]

  it('selectablePrintersTest', () => {
    expect(selectablePrinters(RETIRED, undefined).map((entry) => entry.id)).toEqual([7])
  })

  /** A copy that already points at a retired printer must keep showing it. */
  it('selectablePrintersKeepsTheChosenOneTest', () => {
    expect(selectablePrinters(RETIRED, 8).map((entry) => entry.id)).toEqual([7, 8])
  })

  it('selectablePrintersWithoutPrintersTest', () => {
    expect(selectablePrinters([], 8)).toEqual([])
  })

  /** A printer whose payload omits `active` counts as active, as everywhere else. */
  it('selectablePrintersWithoutAnActiveFlagTest', () => {
    expect(selectablePrinters(PRINTERS, undefined).map((entry) => entry.id)).toEqual([7, 8])
  })
})
