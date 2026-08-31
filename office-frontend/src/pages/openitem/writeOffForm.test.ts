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
  // --- the three zones of an overpayment (backend ADR-0105) ------------------

  /**
   * The one reason that moves the other way.
   *
   * <p>A negative open amount <b>is</b> the surplus, so a kept overpayment is proposed with
   * it — while every other reason still refuses to pre-fill a negative figure.
   */
  it('proposedWriteOffOnAnOverpaymentTest', () => {
    expect(proposedWriteOff(-0.4, TODAY, 'UEBERZAHLUNG').amount).toBe('0.40')
    expect(proposedWriteOff(-0.4, TODAY, 'UEBERZAHLUNG').reason).toBe('UEBERZAHLUNG')
    // Nothing overpaid: nothing to keep.
    expect(proposedWriteOff(0.4, TODAY, 'UEBERZAHLUNG').amount).toBe('')
  })

  /**
   * Above the ceiling a keep is refused: «aufgerundet» stops being plausible, and a mistyped
   * transfer is a mistake under OR Art. 63 Abs. 1 the recipient may not decide about alone.
   */
  it('writeOffComplaintAboveTheKeepCeilingTest', () => {
    const form = { ...proposedWriteOff(-7, TODAY, 'UEBERZAHLUNG') }

    expect(writeOffComplaint(form, -7, TODAY, 1, 5)).toContain('Guthaben des Kunden')
  })

  /** The ceiling itself is still allowed — with the note the zone above 1.00 asks for. */
  it('writeOffComplaintAtTheKeepCeilingTest', () => {
    const form = { ...proposedWriteOff(-5, TODAY, 'UEBERZAHLUNG'), note: 'aufgerundet' }

    expect(writeOffComplaint(form, -5, TODAY, 1, 5)).toBeNull()
    // A rappen more and it is refused outright, note or not.
    expect(writeOffComplaint({ ...form, amount: '5.01' }, -5.01, TODAY, 1, 5))
      .toContain('Guthaben des Kunden')
  })

  /** Above the proposal limit «aufgerundet» is a claim, and a claim needs a text. */
  it('writeOffComplaintWithoutTheRequiredNoteTest', () => {
    const form = { ...proposedWriteOff(-2, TODAY, 'UEBERZAHLUNG') }

    expect(writeOffComplaint(form, -2, TODAY, 1, 5)).toContain('Bemerkung')
    expect(writeOffComplaint({ ...form, note: 'Kunde hat aufgerundet' }, -2, TODAY, 1, 5))
      .toBeNull()
  })

  /** Under the proposal limit no text is asked for; forty rappen explain themselves. */
  it('writeOffComplaintUnderTheProposalLimitTest', () => {
    const form = { ...proposedWriteOff(-0.4, TODAY, 'UEBERZAHLUNG') }

    expect(writeOffComplaint(form, -0.4, TODAY, 1, 5)).toBeNull()
  })

  /** Without the limits the mask says nothing about them; the server still refuses. */
  it('writeOffComplaintWithoutTheLimitsTest', () => {
    const form = { ...proposedWriteOff(-7, TODAY, 'UEBERZAHLUNG') }

    expect(writeOffComplaint(form, -7, TODAY)).toBeNull()
  })
})
