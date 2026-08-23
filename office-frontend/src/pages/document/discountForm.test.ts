import { describe, expect, it } from 'vitest'
import type { SalesDocument } from '../../lib/types'
import {
  discountComplaint,
  previewNet,
  toDiscountForm,
  toDiscountPayload,
  type DiscountForm,
} from './discountForm'

/** A document, with only what the test cares about spelled out. */
function document(fields: Partial<SalesDocument> = {}): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    currency: 'CHF',
    totalNet: 450,
    totalVat: 36.45,
    totalGross: 486.45,
    subtotalsIncludeVat: false,
    pricesIncludeVat: false,
    lines: [],
    ...fields,
  } as SalesDocument
}

/** The panel, with only what the test cares about spelled out. */
function form(fields: Partial<DiscountForm> = {}): DiscountForm {
  return { mode: 'NONE', percent: '', amount: '', ...fields }
}

describe('toDiscountForm', () => {
  it('toDiscountFormWithAPercentageTest', () => {
    expect(toDiscountForm(document({ discountPercent: 10 }))).toEqual({
      mode: 'PERCENT',
      percent: '10',
      amount: '',
    })
  })

  it('toDiscountFormWithAnAmountTest', () => {
    expect(toDiscountForm(document({ discountAmount: 45 }))).toEqual({
      mode: 'AMOUNT',
      percent: '',
      amount: '45',
    })
  })

  it('toDiscountFormWithoutADiscountTest', () => {
    expect(toDiscountForm(document()).mode).toBe('NONE')
  })
})

describe('toDiscountPayload', () => {
  it('toDiscountPayloadWithAPercentageTest', () => {
    expect(toDiscountPayload(form({ mode: 'PERCENT', percent: '10' }))).toEqual({ percent: 10 })
  })

  it('toDiscountPayloadWithAnAmountTest', () => {
    expect(toDiscountPayload(form({ mode: 'AMOUNT', amount: '45.50' }))).toEqual({
      amount: 45.5,
    })
  })

  /** Only the field of the chosen form travels; the other one is not a second opinion. */
  it('toDiscountPayloadSendsOnlyTheChosenFormTest', () => {
    const payload = toDiscountPayload(form({ mode: 'PERCENT', percent: '10', amount: '45' }))

    expect(payload).toEqual({ percent: 10 })
  })

  /** Both absent is how a discount is taken away, not how it is left unchanged. */
  it('toDiscountPayloadWithoutADiscountTest', () => {
    expect(toDiscountPayload(form())).toEqual({})
  })
})

describe('discountComplaint', () => {
  it('discountComplaintTest', () => {
    expect(discountComplaint(form({ mode: 'PERCENT', percent: '10' }), 450)).toBeNull()
  })

  it('discountComplaintWithoutADiscountTest', () => {
    expect(discountComplaint(form(), 450)).toBeNull()
  })

  it('discountComplaintWithAnUnreadablePercentageTest', () => {
    expect(discountComplaint(form({ mode: 'PERCENT', percent: 'zehn' }), 450)).toBe(
      'Der Rabatt ist keine Zahl.',
    )
  })

  it('discountComplaintWithAPercentageOutOfRangeTest', () => {
    expect(discountComplaint(form({ mode: 'PERCENT', percent: '0' }), 450)).toBe(
      'Ein Belegrabatt liegt zwischen 0 und 100 Prozent.',
    )
    expect(discountComplaint(form({ mode: 'PERCENT', percent: '101' }), 450)).toBe(
      'Ein Belegrabatt liegt zwischen 0 und 100 Prozent.',
    )
  })

  /** A whole free delivery is a decision, not a mistake. */
  it('discountComplaintWithAHundredPerCentTest', () => {
    expect(discountComplaint(form({ mode: 'PERCENT', percent: '100' }), 450)).toBeNull()
  })

  it('discountComplaintWithAnAmountLargerThanTheBaseTest', () => {
    expect(discountComplaint(form({ mode: 'AMOUNT', amount: '500' }), 450)).toBe(
      'Der Rabatt ist grösser als der rabattfähige Betrag.',
    )
  })

  /** A counter document has a negative base; the amount is still entered without a sign. */
  it('discountComplaintWithANegativeBaseTest', () => {
    expect(discountComplaint(form({ mode: 'AMOUNT', amount: '45' }), -450)).toBeNull()
  })

  it('discountComplaintWithoutAKnownBaseTest', () => {
    expect(discountComplaint(form({ mode: 'AMOUNT', amount: '500' }), undefined)).toBeNull()
  })

  it('discountComplaintWithAnAmountOfZeroTest', () => {
    expect(discountComplaint(form({ mode: 'AMOUNT', amount: '0' }), 450)).toBe(
      'Der Rabatt ist grösser als null.',
    )
  })
})

describe('previewNet', () => {
  it('previewNetTest', () => {
    expect(previewNet(form({ mode: 'PERCENT', percent: '10' }), 450)).toBe(45)
  })

  it('previewNetRoundsToTheRappenTest', () => {
    expect(previewNet(form({ mode: 'PERCENT', percent: '7.5' }), 1234.55)).toBe(92.59)
  })

  /** An amount is what it says; there is nothing to preview. */
  it('previewNetForAnAmountTest', () => {
    expect(previewNet(form({ mode: 'AMOUNT', amount: '45' }), 450)).toBeNull()
  })

  it('previewNetWithoutAKnownBaseTest', () => {
    expect(previewNet(form({ mode: 'PERCENT', percent: '10' }), undefined)).toBeNull()
  })

  it('previewNetWithAnUnreadablePercentageTest', () => {
    expect(previewNet(form({ mode: 'PERCENT', percent: 'zehn' }), 450)).toBeNull()
  })
})
