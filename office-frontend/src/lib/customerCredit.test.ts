import { describe, expect, it } from 'vitest'
import {
  CREDIT_AGE_BANDS,
  CREDIT_USE_REASONS,
  CUSTOMER_CREDIT_PATH,
  CUSTOMER_CREDIT_RIGHTS,
  RECEIPT_KINDS,
  REFUND_REASON_ORDER,
  RELEASE_REASON_ORDER,
  creditAgeBand,
  customerCreditQuery,
  customerCreditsKey,
} from './customerCredit'

/**
 * The building block behind the credit screen: path, rights, query keys and the age bands.
 *
 * <p>Nothing here recomputes a figure — the remainder and the balance are answers of the
 * server. What is checked is what the mask decides on its own.
 */

describe('customerCredit', () => {
  /**
   * Reading is `INVOICE_READ` and no right of its own.
   *
   * <p>The credit balance is the other side of the open items; whoever may see the debtor
   * list must see the liability side, or they read half the truth (backend ADR-0104).
   */
  it('customerCreditRightsTest', () => {
    expect(CUSTOMER_CREDIT_RIGHTS.read).toBe('INVOICE_READ')
    expect(CUSTOMER_CREDIT_RIGHTS.record).toBe('CUSTOMER_CREDIT_RECORD')
    expect(CUSTOMER_CREDIT_RIGHTS.refund).toBe('CUSTOMER_CREDIT_REFUND')
  })

  it('customerCreditPathTest', () => {
    expect(CUSTOMER_CREDIT_PATH).toBe('/guthaben')
  })

  /** Every kind and every reason has a German word, so no code ever reaches a screen. */
  it('customerCreditLabelsTest', () => {
    expect(Object.values(RECEIPT_KINDS).every((label) => label.length > 0)).toBe(true)
    expect(Object.values(CREDIT_USE_REASONS).every((label) => label.length > 0)).toBe(true)
  })

  /** The two ways out are offered separately; a refund reason is never a release reason. */
  it('customerCreditReasonOrderTest', () => {
    expect(REFUND_REASON_ORDER.every((code) => code.startsWith('REFUND_'))).toBe(true)
    expect(RELEASE_REASON_ORDER.every((code) => code.startsWith('RELEASE_'))).toBe(true)
    expect([...REFUND_REASON_ORDER, ...RELEASE_REASON_ORDER].sort()).toEqual(
      (Object.keys(CREDIT_USE_REASONS) as (keyof typeof CREDIT_USE_REASONS)[]).sort(),
    )
  })
})

// --- the query -------------------------------------------------------------

describe('customerCreditQuery', () => {
  it('customerCreditQueryTest', () => {
    const query = customerCreditQuery({ partnerId: 42, kind: 'ADVANCE', minimumAgeDays: 365 })

    expect(query).toContain('partnerId=42')
    expect(query).toContain('kind=ADVANCE')
    expect(query).toContain('minimumAgeDays=365')
  })

  /** A false checkbox must not travel: the server would read it as a filter. */
  it('customerCreditQueryLeavesOutWhatWasNotAskedTest', () => {
    expect(customerCreditQuery({})).toBe('')
    expect(customerCreditQuery({ includeSettled: false })).toBe('')
    expect(customerCreditQuery({ includeSettled: true })).toContain('includeSettled=true')
  })
})

describe('customerCreditsKey', () => {
  it('customerCreditsKeyTest', () => {
    expect(customerCreditsKey(1)).toEqual(['customer-credits', 1])
    expect(customerCreditsKey(1, 'partnerId=42')).toEqual([
      'customer-credits',
      1,
      'partnerId=42',
    ])
  })
})

// --- the age bands ---------------------------------------------------------

/**
 * A credit must not grow old in silence.
 *
 * <p>Which period applies depends on where the money came from — a prepayment is a contractual
 * claim (OR Art. 127, ten years), an overpayment is unjust enrichment (OR Art. 67). The bands
 * make the age visible and name nothing as expired: limitation is a defence (OR Art. 142).
 */
describe('creditAgeBand', () => {
  it('creditAgeBandTest', () => {
    expect(creditAgeBand(0)).toBe('bis 90 Tage')
    expect(creditAgeBand(90)).toBe('bis 90 Tage')
    expect(creditAgeBand(91)).toBe('91–365 Tage')
    expect(creditAgeBand(365)).toBe('91–365 Tage')
    expect(creditAgeBand(366)).toBe('1–3 Jahre')
    expect(creditAgeBand(1096)).toBe('über 3 Jahre')
  })

  /** Beyond ten years there is no further band; it is the last one. */
  it('creditAgeBandOnAVeryOldCreditTest', () => {
    expect(creditAgeBand(4000)).toBe('über 10 Jahre')
    expect(creditAgeBand(99999)).toBe('über 10 Jahre')
  })

  /** Every band but the last carries a bound, so the filter can send a number. */
  it('creditAgeBandsAreOpenOnlyAtTheEndTest', () => {
    expect(CREDIT_AGE_BANDS.slice(0, -1).every((band) => band.upToDays !== null)).toBe(true)
    expect(CREDIT_AGE_BANDS[CREDIT_AGE_BANDS.length - 1]!.upToDays).toBeNull()
  })
})
