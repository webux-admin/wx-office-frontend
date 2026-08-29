import { describe, expect, it } from 'vitest'
import type { WriteOffCandidate, WriteOffRunResult } from '../../lib/types'
import {
  defaultSettings,
  proposalSignature,
  runPayload,
  runResultText,
  selectionCountText,
  selectionTotal,
  toleranceComplaint,
  type RunSettings,
} from './writeOffRun'

const TODAY = '2026-08-29'

function settings(overrides: Partial<RunSettings> = {}): RunSettings {
  return { ...defaultSettings('CHF', TODAY), ...overrides }
}

function candidate(documentId: number, amount: number): WriteOffCandidate {
  return {
    documentId,
    documentNumber: `RE-2026-${documentId}`,
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    daysOverdue: 206,
    partnerId: 1,
    partnerNumber: 'K-1',
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    totalGross: 1297.2,
    settled: 1297.2 - amount,
    open: amount,
    limit: 0.2,
    writeOffAmount: amount,
  }
}

function result(overrides: Partial<WriteOffRunResult> = {}): WriteOffRunResult {
  return {
    runId: 1,
    postedCount: 0,
    skippedCount: 0,
    postedTotal: 0,
    posted: [],
    skipped: [],
    failed: [],
    ...overrides,
  }
}

describe('writeOffRun', () => {
  // --- toleranceComplaint --------------------------------------------------

  it('toleranceComplaintTest', () => {
    expect(toleranceComplaint(settings(), TODAY)).toBeNull()
    expect(toleranceComplaint(settings({ toleranceKind: 'PERCENT' }), TODAY)).toBeNull()
  })

  it('toleranceComplaintWithANegativeAmountTest', () => {
    expect(toleranceComplaint(settings({ amount: '-0.20' }), TODAY)).toBe(
      'Eine Toleranz von 0.00 schlägt nichts vor.',
    )
    expect(toleranceComplaint(settings({ amount: '0' }), TODAY)).toContain('schlägt nichts vor')
    expect(toleranceComplaint(settings({ amount: 'viel' }), TODAY)).toContain('keine Zahl')
  })

  it('toleranceComplaintWithAPercentAboveHundredTest', () => {
    const over = settings({ toleranceKind: 'PERCENT', percent: '101' })

    expect(toleranceComplaint(over, TODAY)).toBe(
      'Eine Toleranz liegt zwischen 0 und 100 Prozent.',
    )
  })

  it('toleranceComplaintWithAFutureBookingDateTest', () => {
    expect(toleranceComplaint(settings({ bookingDate: '2026-08-30' }), TODAY)).toContain(
      'Zukunft',
    )
  })

  it('toleranceComplaintWithoutACurrencyTest', () => {
    expect(toleranceComplaint(settings({ currency: '' }), TODAY)).toContain('einer Währung')
  })

  it('toleranceComplaintWithABrokenAgeTest', () => {
    expect(toleranceComplaint(settings({ minimumAgeDays: '-1' }), TODAY)).toContain('ganze Tage')
    expect(toleranceComplaint(settings({ minimumAgeDays: '2.5' }), TODAY)).toContain('ganze Tage')
    expect(toleranceComplaint(settings({ minimumAgeDays: '0' }), TODAY)).toBeNull()
  })

  // --- runPayload ----------------------------------------------------------

  it('runPayloadTest', () => {
    expect(runPayload(settings(), [11, 12])).toEqual({
      toleranceAmount: 0.2,
      tolerancePercent: undefined,
      currency: 'CHF',
      bookingDate: TODAY,
      reason: 'KLEINDIFFERENZ',
      minimumAgeDays: 30,
      partnerId: undefined,
      documentIds: [11, 12],
    })
  })

  /** Nothing ticked asks for the whole proposal rather than for an empty list. */
  it('runPayloadWithoutASelectionTest', () => {
    expect(runPayload(settings()).documentIds).toBeUndefined()
  })

  /**
   * The proof test: the payload never carries both tolerance forms.
   *
   * <p>The backend refuses the combination — «Eine Toleranz ist entweder ein Betrag oder ein
   * Prozentsatz, nicht beides» — and the mask must not be able to send it at all. Both fields
   * keep their typed value while the other form is chosen, so switching back and forth loses
   * nothing; only one of them reaches the wire.
   */
  it('runPayloadCarriesEitherAmountOrPercentTest', () => {
    const both = settings({ amount: '0.20', percent: '1' })

    const byAmount = runPayload({ ...both, toleranceKind: 'AMOUNT' })
    expect(byAmount.toleranceAmount).toBe(0.2)
    expect(byAmount.tolerancePercent).toBeUndefined()

    const byPercent = runPayload({ ...both, toleranceKind: 'PERCENT' })
    expect(byPercent.tolerancePercent).toBe(1)
    expect(byPercent.toleranceAmount).toBeUndefined()
  })

  // --- proposalSignature ---------------------------------------------------

  /** What decides the proposal changes the signature; what does not, does not. */
  it('proposalSignatureTest', () => {
    const base = settings()

    expect(proposalSignature(base)).toBe(proposalSignature(settings()))
    expect(proposalSignature(settings({ amount: '0.50' }))).not.toBe(proposalSignature(base))
    expect(proposalSignature(settings({ reason: 'SKONTO' }))).not.toBe(proposalSignature(base))
    expect(proposalSignature(settings({ toleranceKind: 'PERCENT' }))).not.toBe(
      proposalSignature(base),
    )
  })

  /** The unused form does not move the signature — switching to it and back proposes the same. */
  it('proposalSignatureIgnoresTheOtherFormTest', () => {
    expect(proposalSignature(settings({ percent: '5' }))).toBe(proposalSignature(settings()))
  })

  // --- the selection -------------------------------------------------------

  it('selectionTotalTest', () => {
    const rows = [candidate(11, 0.2), candidate(12, 0.05), candidate(13, 0.15)]

    expect(selectionTotal(rows, new Set([11, 13]))).toBeCloseTo(0.35, 4)
    expect(selectionTotal(rows, new Set())).toBe(0)
    // An id from another page is simply not on this one and adds nothing.
    expect(selectionTotal(rows, new Set([99]))).toBe(0)
  })

  it('selectionCountTextTest', () => {
    expect(selectionCountText(0)).toBe('')
    expect(selectionCountText(1)).toBe('1 Posten markiert')
    expect(selectionCountText(3)).toBe('3 Posten markiert')
  })

  // --- runResultText -------------------------------------------------------

  it('runResultTextTest', () => {
    const answer = result({ postedCount: 3, postedTotal: 0.4 })

    expect(runResultText(answer, 'CHF')).toBe('3 Posten ausgebucht, 0.40 CHF.')
  })

  /** A run of three hundred is almost never wholly one thing, and the answer has to say so. */
  it('runResultTextWithPartialFailureTest', () => {
    const answer = result({
      postedCount: 1,
      postedTotal: 0.2,
      skippedCount: 2,
      skipped: [{ documentId: 12, documentNumber: 'RE-2', message: 'Inzwischen bezahlt' }],
      failed: [{ documentId: 13, documentNumber: 'RE-3', message: 'Fehler' }],
    })

    expect(runResultText(answer, 'CHF')).toBe(
      '1 Posten ausgebucht, 0.20 CHF, 1 übersprungen, 1 fehlgeschlagen.',
    )
  })

  it('runResultTextWithNothingBookedTest', () => {
    expect(runResultText(result(), 'CHF')).toBe('Nichts ausgebucht.')
  })
})
