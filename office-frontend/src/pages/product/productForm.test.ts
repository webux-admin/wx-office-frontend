import { describe, expect, it } from 'vitest'
import { activeChanged, emptyProduct, firstComplaint, toForm, toPayload } from './productForm'
import type { Product } from '../../lib/types'

const EMPTY = emptyProduct()
// The mask starts without a unit and the dropdown fills in the default of the tenant, so a
// complete record in these tests carries one.
const COMPLETE = { ...EMPTY, name: 'Beratung', unit: 'HOUR' }

const STORED: Product = {
  id: 7,
  productNumber: 'P-001',
  active: true,
  productType: 'SERVICE',
  name: 'Beratung',
  subtitle: 'Pro angefangene Stunde',
  description: 'Fachliche Begleitung vor Ort',
  internalComment: 'Nur nach Absprache mit der Leitung',
  eanCode: '4006381333931',
  discountable: false,
  unit: 'HOUR',
  revenueAccount: '3200',
  vatCategory: 'STANDARD',
  basePrice: 150,
}

describe('emptyProduct', () => {
  it('emptyProductTest', () => {
    const form = emptyProduct()

    expect(form.name).toBe('')
    expect(form.productType).toBe('GOODS')
    expect(form.vatCategory).toBe('STANDARD')
  })

  it('emptyProductStartsActiveAndDiscountableTest', () => {
    const form = emptyProduct()

    expect(form.active).toBe(true)
    expect(form.discountable).toBe(true)
  })

  it('emptyProductHasNoUnitSoTheDropdownFillsTheDefaultTest', () => {
    expect(emptyProduct().unit).toBe('')
  })
})

describe('toForm', () => {
  it('toFormTest', () => {
    const form = toForm(STORED)

    expect(form.name).toBe('Beratung')
    expect(form.productNumber).toBe('P-001')
    expect(form.subtitle).toBe('Pro angefangene Stunde')
    expect(form.internalComment).toBe('Nur nach Absprache mit der Leitung')
    expect(form.eanCode).toBe('4006381333931')
    expect(form.basePrice).toBe('150')
  })

  it('toFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toForm({ id: 1, productType: 'GOODS', name: 'Couvert', unit: 'PIECE' })

    expect(form.subtitle).toBe('')
    expect(form.description).toBe('')
    expect(form.internalComment).toBe('')
    expect(form.eanCode).toBe('')
    expect(form.basePrice).toBe('')
  })

  it('toFormReadsTheDiscountFlagTest', () => {
    expect(toForm(STORED).discountable).toBe(false)
  })

  it('toFormTreatsAnAbsentFlagAsSetTest', () => {
    // An older record answered without the flag; that means discountable, not "unknown".
    const form = toForm({ id: 1, productType: 'GOODS', name: 'Couvert', unit: 'PIECE' })

    expect(form.discountable).toBe(true)
    expect(form.active).toBe(true)
  })

  it('toFormReadsADeactivatedProductTest', () => {
    expect(toForm({ ...STORED, active: false }).active).toBe(false)
  })
})

describe('toPayload', () => {
  it('toPayloadTest', () => {
    const payload = toPayload({
      ...COMPLETE,
      subtitle: 'Pro angefangene Stunde',
      internalComment: 'Nur nach Absprache',
      eanCode: '4006381333931',
      basePrice: '150.50',
    })

    expect(payload.name).toBe('Beratung')
    expect(payload.subtitle).toBe('Pro angefangene Stunde')
    expect(payload.internalComment).toBe('Nur nach Absprache')
    expect(payload.eanCode).toBe('4006381333931')
    expect(payload.basePrice).toBe(150.5)
  })

  it('toPayloadLeavesOutEmptyTextsTest', () => {
    const payload = toPayload(COMPLETE)

    expect(payload.subtitle).toBeUndefined()
    expect(payload.description).toBeUndefined()
    expect(payload.internalComment).toBeUndefined()
    expect(payload.eanCode).toBeUndefined()
    expect(payload.productNumber).toBeUndefined()
  })

  it('toPayloadTrimsTextsTest', () => {
    const payload = toPayload({ ...COMPLETE, subtitle: '  Pro Stunde  ', eanCode: ' 4006381333931 ' })

    expect(payload.subtitle).toBe('Pro Stunde')
    expect(payload.eanCode).toBe('4006381333931')
  })

  it('toPayloadKeepsTheDiscountFlagEvenWhenItIsOffTest', () => {
    // A flag is not a text: false is a value, not "nothing given", and has to be sent.
    expect(toPayload({ ...COMPLETE, discountable: false }).discountable).toBe(false)
  })

  it('toPayloadLeavesOutTheActiveFlagTest', () => {
    // It has its own endpoint and its own right, so it must not ride along here.
    expect('active' in toPayload({ ...COMPLETE, active: false })).toBe(false)
  })

  it('toPayloadWithoutABasePriceTest', () => {
    expect(toPayload({ ...COMPLETE, basePrice: '' }).basePrice).toBeUndefined()
  })
})

describe('firstComplaint', () => {
  it('firstComplaintTest', () => {
    expect(firstComplaint(COMPLETE)).toBeNull()
  })

  it('firstComplaintWithoutANameTest', () => {
    expect(firstComplaint({ ...COMPLETE, name: '   ' })).toContain('Bezeichnung')
  })

  it('firstComplaintWithoutAUnitTest', () => {
    expect(firstComplaint({ ...COMPLETE, unit: '' })).toContain('Einheit')
  })

  it('firstComplaintNamesTheFirstProblemOnlyTest', () => {
    expect(firstComplaint({ ...COMPLETE, name: '', unit: '' })).toContain('Bezeichnung')
  })
})

describe('activeChanged', () => {
  it('activeChangedTest', () => {
    expect(activeChanged({ ...COMPLETE, active: false }, STORED)).toBe(true)
  })

  it('activeChangedWithTheSameStateTest', () => {
    expect(activeChanged({ ...COMPLETE, active: true }, STORED)).toBe(false)
  })

  it('activeChangedWhenTheProductIsReactivatedTest', () => {
    expect(activeChanged({ ...COMPLETE, active: true }, { ...STORED, active: false })).toBe(true)
  })

  it('activeChangedForANewProductTest', () => {
    // A new product is created active, so only unticking the box needs a second request.
    expect(activeChanged({ ...COMPLETE, active: true }, null)).toBe(false)
    expect(activeChanged({ ...COMPLETE, active: false }, null)).toBe(true)
  })
})
