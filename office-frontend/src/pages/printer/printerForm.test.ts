import { describe, expect, it } from 'vitest'
import type { Printer } from '../../lib/types'
import {
  EMPTY_PRINTER,
  MAX_TRAYS,
  describeTrays,
  nextTrayRow,
  printerComplaint,
  toPrinterForm,
  toPrinterPayload,
  withMovedTray,
  type PrinterForm,
  type TrayRow,
} from './printerForm'

/** A filled in mask, with only what the test cares about spelled out. */
function form(fields: Partial<PrinterForm> = {}): PrinterForm {
  return { code: 'EMPFANG', name: 'Empfang', location: '', active: true, trays: [], ...fields }
}

/** One tray row, with only what the test cares about spelled out. */
function tray(fields: Partial<TrayRow> = {}): TrayRow {
  return { code: 'S1', name: 'Schacht 1', ...fields }
}

describe('toPrinterForm', () => {
  it('toPrinterFormTest', () => {
    const printer: Printer = {
      id: 7,
      code: 'EMPFANG',
      name: 'Empfang',
      location: '2. OG',
      trays: [{ id: 71, code: 'S1', name: 'Schacht 1', position: 1 }],
    }

    expect(toPrinterForm(printer)).toEqual({
      code: 'EMPFANG',
      name: 'Empfang',
      location: '2. OG',
      active: true,
      trays: [{ code: 'S1', name: 'Schacht 1' }],
    })
  })

  it('toPrinterFormWithoutTraysTest', () => {
    const printer: Printer = { id: 8, code: 'LAGER', name: 'Lager' }

    expect(toPrinterForm(printer)).toEqual({
      code: 'LAGER',
      name: 'Lager',
      location: '',
      active: true,
      trays: [],
    })
  })

  it('toPrinterFormOfADeactivatedPrinterTest', () => {
    const printer: Printer = { id: 8, code: 'LAGER', name: 'Lager', active: false }

    expect(toPrinterForm(printer).active).toBe(false)
  })
})

describe('toPrinterPayload', () => {
  it('toPrinterPayloadTest', () => {
    const payload = toPrinterPayload(
      form({
        code: 'empfang',
        name: '  Empfang  ',
        location: ' 2. OG ',
        trays: [tray(), tray({ code: 's2', name: 'Schacht 2' })],
      }),
    )

    expect(payload).toEqual({
      code: 'EMPFANG',
      name: 'Empfang',
      location: '2. OG',
      active: true,
      trays: [
        { code: 'S1', name: 'Schacht 1', position: 1 },
        { code: 'S2', name: 'Schacht 2', position: 2 },
      ],
    })
  })

  it('toPrinterPayloadOfADeactivatedPrinterTest', () => {
    expect(toPrinterPayload(form({ active: false })).active).toBe(false)
  })

  it('toPrinterPayloadWithoutALocationTest', () => {
    expect(toPrinterPayload(form({ location: '   ' })).location).toBeUndefined()
  })

  /** The position is the place in the list, so moving a row is what reorders the trays. */
  it('toPrinterPayloadNumbersTraysByPlaceTest', () => {
    const payload = toPrinterPayload(
      form({ trays: [tray({ code: 'A' }), tray({ code: 'B' }), tray({ code: 'C' })] }),
    )

    expect(payload.trays.map((entry) => entry.position)).toEqual([1, 2, 3])
  })
})

describe('printerComplaint', () => {
  it('printerComplaintTest', () => {
    expect(printerComplaint(form({ trays: [tray()] }), true)).toBeNull()
  })

  it('printerComplaintWithoutACodeTest', () => {
    expect(printerComplaint(EMPTY_PRINTER, true)).toBe(
      'Ein Drucker braucht einen Code. Er steht danach fest.',
    )
  })

  /** The code is fixed once the printer exists, so it is not read again. */
  it('printerComplaintIgnoresTheCodeWhenEditingTest', () => {
    expect(printerComplaint(form({ code: '' }), false)).toBeNull()
  })

  it('printerComplaintWithASpaceInTheCodeTest', () => {
    expect(printerComplaint(form({ code: 'HP 4000' }), true)).toBe(
      'Ein Druckercode besteht aus Buchstaben, Ziffern, Bindestrich und Unterstrich.',
    )
  })

  it('printerComplaintWithALowerCaseCodeTest', () => {
    // Upper cased before it is checked, because that is how it is stored.
    expect(printerComplaint(form({ code: 'empfang' }), true)).toBeNull()
  })

  it('printerComplaintWithATooLongCodeTest', () => {
    expect(printerComplaint(form({ code: 'A'.repeat(21) }), true)).toBe(
      'Der Code darf höchstens 20 Zeichen lang sein.',
    )
  })

  it('printerComplaintWithoutANameTest', () => {
    expect(printerComplaint(form({ name: '  ' }), true)).toBe(
      'Ein Drucker braucht eine Bezeichnung.',
    )
  })

  it('printerComplaintWithATooLongNameTest', () => {
    expect(printerComplaint(form({ name: 'x'.repeat(61) }), true)).toBe(
      'Die Bezeichnung darf höchstens 60 Zeichen lang sein.',
    )
  })

  it('printerComplaintWithATooLongLocationTest', () => {
    expect(printerComplaint(form({ location: 'x'.repeat(101) }), true)).toBe(
      'Der Standort darf höchstens 100 Zeichen lang sein.',
    )
  })

  it('printerComplaintWithoutTraysTest', () => {
    // A printer with a single tray names none, and that is the usual case.
    expect(printerComplaint(form({ trays: [] }), true)).toBeNull()
  })

  it('printerComplaintWithAnEmptyTrayCodeTest', () => {
    expect(printerComplaint(form({ trays: [tray({ code: '  ' })] }), true)).toBe(
      'Ein Schacht braucht einen Code. Sonst die Zeile entfernen.',
    )
  })

  it('printerComplaintWithoutATrayNameTest', () => {
    expect(printerComplaint(form({ trays: [tray({ name: '' })] }), true)).toBe(
      'Ein Schacht braucht eine Bezeichnung.',
    )
  })

  it('printerComplaintWithTwoTraysOfTheSameCodeTest', () => {
    const trays = [tray({ code: 'S1' }), tray({ code: 's1', name: 'Schacht eins' })]

    expect(printerComplaint(form({ trays }), true)).toBe('Der Schachtcode S1 kommt zweimal vor.')
  })

  it('printerComplaintWithTooManyTraysTest', () => {
    const trays = Array.from({ length: MAX_TRAYS + 1 }, (_, index) =>
      tray({ code: `S${index}`, name: `Schacht ${index}` }),
    )

    expect(printerComplaint(form({ trays }), true)).toBe(
      `Ein Drucker trägt höchstens ${MAX_TRAYS} Schächte.`,
    )
  })
})

describe('withMovedTray', () => {
  it('withMovedTrayTest', () => {
    const trays = [tray({ code: 'A' }), tray({ code: 'B' }), tray({ code: 'C' })]

    expect(withMovedTray(trays, 2, -1).map((entry) => entry.code)).toEqual(['A', 'C', 'B'])
  })

  it('withMovedTrayDownTest', () => {
    const trays = [tray({ code: 'A' }), tray({ code: 'B' })]

    expect(withMovedTray(trays, 0, 1).map((entry) => entry.code)).toEqual(['B', 'A'])
  })

  it('withMovedTrayBeyondTheTopTest', () => {
    const trays = [tray({ code: 'A' })]

    expect(withMovedTray(trays, 0, -1).map((entry) => entry.code)).toEqual(['A'])
  })

  it('withMovedTrayWithoutTraysTest', () => {
    expect(withMovedTray([], 0, 1)).toEqual([])
  })
})

describe('nextTrayRow', () => {
  it('nextTrayRowTest', () => {
    expect(nextTrayRow(2)).toEqual({ code: 'S3', name: 'Schacht 3' })
  })

  it('nextTrayRowForTheFirstTest', () => {
    expect(nextTrayRow(0)).toEqual({ code: 'S1', name: 'Schacht 1' })
  })
})

describe('describeTrays', () => {
  it('describeTraysTest', () => {
    const printer: Printer = {
      id: 7,
      code: 'EMPFANG',
      name: 'Empfang',
      trays: [
        { id: 71, code: 'S1', name: 'Schacht 1' },
        { id: 72, code: 'S2', name: 'Schacht 2' },
      ],
    }

    expect(describeTrays(printer)).toBe('Schacht 1, Schacht 2')
  })

  it('describeTraysWithoutTraysTest', () => {
    expect(describeTrays({ id: 8, code: 'LAGER', name: 'Lager' })).toBe('Ein Schacht')
  })

  it('describeTraysWithOneTrayTest', () => {
    const printer: Printer = {
      id: 8,
      code: 'LAGER',
      name: 'Lager',
      trays: [{ id: 81, code: 'S1', name: 'Universalschacht' }],
    }

    expect(describeTrays(printer)).toBe('Universalschacht')
  })
})
