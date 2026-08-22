import { describe, expect, it } from 'vitest'
import type { Product, VatRates } from '../../lib/types'
import { priceOriginText, productMeta, vatText } from './productInfo'

const RATES: VatRates = { STANDARD: 8.1, REDUCED: 2.6, ACCOMMODATION: 3.8 }

/** What this tenant calls its VAT treatments; the code stands in for an unknown one. */
const labelOf = (code: string | undefined) =>
  ({
    EXEMPT_WITHOUT_CREDIT: 'Von der Steuer ausgenommen',
    EXEMPT_WITH_CREDIT: 'Von der Steuer befreit',
  })[code ?? ''] ?? (code ?? '-')

function product(fields: Partial<Product>): Product {
  return { id: 1, name: 'Wartung', productType: 'SERVICE', unit: 'PIECE', ...fields }
}

describe('vatText', () => {
  it('vatTextTest', () => {
    expect(vatText(RATES, 'STANDARD', labelOf)).toBe('8.1 %')
  })

  it('vatTextWithATreatmentThatCarriesNoRateTest', () => {
    // The rate endpoint answers zero for both exempt treatments. "0 %" would make "befreit"
    // (Art. 23, tax shown at zero) and "ausgenommen" (Art. 21, no tax shown) look the same,
    // and both look like a regular rate that happens to be zero.
    expect(vatText({ EXEMPT_WITH_CREDIT: 0 }, 'EXEMPT_WITH_CREDIT', labelOf)).toBe(
      'Von der Steuer befreit',
    )
    expect(vatText({ EXEMPT_WITHOUT_CREDIT: 0 }, 'EXEMPT_WITHOUT_CREDIT', labelOf)).toBe(
      'Von der Steuer ausgenommen',
    )
  })

  it('vatTextWithARateOfZeroTest', () => {
    // A rate of zero on a treatment that does carry rates is a rate, not a missing one.
    expect(vatText({ STANDARD: 0 }, 'STANDARD', labelOf)).toBe('0 %')
  })

  it('vatTextWithoutARateForThatDayTest', () => {
    // No figure rather than the wrong one: the day of supply decides the rate.
    expect(vatText(RATES, 'EXEMPT_WITHOUT_CREDIT', labelOf)).toBe('Von der Steuer ausgenommen')
  })

  it('vatTextWhileTheRatesAreOnTheirWayTest', () => {
    expect(vatText(undefined, 'STANDARD', labelOf)).toBe('STANDARD')
  })

  it('vatTextWithoutACategoryTest', () => {
    expect(vatText(RATES, undefined, labelOf)).toBeUndefined()
  })
})

describe('productMeta', () => {
  it('productMetaTest', () => {
    const entries = productMeta(
      product({ unitLabel: 'Stk', revenueAccount: '3000' }),
      '8.1 %',
    )

    expect(entries).toEqual(['Stk', '3000', '8.1 %'])
  })

  it('productMetaFallsBackToTheUnitCodeTest', () => {
    expect(productMeta(product({ unit: 'HOUR' }), undefined)).toEqual(['HOUR'])
  })

  it('productMetaWithoutAnyDetailTest', () => {
    expect(productMeta(product({ unit: '' }), undefined)).toEqual([])
  })
})

describe('priceOriginText', () => {
  it('priceOriginTextTest', () => {
    expect(priceOriginText('PRICE_GROUP')).toBe('Preisgruppe')
  })

  it('priceOriginTextForEveryOriginTest', () => {
    expect(priceOriginText('PARTNER')).toBe('Kundenpreis')
    expect(priceOriginText('DEFAULT_PRICE_GROUP')).toBe('Standard-Preisgruppe')
    expect(priceOriginText('BASE')).toBe('Grundpreis')
  })
})
