import { describe, expect, it } from 'vitest'
import {
  MAX_NOTE_LENGTH,
  advanceComplaint,
  creditUseComplaint,
  emptyAdvance,
  proposedApplication,
  proposedUse,
  toAdvancePayload,
  toCreditUsePayload,
  type AdvanceForm,
  type CreditUseForm,
} from './creditForm'

/**
 * The customer credit dialogs as arithmetic, without any rendering.
 *
 * <p>Three things live here and nowhere else: a prepayment needs a customer, more than is left
 * cannot go out, and the IBAN travels only on a refund.
 */

const TODAY = '2026-04-17'

function advance(over: Partial<AdvanceForm> = {}): AdvanceForm {
  return { ...emptyAdvance('CHF', TODAY), amount: '1250.00', ...over }
}

function use(over: Partial<CreditUseForm> = {}): CreditUseForm {
  return { ...proposedUse('REFUND_ON_REQUEST', 500, TODAY), ...over }
}

// --- advanceComplaint ------------------------------------------------------

describe('advanceComplaint', () => {
  it('advanceComplaintTest', () => {
    expect(advanceComplaint(advance(), true, TODAY)).toBeNull()
  })

  /**
   * The rule that makes a prepayment different from an ordinary receipt.
   *
   * <p>It is money the tenant owes somebody. A debt without a creditor is not a fact anybody
   * can act on, and the receipt whose payer is unknown is a different case.
   */
  it('advanceComplaintWithoutACustomerTest', () => {
    expect(advanceComplaint(advance(), false, TODAY)).toContain('Kunden')
  })

  it('advanceComplaintWithoutAnAmountTest', () => {
    expect(advanceComplaint(advance({ amount: '' }), true, TODAY)).toContain('keine Zahl')
    expect(advanceComplaint(advance({ amount: 'viel' }), true, TODAY)).toContain('keine Zahl')
  })

  it('advanceComplaintWithoutMoneyTest', () => {
    expect(advanceComplaint(advance({ amount: '0.00' }), true, TODAY)).toContain('0.00')
    expect(advanceComplaint(advance({ amount: '-10' }), true, TODAY)).toContain('0.00')
  })

  it('advanceComplaintInTheFutureTest', () => {
    expect(advanceComplaint(advance({ valueDate: '2026-04-18' }), true, TODAY))
      .toContain('Zukunft')
  })

  it('advanceComplaintWithoutAValueDateTest', () => {
    expect(advanceComplaint(advance({ valueDate: '' }), true, TODAY)).toContain('Valutadatum')
  })

  it('advanceComplaintWithABrokenCurrencyTest', () => {
    expect(advanceComplaint(advance({ currency: 'CH' }), true, TODAY))
      .toContain('drei Buchstaben')
  })

  it('advanceComplaintWithATooLongNoteTest', () => {
    expect(advanceComplaint(advance({ note: 'N'.repeat(MAX_NOTE_LENGTH + 1) }), true, TODAY))
      .toContain(String(MAX_NOTE_LENGTH))
  })
})

// --- creditUseComplaint ----------------------------------------------------

describe('creditUseComplaint', () => {
  it('creditUseComplaintTest', () => {
    expect(creditUseComplaint(use(), 500, TODAY)).toBeNull()
  })

  /** The one rule worth spelling out on screen. */
  it('creditUseComplaintBeyondTheRemainderTest', () => {
    expect(creditUseComplaint(use({ amount: '600.00' }), 500, TODAY)).toContain('übrig')
  })

  it('creditUseComplaintExactlyTheRemainderTest', () => {
    expect(creditUseComplaint(use({ amount: '500.00' }), 500, TODAY)).toBeNull()
  })

  it('creditUseComplaintWithoutAnAmountTest', () => {
    expect(creditUseComplaint(use({ amount: '' }), 500, TODAY)).toContain('keine Zahl')
  })

  it('creditUseComplaintWithoutMoneyTest', () => {
    expect(creditUseComplaint(use({ amount: '0.00' }), 500, TODAY)).toContain('0.00')
  })

  it('creditUseComplaintInTheFutureTest', () => {
    expect(creditUseComplaint(use({ bookingDate: '2026-04-18' }), 500, TODAY))
      .toContain('Zukunft')
  })

  it('creditUseComplaintWithoutABookingDateTest', () => {
    expect(creditUseComplaint(use({ bookingDate: '' }), 500, TODAY))
      .toContain('Buchungsdatum')
  })
})

// --- proposedUse -----------------------------------------------------------

describe('proposedUse', () => {
  /** The whole remainder, because that is what happens in almost every case. */
  it('proposedUseTest', () => {
    expect(proposedUse('REFUND_ON_REQUEST', 500, TODAY).amount).toBe('500.00')
    expect(proposedUse('REFUND_ON_REQUEST', 500, TODAY).bookingDate).toBe(TODAY)
  })

  it('proposedUseWithNothingLeftTest', () => {
    expect(proposedUse('RELEASE_UNCLAIMED', 0, TODAY).amount).toBe('')
    expect(proposedUse('RELEASE_UNCLAIMED', undefined, TODAY).amount).toBe('')
  })
})

// --- proposedApplication ---------------------------------------------------

describe('proposedApplication', () => {
  /** Whichever runs out first is what can actually be assigned. */
  it('proposedApplicationTest', () => {
    expect(proposedApplication(400, 1250)).toBe('400.00')
    expect(proposedApplication(1250, 400)).toBe('400.00')
  })

  it('proposedApplicationWithNothingLeftTest', () => {
    expect(proposedApplication(400, 0)).toBe('')
    expect(proposedApplication(0, 400)).toBe('')
  })
})

// --- the payloads ----------------------------------------------------------

describe('toAdvancePayload', () => {
  it('toAdvancePayloadTest', () => {
    const body = toAdvancePayload(
      advance({ payerName: ' Meier AG ', currency: 'chf', note: ' Vorschuss ' }), 42)

    expect(body).toEqual({
      partnerId: 42,
      payerName: 'Meier AG',
      amount: 1250,
      currency: 'CHF',
      valueDate: TODAY,
      payerReference: undefined,
      note: 'Vorschuss',
    })
  })

  it('toAdvancePayloadWithBlankTextsTest', () => {
    const body = toAdvancePayload(advance({ payerName: '  ', note: ' ' }), 42)

    expect(body.payerName).toBeUndefined()
    expect(body.note).toBeUndefined()
  })
})

describe('toCreditUsePayload', () => {
  it('toCreditUsePayloadTest', () => {
    const body = toCreditUsePayload(use({ refundIban: ' CH44 ', note: ' auf Wunsch ' }))

    expect(body.reason).toBe('REFUND_ON_REQUEST')
    expect(body.amount).toBe(500)
    expect(body.refundIban).toBe('CH44')
    expect(body.note).toBe('auf Wunsch')
  })

  /**
   * A release pays nothing out.
   *
   * <p>An account it went to would be a receipt for a payment that never happened. The server
   * refuses it too; this saves the round trip.
   */
  it('toCreditUsePayloadOnAReleaseTest', () => {
    const body = toCreditUsePayload(
      use({ reason: 'RELEASE_UNCLAIMED', refundIban: 'CH4431999123000889012' }))

    expect(body.refundIban).toBeUndefined()
  })
})
