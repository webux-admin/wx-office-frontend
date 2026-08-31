import { describe, expect, it } from 'vitest'
import type { OpenItem } from '../../lib/types'
import {
  MAX_NOTE_LENGTH,
  emptyReceipt,
  lookupBy,
  proposedAmount,
  receiptComplaint,
  toAssignmentPayload,
  toReceiptPayload,
  unassignedOf,
  withFoundItem,
  type ReceiptForm,
} from './receiptForm'

/**
 * The receipt dialog as arithmetic, without any rendering.
 *
 * <p>Three things live here and nowhere else: what is left of a receipt, what a newly found
 * Rechnung is pre-filled with, and when saving is locked. Everything beyond that is the
 * backend's answer.
 */

const TODAY = '2026-04-17'

function item(over: Partial<OpenItem> = {}): OpenItem {
  return {
    documentId: 11,
    documentNumber: 'RE-2026-0142',
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    partnerId: 1,
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    totalGross: 1250,
    settled: 0,
    open: 1250,
    overdue: true,
    daysOverdue: 72,
    ...over,
  }
}

function form(over: Partial<ReceiptForm> = {}): ReceiptForm {
  return { ...emptyReceipt('CHF', TODAY), amount: '1250.00', ...over }
}

function row(documentId: number, amount: string, open = 1250) {
  return {
    documentId,
    documentNumber: `RE-2026-${documentId}`,
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    open,
    amount,
  }
}

// --- unassignedOf ----------------------------------------------------------

describe('unassignedOf', () => {
  it('unassignedOfTest', () => {
    expect(unassignedOf(form({ rows: [row(11, '800.00'), row(12, '400.00')] }))).toBe(50)
  })

  it('unassignedOfWithoutRowsTest', () => {
    expect(unassignedOf(form())).toBe(1250)
  })

  it('unassignedOfWhenItGoesUpExactlyTest', () => {
    expect(unassignedOf(form({ rows: [row(11, '1250.00')] }))).toBe(0)
  })

  /** Negative is what locks the save button, so it must actually come out negative. */
  it('unassignedOfBeyondTheReceiptTest', () => {
    expect(unassignedOf(form({ rows: [row(11, '800.00'), row(12, '500.00')] }))).toBe(-50)
  })

  /**
   * Rounded to the rappen, or the footer says «0.00» while the button stays locked.
   *
   * <p>1250 − 800 − 450 leaves a residue of about 1e-13 in binary floating point, and that is
   * neither zero nor visible.
   */
  it('unassignedOfWithABinaryResidueTest', () => {
    expect(unassignedOf(form({ rows: [row(11, '800.00'), row(12, '450.00')] }))).toBe(0)
  })

  it('unassignedOfWithoutAnAmountTest', () => {
    expect(unassignedOf(form({ amount: '' }))).toBe(0)
  })
})

// --- proposedAmount --------------------------------------------------------

describe('proposedAmount', () => {
  /** Whichever runs out first is what can actually be assigned. */
  it('proposedAmountTest', () => {
    expect(proposedAmount(item({ open: 400 }), 1250)).toBe('400.00')
    expect(proposedAmount(item({ open: 1250 }), 400)).toBe('400.00')
  })

  it('proposedAmountWithNothingLeftTest', () => {
    expect(proposedAmount(item(), 0)).toBe('')
  })

  /** An overpaid Rechnung owes nothing; there is nothing to pre-fill. */
  it('proposedAmountOnACreditTest', () => {
    expect(proposedAmount(item({ open: -20 }), 1250)).toBe('')
  })
})

// --- lookupBy --------------------------------------------------------------

describe('lookupBy', () => {
  /** 27 digits, however they were spaced on the statement. */
  it('lookupByTest', () => {
    expect(lookupBy('210000000003139471430009')).toEqual({
      documentNumber: '210000000003139471430009',
    })
    expect(lookupBy('21 00000 00000 03139 47143 00098')).toEqual({
      reference: '21 00000 00000 03139 47143 00098',
    })
  })

  it('lookupByACreditorReferenceTest', () => {
    expect(lookupBy('RF18539007547034')).toEqual({ reference: 'RF18539007547034' })
    expect(lookupBy('rf18 5390 0754 7034')).toEqual({ reference: 'rf18 5390 0754 7034' })
  })

  /**
   * A document number is a document number, even when it is only digits.
   *
   * <p>Some tenants number without a prefix. Sent as a reference it would earn a 400 for
   * something that is not one.
   */
  it('lookupByADocumentNumberTest', () => {
    expect(lookupBy('RE-2026-0142')).toEqual({ documentNumber: 'RE-2026-0142' })
    expect(lookupBy('20260142')).toEqual({ documentNumber: '20260142' })
  })
})

// --- withFoundItem ---------------------------------------------------------

describe('withFoundItem', () => {
  it('withFoundItemTest', () => {
    const next = withFoundItem(form(), item({ open: 400 }))

    expect(next.complaint).toBeNull()
    expect(next.form?.rows).toHaveLength(1)
    expect(next.form?.rows[0]?.amount).toBe('400.00')
  })

  /** Two lines on the same Rechnung are one line with a wrong amount. */
  it('withFoundItemTwiceTest', () => {
    const next = withFoundItem(form({ rows: [row(11, '400.00')] }), item())

    expect(next.form).toBeNull()
    expect(next.complaint).toContain('RE-2026-0142')
  })

  it('withFoundItemInAnotherCurrencyTest', () => {
    const next = withFoundItem(form(), item({ currency: 'EUR' }))

    expect(next.form).toBeNull()
    expect(next.complaint).toContain('EUR')
  })

  /** The second Rechnung only gets what the first one left. */
  it('withFoundItemAfterTheFirstOneTest', () => {
    const next = withFoundItem(form({ rows: [row(11, '1000.00')] }), item({ documentId: 12 }))

    expect(next.form?.rows[1]?.amount).toBe('250.00')
  })
})

// --- receiptComplaint ------------------------------------------------------

describe('receiptComplaint', () => {
  it('receiptComplaintTest', () => {
    expect(receiptComplaint(form({ rows: [row(11, '1250.00')] }), TODAY)).toBeNull()
  })

  /** Nothing assigned is a state a receipt is allowed to stay in. */
  it('receiptComplaintWithoutAnyRowTest', () => {
    expect(receiptComplaint(form(), TODAY)).toBeNull()
  })

  it('receiptComplaintWithoutAnAmountTest', () => {
    expect(receiptComplaint(form({ amount: '' }), TODAY)).toContain('keine Zahl')
    expect(receiptComplaint(form({ amount: 'viel' }), TODAY)).toContain('keine Zahl')
  })

  it('receiptComplaintWithoutMoneyTest', () => {
    expect(receiptComplaint(form({ amount: '0.00' }), TODAY)).toContain('0.00')
  })

  it('receiptComplaintInTheFutureTest', () => {
    expect(receiptComplaint(form({ valueDate: '2026-04-18' }), TODAY)).toContain('Zukunft')
  })

  it('receiptComplaintWithoutAValueDateTest', () => {
    expect(receiptComplaint(form({ valueDate: '' }), TODAY)).toContain('Valutadatum')
  })

  it('receiptComplaintWithABrokenCurrencyTest', () => {
    expect(receiptComplaint(form({ currency: 'CH' }), TODAY)).toContain('drei Buchstaben')
  })

  it('receiptComplaintWithATooLongNoteTest', () => {
    expect(receiptComplaint(form({ note: 'N'.repeat(MAX_NOTE_LENGTH + 1) }), TODAY))
      .toContain(String(MAX_NOTE_LENGTH))
  })

  /** The rule worth spelling out on screen: more than arrived cannot be handed out. */
  it('receiptComplaintBeyondTheReceiptTest', () => {
    const complaint = receiptComplaint(
      form({ rows: [row(11, '800.00'), row(12, '500.00')] }),
      TODAY,
    )

    expect(complaint).toContain('zu viel')
  })

  it('receiptComplaintWithAnEmptyRowTest', () => {
    expect(receiptComplaint(form({ rows: [row(11, '')] }), TODAY)).toContain('RE-2026-11')
  })

  it('receiptComplaintWithAZeroRowTest', () => {
    expect(receiptComplaint(form({ rows: [row(11, '0.00')] }), TODAY)).toContain('0.00')
  })
})

// --- the payloads ----------------------------------------------------------

describe('toReceiptPayload', () => {
  it('toReceiptPayloadTest', () => {
    const body = toReceiptPayload(
      form({ payerName: ' Meier AG ', payerReference: ' 21 00000 ', currency: 'chf' }),
      42,
    )

    expect(body).toEqual({
      partnerId: 42,
      payerName: 'Meier AG',
      amount: 1250,
      currency: 'CHF',
      valueDate: TODAY,
      payerReference: '21 00000',
      note: undefined,
    })
  })

  /** An empty reference is «keine», and a stored empty string would read as one entered. */
  it('toReceiptPayloadWithBlankTextsTest', () => {
    const body = toReceiptPayload(form({ payerName: '  ', payerReference: '', note: ' ' }))

    expect(body.payerName).toBeUndefined()
    expect(body.payerReference).toBeUndefined()
    expect(body.note).toBeUndefined()
    expect(body.partnerId).toBeUndefined()
  })
})

describe('toAssignmentPayload', () => {
  it('toAssignmentPayloadTest', () => {
    expect(toAssignmentPayload(form({ rows: [row(11, '800.00'), row(12, '450.00')] }))).toEqual([
      { documentId: 11, amount: 800 },
      { documentId: 12, amount: 450 },
    ])
  })

  it('toAssignmentPayloadWithoutRowsTest', () => {
    expect(toAssignmentPayload(form())).toEqual([])
  })
})
