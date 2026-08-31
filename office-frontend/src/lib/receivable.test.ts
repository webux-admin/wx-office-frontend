import { describe, expect, it } from 'vitest'
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_ORDER,
  REDUCES_CONSIDERATION,
  openState,
  stillCounts,
} from './receivable'
import type { Payment, PaymentKind } from './types'

/** One settlement line, with only the parts these functions look at filled in properly. */
function line(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    documentId: 7,
    kind: 'PAYMENT',
    amount: 100,
    currency: 'CHF',
    valueDate: '2026-08-20',
    originalAmount: 100,
    originalCurrency: 'CHF',
    exchangeRate: 1,
    exchangeRateUnit: 1,
    source: 'MANUAL',
    recordedAt: '2026-08-20T09:15:00Z',
    recordedBy: 'anna',
    ...overrides,
  }
}

describe('openState', () => {
  it('openStateTest', () => {
    expect(openState(250)).toBe('open')
  })

  it('openStateWhenSettledTest', () => {
    expect(openState(0)).toBe('settled')
  })

  it('openStateWhenOverpaidTest', () => {
    expect(openState(-0.2)).toBe('credit')
  })

  /** Absent is not the same as zero for the backend, but on screen both read «nothing open». */
  it('openStateWithoutAnAmountTest', () => {
    expect(openState(undefined)).toBe('settled')
  })

  it('openStateOfATinyDebtTest', () => {
    expect(openState(0.01)).toBe('open')
  })

  it('openStateOfATinyCreditTest', () => {
    expect(openState(-0.01)).toBe('credit')
  })
})

describe('stillCounts', () => {
  it('stillCountsTest', () => {
    expect(stillCounts(line())).toBe(true)
  })

  it('stillCountsOfAReversedLineTest', () => {
    expect(stillCounts(line({ reversedByPaymentId: 2 }))).toBe(false)
  })

  it('stillCountsOfACounterLineTest', () => {
    expect(stillCounts(line({ id: 2, amount: -100, reversesPaymentId: 1 }))).toBe(false)
  })
})

describe('the kind catalogue', () => {
  /**
   * Every kind has a name, or a settlement line would show up unnamed.
   *
   * <p>The picker is a shorter list than the catalogue and has to stay one: the three kinds
   * a write-off produces — Bankspesen, Kursdifferenz and eine einbehaltene Überzahlung —
   * arise from the write-off dialog and never from recording a payment (backend ADR-0101).
   */
  it('paymentKindsNameEveryKindTest', () => {
    const named = Object.keys(PAYMENT_KINDS) as PaymentKind[]

    for (const kind of PAYMENT_KIND_ORDER) expect(named).toContain(kind)
    expect(named).toContain('BANK_CHARGE')
    expect(named).toContain('EXCHANGE_DIFFERENCE')
    expect(named).toContain('OVERPAYMENT_KEPT')
  })

  /**
   * Two kinds became choosable with the foreign-currency payment, and two stayed out.
   *
   * <p>`BANK_CHARGE` and `EXCHANGE_DIFFERENCE` close what a conversion leaves over — the
   * bank keeps its fee on the way, and the rate moves between invoice and payment. Neither
   * reduces the agreed consideration (MWSTV Art. 45 and Art. 46), which is why they are
   * offered here and still absent from `REDUCES_CONSIDERATION` (backend ADR-0106).
   *
   * <p>`OVERPAYMENT_KEPT` and `ADVANCE_APPLIED` stay out: the first is a decision with a
   * ceiling and belongs in the write-off dialog (ADR-0039), the second comes into being only
   * through the credit screen (backend ADR-0104).
   */
  it('paymentKindOrderOffersWhatAConversionLeavesTest', () => {
    expect(PAYMENT_KIND_ORDER).toContain('BANK_CHARGE')
    expect(PAYMENT_KIND_ORDER).toContain('EXCHANGE_DIFFERENCE')
    expect(PAYMENT_KIND_ORDER).not.toContain('OVERPAYMENT_KEPT')
    expect(PAYMENT_KIND_ORDER).not.toContain('ADVANCE_APPLIED')
    // And neither of the two newcomers ever became an Entgeltsminderung.
    expect(REDUCES_CONSIDERATION).not.toContain('BANK_CHARGE')
    expect(REDUCES_CONSIDERATION).not.toContain('EXCHANGE_DIFFERENCE')
  })

  it('paymentKindOrderStartsWithTheEverydayCaseTest', () => {
    expect(PAYMENT_KIND_ORDER[0]).toBe('PAYMENT')
  })

  /**
   * The kinds that carry a VAT consequence under MWSTG Art. 41.
   *
   * <p>`ROUNDING` is among them since the write-off was built: Swiss law knows no statutory
   * threshold in francs, and a later exemption removes rows while a correction caught up
   * afterwards has to invent them (backend ADR-0101).
   */
  it('reducesConsiderationTest', () => {
    expect([...REDUCES_CONSIDERATION].sort()).toEqual([
      'CREDIT',
      'DISCOUNT',
      'OVERPAYMENT_KEPT',
      'ROUNDING',
      'WRITE_OFF',
    ])
  })

  /** Money that arrived, and the two that close the item without touching the price. */
  it('reducesConsiderationExcludesMoneyAndFeesTest', () => {
    expect(REDUCES_CONSIDERATION).not.toContain('PAYMENT')
    expect(REDUCES_CONSIDERATION).not.toContain('BANK_CHARGE')
    expect(REDUCES_CONSIDERATION).not.toContain('EXCHANGE_DIFFERENCE')
  })
})
