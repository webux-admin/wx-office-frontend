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
  /** The picker offers every kind, or one of them could never be chosen. */
  it('paymentKindOrderCoversEveryKindTest', () => {
    const named = Object.keys(PAYMENT_KINDS) as PaymentKind[]

    expect([...PAYMENT_KIND_ORDER].sort()).toEqual([...named].sort())
  })

  it('paymentKindOrderStartsWithTheEverydayCaseTest', () => {
    expect(PAYMENT_KIND_ORDER[0]).toBe('PAYMENT')
  })

  /** The three that carry a VAT consequence this application does not book. */
  it('reducesConsiderationTest', () => {
    expect([...REDUCES_CONSIDERATION].sort()).toEqual(['CREDIT', 'DISCOUNT', 'WRITE_OFF'])
  })

  it('reducesConsiderationExcludesMoneyAndRoundingTest', () => {
    expect(REDUCES_CONSIDERATION).not.toContain('PAYMENT')
    expect(REDUCES_CONSIDERATION).not.toContain('ROUNDING')
  })
})
