import { describe, expect, it } from 'vitest'
import {
  proposedWriteOff,
  toWriteOffPayload,
  writeOffComplaint,
  type WriteOffForm,
} from './writeOffForm'

const TODAY = '2026-08-29'

function form(overrides: Partial<WriteOffForm> = {}): WriteOffForm {
  return {
    reason: 'KLEINDIFFERENZ',
    amount: '0.20',
    bookingDate: TODAY,
    evidence: '',
    note: '',
    ...overrides,
  }
}

describe('writeOffForm', () => {
  // --- proposedWriteOff ----------------------------------------------------

  it('proposedWriteOffTest', () => {
    const proposed = proposedWriteOff(0.2, TODAY)

    expect(proposed.amount).toBe('0.20')
    expect(proposed.reason).toBe('KLEINDIFFERENZ')
    expect(proposed.bookingDate).toBe(TODAY)
  })

  /** An overpayment is a credit the customer is owed, never a pre-filled write-off. */
  it('proposedWriteOffWithACreditTest', () => {
    expect(proposedWriteOff(-0.2, TODAY).amount).toBe('')
    expect(proposedWriteOff(0, TODAY).amount).toBe('')
    expect(proposedWriteOff(undefined, TODAY).amount).toBe('')
  })

  // --- writeOffComplaint ---------------------------------------------------

  it('writeOffComplaintTest', () => {
    expect(writeOffComplaint(form(), 0.2, TODAY)).toBeNull()
  })

  it('writeOffComplaintWithAFutureBookingDateTest', () => {
    expect(writeOffComplaint(form({ bookingDate: '2026-08-30' }), 0.2, TODAY)).toBe(
      'Das Buchungsdatum darf nicht in der Zukunft liegen.',
    )
  })

  it('writeOffComplaintWithoutABookingDateTest', () => {
    expect(writeOffComplaint(form({ bookingDate: '' }), 0.2, TODAY)).toBe(
      'Das Buchungsdatum fehlt.',
    )
  })

  it('writeOffComplaintWithoutAnAmountTest', () => {
    expect(writeOffComplaint(form({ amount: '' }), 0.2, TODAY)).toContain('keine Zahl')
    expect(writeOffComplaint(form({ amount: 'nichts' }), 0.2, TODAY)).toContain('keine Zahl')
  })

  it('writeOffComplaintWithZeroTest', () => {
    expect(writeOffComplaint(form({ amount: '0' }), 0.2, TODAY)).toBe(
      'Eine Ausbuchung über 0.00 sagt nichts aus.',
    )
  })

  /** Giving up more than is open means nothing — the payment dialog is the other way round. */
  it('writeOffComplaintAboveTheOpenAmountTest', () => {
    expect(writeOffComplaint(form({ amount: '5.00' }), 0.2, TODAY)).toContain(
      'mehr lässt sich nicht ausbuchen',
    )
  })

  /**
   * The one reason that moves the other way has no ceiling: an overpayment kept is additional
   * consideration, not a remainder being given up.
   */
  it('writeOffComplaintOfAKeptOverpaymentTest', () => {
    expect(
      writeOffComplaint(form({ reason: 'UEBERZAHLUNG', amount: '0.20' }), -0.2, TODAY),
    ).toBeNull()
  })

  it('writeOffComplaintWithATooLongTextTest', () => {
    expect(writeOffComplaint(form({ note: 'x'.repeat(501) }), 0.2, TODAY)).toContain('500')
  })

  // --- toWriteOffPayload ---------------------------------------------------

  it('toWriteOffPayloadTest', () => {
    const payload = toWriteOffPayload(
      form({ amount: '1’250,50', evidence: ' Verlustschein 4711 ', note: ' Rest ' }),
    )

    expect(payload).toEqual({
      reason: 'KLEINDIFFERENZ',
      amount: 1250.5,
      bookingDate: TODAY,
      evidence: 'Verlustschein 4711',
      note: 'Rest',
    })
  })

  /** An empty evidence is «keiner», and a stored empty string would read as one entered. */
  it('toWriteOffPayloadWithoutTextsTest', () => {
    const payload = toWriteOffPayload(form({ evidence: '  ', note: '' }))

    expect(payload.evidence).toBeUndefined()
    expect(payload.note).toBeUndefined()
  })
})
