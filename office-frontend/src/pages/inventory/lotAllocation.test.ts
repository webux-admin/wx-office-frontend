import { describe, expect, it } from 'vitest'
import type { LotProposal, LotProposalLine } from '../../lib/types'
import {
  addSerialNumber,
  addSerialNumbers,
  allocatedOf,
  allocationAnnouncement,
  allocationSummary,
  emptyRow,
  isAllocated,
  lotComplaint,
  nextKey,
  openOf,
  proposalRows,
  receiptRows,
  serialRow,
  toAllocations,
  uncoveredWarning,
  withNumber,
  withoutRow,
  withQuantity,
  type LotRow,
} from './lotAllocation'

function line(fields: Partial<LotProposalLine> = {}): LotProposalLine {
  return {
    lotId: 1,
    lotNumber: 'CH-2026-01',
    expiryDate: null,
    expired: false,
    available: 10,
    proposed: 0,
    ...fields,
  }
}

function proposal(fields: Partial<LotProposal> = {}): LotProposal {
  return {
    lines: [],
    withoutNumber: line({ lotId: null, lotNumber: null, available: 0, proposed: 0 }),
    uncovered: 0,
    ...fields,
  }
}

function row(fields: Partial<LotRow> = {}): LotRow {
  return { key: 'row-1', lotId: null, lotNumber: 'CH-1', expired: false, quantity: '1', ...fields }
}

describe('proposalRows', () => {
  /** Two batches, the earlier one filled up first — the everyday take-out. */
  it('proposalRowsTest', () => {
    const rows = proposalRows(
      proposal({
        lines: [
          line({ lotId: 1, lotNumber: 'CH-A', expiryDate: '2026-09-30', available: 3, proposed: 3 }),
          line({ lotId: 2, lotNumber: 'CH-B', expiryDate: '2026-12-31', available: 9, proposed: 2 }),
        ],
      }),
    )

    expect(rows.map((entry) => entry.lotNumber)).toEqual(['CH-A', 'CH-B'])
    expect(rows.map((entry) => entry.quantity)).toEqual(['3', '2'])
    expect(rows[0].key).toBe('lot-1')
  })

  /** An expired lot is offered but never filled in: choosable, never chosen. */
  it('proposalRowsLeavesExpiredLotEmptyTest', () => {
    const rows = proposalRows(
      proposal({
        lines: [line({ lotId: 7, lotNumber: 'CH-ALT', expiryDate: '2026-03-12', expired: true })],
      }),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].expired).toBe(true)
    expect(rows[0].quantity).toBe('')
  })

  /** Stock from before the product was tracked gets a row of its own. */
  it('proposalRowsKeepsTheStockWithoutANumberTest', () => {
    const rows = proposalRows(
      proposal({
        lines: [line({ lotId: 1, lotNumber: 'CH-A', available: 2, proposed: 2 })],
        withoutNumber: line({ lotId: null, lotNumber: null, available: 8, proposed: 3 }),
      }),
    )

    expect(rows).toHaveLength(2)
    expect(rows[1].lotNumber).toBeNull()
    expect(rows[1].key).toBe('free')
    expect(rows[1].quantity).toBe('3')
  })

  /** A product tracked since its first booking has none, and gets no empty row about it. */
  it('proposalRowsWithoutLotFreeStockTest', () => {
    const rows = proposalRows(proposal({ lines: [line()] }))

    expect(rows).toHaveLength(1)
  })

  /** Nothing on its way yet is no rows, not a crash. */
  it('proposalRowsWithoutProposalTest', () => {
    expect(proposalRows(undefined)).toEqual([])
  })
})

describe('receiptRows', () => {
  /** One delivery under one number: the field starts filled and needs no arithmetic. */
  it('receiptRowsTest', () => {
    const rows = receiptRows(40)

    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe('40')
    expect(rows[0].lotNumber).toBe('')
  })

  /** No quantity typed yet leaves the row empty rather than filling in a zero. */
  it('receiptRowsWithoutQuantityTest', () => {
    expect(receiptRows(null)[0].quantity).toBe('')
  })
})

describe('nextKey', () => {
  /** Counted, so a row keeps its identity while somebody types in it. */
  it('nextKeyTest', () => {
    expect(nextKey([emptyRow('row-1'), emptyRow('row-2')])).toBe('row-3')
  })

  /** The first row of an empty field. */
  it('nextKeyWithoutRowsTest', () => {
    expect(nextKey([])).toBe('row-1')
  })
})

describe('addSerialNumber', () => {
  /** Scan, Enter, chip — the everyday case. */
  it('addSerialNumberTest', () => {
    const added = addSerialNumber([], 'SN-4711')

    expect(added.duplicate).toBeNull()
    expect(added.rows).toHaveLength(1)
    expect(added.rows[0].quantity).toBe('1')
  })

  /** The same label scanned twice is a slip of the hand, not a second piece. */
  it('addSerialNumberTwiceKeepsOneChipTest', () => {
    const once = addSerialNumber([], 'SN-4711')
    const twice = addSerialNumber(once.rows, 'SN-4711')

    expect(twice.rows).toHaveLength(1)
    expect(twice.duplicate).toBe('sn-SN-4711')
  })

  /** The database ignores case in the number, so the field has to as well. */
  it('addSerialNumberIgnoresCaseTest', () => {
    const once = addSerialNumber([], 'SN-4711')
    const twice = addSerialNumber(once.rows, 'sn-4711')

    expect(twice.rows).toHaveLength(1)
    expect(twice.duplicate).toBe('sn-SN-4711')
  })

  /** Enter on an empty field does nothing at all. */
  it('addSerialNumberWithBlankInputTest', () => {
    const added = addSerialNumber([serialRow('SN-1')], '   ')

    expect(added.rows).toHaveLength(1)
    expect(added.duplicate).toBeNull()
  })
})

describe('addSerialNumbers', () => {
  /** The generator hands out a run; every number that is new comes in. */
  it('addSerialNumbersTest', () => {
    const added = addSerialNumbers([], ['SN-1', 'SN-2', 'SN-3'])

    expect(added.rows).toHaveLength(3)
    expect(added.duplicate).toBeNull()
  })

  /** A run overlapping what is already there adds only the rest and says so. */
  it('addSerialNumbersSkipsWhatIsAlreadyThereTest', () => {
    const added = addSerialNumbers([serialRow('SN-2')], ['SN-1', 'SN-2'])

    expect(added.rows.map((entry) => entry.lotNumber)).toEqual(['SN-2', 'SN-1'])
    expect(added.duplicate).toBe('sn-SN-2')
  })
})

describe('withQuantity', () => {
  /** A typed minus never reaches the field, exactly as in the booking quantity. */
  it('withQuantityKeepsTheQuantityPositiveTest', () => {
    const rows = withQuantity([row({ quantity: '' })], 'row-1', '-4')

    expect(rows[0].quantity).toBe('4')
  })

  /** A key nothing matches leaves every row alone. */
  it('withQuantityWithUnknownKeyTest', () => {
    const rows = withQuantity([row({ quantity: '2' })], 'row-9', '7')

    expect(rows[0].quantity).toBe('2')
  })
})

describe('withNumber', () => {
  /** Typing a batch number into the row it belongs to. */
  it('withNumberTest', () => {
    expect(withNumber([row({ lotNumber: '' })], 'row-1', 'CH-77')[0].lotNumber).toBe('CH-77')
  })
})

describe('withoutRow', () => {
  /** Removing a chip, or a batch line that was added by mistake. */
  it('withoutRowTest', () => {
    const rows = withoutRow([serialRow('SN-1'), serialRow('SN-2')], 'sn-SN-1')

    expect(rows.map((entry) => entry.lotNumber)).toEqual(['SN-2'])
  })
})

describe('allocatedOf', () => {
  /** Two batches of a split delivery. */
  it('allocatedOfTest', () => {
    expect(allocatedOf([row({ quantity: '3' }), row({ key: 'row-2', quantity: '2' })])).toBe(5)
  })

  /** An empty field counts as nothing, not as a defect. */
  it('allocatedOfWithEmptyRowTest', () => {
    expect(allocatedOf([row({ quantity: '' })])).toBe(0)
  })

  /** A quantity on a line without a number is not allocated to anything yet. */
  it('allocatedOfWithoutANumberTest', () => {
    expect(allocatedOf([row({ lotNumber: '', quantity: '5' })])).toBe(0)
  })

  /** Nothing entered anywhere. */
  it('allocatedOfWithoutRowsTest', () => {
    expect(allocatedOf([])).toBe(0)
  })

  /** Quantities are kept at four decimals, and a broken one has to survive the sum. */
  it('allocatedOfWithFractionalQuantityTest', () => {
    expect(allocatedOf([row({ quantity: '0.5' }), row({ key: 'row-2', quantity: '0.25' })])).toBe(
      0.75,
    )
  })
})

describe('openOf', () => {
  /** Half of the quantity carries a number, half does not. */
  it('openOfTest', () => {
    expect(openOf(5, [row({ quantity: '3' })])).toBe(2)
  })

  /** The rounding guard: three tenths must add up to nothing left over. */
  it('openOfWithFractionalQuantityTest', () => {
    expect(openOf(5, [row({ quantity: '1.1' }), row({ key: 'row-2', quantity: '3.9' })])).toBe(0)
  })

  /** More allocated than booked answers negative, which the field says out loud. */
  it('openOfWithTooMuchAllocatedTest', () => {
    expect(openOf(2, [row({ quantity: '3' })])).toBe(-1)
  })

  /** No quantity typed yet: nothing is open, because nothing is being booked. */
  it('openOfWithoutQuantityTest', () => {
    expect(openOf(null, [])).toBe(0)
  })
})

describe('isAllocated', () => {
  /** Everything carries a number — the button may light up. */
  it('isAllocatedTest', () => {
    expect(isAllocated(5, [row({ quantity: '5' })])).toBe(true)
  })

  /** One piece short is not allocated, however close it looks. */
  it('isAllocatedWithOpenQuantityTest', () => {
    expect(isAllocated(5, [row({ quantity: '4' })])).toBe(false)
  })

  /** A dialog with no quantity yet is not «complete», it is unfinished. */
  it('isAllocatedWithoutQuantityTest', () => {
    expect(isAllocated(null, [])).toBe(false)
  })
})

describe('allocationSummary', () => {
  /** The line that saves everyone the subtraction. */
  it('allocationSummaryTest', () => {
    expect(allocationSummary(5, [row({ quantity: '3' })])).toBe(
      'Menge 5 · zugeordnet 3 · offen 2',
    )
  })

  /** Too much says so rather than showing a minus in front of «offen». */
  it('allocationSummaryWithTooMuchAllocatedTest', () => {
    expect(allocationSummary(2, [row({ quantity: '3' })])).toBe(
      'Menge 2 · zugeordnet 3 · 1 zu viel',
    )
  })

  /** No quantity typed yet: the dash says that, a zero would be a claim. */
  it('allocationSummaryWithoutQuantityTest', () => {
    expect(allocationSummary(null, [])).toBe('Menge — · zugeordnet 0 · offen 0')
  })
})

describe('allocationAnnouncement', () => {
  /** What the screen reader hears while the eyes are on the label. */
  it('allocationAnnouncementTest', () => {
    const rows = [serialRow('SN-1'), serialRow('SN-2'), serialRow('SN-3'), serialRow('SN-4')]

    expect(allocationAnnouncement('SN-4', 5, rows)).toBe(
      'SN-4 hinzugefügt, 4 von 5 zugeordnet',
    )
  })
})

describe('toAllocations', () => {
  /** What travels to the server: one entry per number that carries a quantity. */
  it('toAllocationsTest', () => {
    const rows = [row({ lotNumber: ' CH-A ', quantity: '3' }), row({ key: 'row-2', quantity: '2' })]

    expect(toAllocations(rows)).toEqual([
      { lotNumber: 'CH-A', quantity: 3 },
      { lotNumber: 'CH-1', quantity: 2 },
    ])
  })

  /** The stock without a number travels as `null`, which is what the way out allows. */
  it('toAllocationsKeepsTheStockWithoutANumberTest', () => {
    expect(toAllocations([row({ key: 'free', lotNumber: null, quantity: '8' })])).toEqual([
      { lotNumber: null, quantity: 8 },
    ])
  })

  /** A row somebody added and left alone is not a statement about the goods. */
  it('toAllocationsDropsEmptyRowsTest', () => {
    const rows = [row({ quantity: '3' }), emptyRow('row-2'), row({ key: 'row-3', quantity: '0' })]

    expect(toAllocations(rows)).toEqual([{ lotNumber: 'CH-1', quantity: 3 }])
  })

  /** A quantity without a number is not sent — the complaint holds the dialog back first. */
  it('toAllocationsDropsAQuantityWithoutANumberTest', () => {
    expect(toAllocations([row({ lotNumber: '  ', quantity: '4' })])).toEqual([])
  })

  /** Nothing entered anywhere. */
  it('toAllocationsWithoutRowsTest', () => {
    expect(toAllocations([])).toEqual([])
  })
})

describe('lotComplaint', () => {
  /** A complete split has nothing to say. */
  it('lotComplaintTest', () => {
    expect(lotComplaint(5, [row({ quantity: '5' })], 'LOT')).toBeNull()
  })

  /** What is open is named, so nobody has to work out how much is missing. */
  it('lotComplaintWithOpenQuantityTest', () => {
    expect(lotComplaint(5, [row({ quantity: '3' })], 'LOT')).toBe(
      'Ordnen Sie die ganze Menge zu. Offen: 2.',
    )
  })

  /** Serial numbers are counted, not measured, and the wording follows. */
  it('lotComplaintForSerialNumbersTest', () => {
    expect(lotComplaint(5, [serialRow('SN-1')], 'SERIAL')).toBe(
      'Es fehlen noch 4 Seriennummern.',
    )
  })

  /** More than booked is its own mistake and gets its own sentence. */
  it('lotComplaintWithTooMuchAllocatedTest', () => {
    expect(lotComplaint(2, [row({ quantity: '3' })], 'LOT')).toBe(
      'Es sind 1 zu viel zugeordnet.',
    )
  })

  /** A quantity on a row without a number would be refused by the server. */
  it('lotComplaintWithoutANumberTest', () => {
    expect(lotComplaint(4, [row({ lotNumber: '', quantity: '4' })], 'LOT')).toBe(
      'Jede Zeile braucht eine Charge.',
    )
  })

  /**
   * The same batch on two lines is one line too many, whatever its spelling — and the message
   * quotes the second one as it was typed, because that is the line to correct.
   */
  it('lotComplaintWithTheSameNumberTwiceTest', () => {
    const rows = [
      row({ lotNumber: 'CH-A', quantity: '2' }),
      row({ key: 'row-2', lotNumber: 'ch-a', quantity: '2' }),
    ]

    expect(lotComplaint(4, rows, 'LOT')).toBe('Die Charge ch-a steht zweimal.')
  })

  /** The column stops at 60 characters, so the field says so before the server does. */
  it('lotComplaintWithATooLongNumberTest', () => {
    const rows = [row({ lotNumber: 'C'.repeat(61), quantity: '1' })]

    expect(lotComplaint(1, rows, 'LOT')).toBe('Eine Charge ist höchstens 60 Zeichen lang.')
  })

  /** A number of exactly 60 characters is allowed — the boundary belongs inside. */
  it('lotComplaintWithTheLongestAllowedNumberTest', () => {
    const rows = [row({ lotNumber: 'C'.repeat(60), quantity: '1' })]

    expect(lotComplaint(1, rows, 'LOT')).toBeNull()
  })

  /** Nothing typed yet is not a complaint; the quantity field speaks first. */
  it('lotComplaintWithoutQuantityTest', () => {
    expect(lotComplaint(null, [], 'LOT')).toBeNull()
  })
})

describe('uncoveredWarning', () => {
  /** The location cannot cover the whole quantity; the booking may still go through. */
  it('uncoveredWarningTest', () => {
    expect(uncoveredWarning(proposal({ uncovered: 2 }))).toBe(
      '2 sind an diesem Lagerort nicht gedeckt.',
    )
  })

  /** Everything is covered, so there is nothing to warn about. */
  it('uncoveredWarningWithCoveredQuantityTest', () => {
    expect(uncoveredWarning(proposal())).toBeNull()
  })

  /** Nothing on its way yet warns about nothing. */
  it('uncoveredWarningWithoutProposalTest', () => {
    expect(uncoveredWarning(undefined)).toBeNull()
  })
})
