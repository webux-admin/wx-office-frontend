import { describe, expect, it } from 'vitest'
import {
  activeChanged,
  emptyProduct,
  firstComplaint,
  toForm,
  toFreeFieldForm,
  toFreeFieldPayload,
  toPayload,
} from './productForm'
import type { FreeFieldSlot } from './productForm'
import type { Product, ProductFreeFieldValue } from '../../lib/types'

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
  })

  it('toFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toForm({ id: 1, productType: 'GOODS', name: 'Couvert', unit: 'PIECE' })

    expect(form.subtitle).toBe('')
    expect(form.description).toBe('')
    expect(form.internalComment).toBe('')
    expect(form.eanCode).toBe('')
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
    })

    expect(payload.name).toBe('Beratung')
    expect(payload.subtitle).toBe('Pro angefangene Stunde')
    expect(payload.internalComment).toBe('Nur nach Absprache')
    expect(payload.eanCode).toBe('4006381333931')
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

  it('toPayloadLeavesOutThePricesTest', () => {
    // They have an endpoint of their own, so a master data payload must not carry them.
    expect('prices' in toPayload(COMPLETE)).toBe(false)
    expect('basePrice' in toPayload(COMPLETE)).toBe(false)
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


/** One place of each kind, the way a product carries them. */
const FREE_FIELDS: ProductFreeFieldValue[] = [
  { code: 'TEXT_1', type: 'TEXT', label: 'Herkunft', text: 'Schweiz' },
  { code: 'NUMBER_2', type: 'NUMBER', label: 'Garantie', number: 24 },
  { code: 'FLAG_1', type: 'FLAG', label: 'Zollpflichtig', flag: true },
]

const SLOTS: FreeFieldSlot[] = [
  { code: 'TEXT_1', type: 'TEXT' },
  { code: 'NUMBER_2', type: 'NUMBER' },
  { code: 'FLAG_1', type: 'FLAG' },
]

describe('toFreeFieldForm', () => {
  it('toFreeFieldFormTest', () => {
    const form = toFreeFieldForm(FREE_FIELDS)

    expect(form).toEqual({ TEXT_1: 'Schweiz', NUMBER_2: '24', FLAG_1: 'true' })
  })

  it('toFreeFieldFormWithEmptyValuesTest', () => {
    const form = toFreeFieldForm([
      { code: 'TEXT_1', type: 'TEXT', text: null },
      { code: 'NUMBER_2', type: 'NUMBER', number: null },
      { code: 'FLAG_1', type: 'FLAG', flag: false },
    ])

    expect(form).toEqual({ TEXT_1: '', NUMBER_2: '', FLAG_1: '' })
  })

  it('toFreeFieldFormKeepsAZeroTest', () => {
    const form = toFreeFieldForm([{ code: 'NUMBER_1', type: 'NUMBER', number: 0 }])

    expect(form.NUMBER_1).toBe('0')
  })

  it('toFreeFieldFormWithoutFieldsTest', () => {
    expect(toFreeFieldForm(undefined)).toEqual({})
    expect(toFreeFieldForm([])).toEqual({})
  })
})

describe('toFreeFieldPayload', () => {
  it('toFreeFieldPayloadTest', () => {
    const form = { ...COMPLETE, freeFields: { TEXT_1: 'Schweiz', NUMBER_2: '24', FLAG_1: 'true' } }

    expect(toFreeFieldPayload(form, SLOTS)).toEqual([
      { code: 'TEXT_1', text: 'Schweiz' },
      { code: 'NUMBER_2', number: 24 },
      { code: 'FLAG_1', flag: true },
    ])
  })

  it('toFreeFieldPayloadSendsAClearedFieldTest', () => {
    // Left out, the update would keep the stored value -- clearing has to reach the record.
    const form = { ...COMPLETE, freeFields: { TEXT_1: '  ', NUMBER_2: '', FLAG_1: '' } }

    expect(toFreeFieldPayload(form, SLOTS)).toEqual([
      { code: 'TEXT_1', text: null },
      { code: 'NUMBER_2', number: null },
      { code: 'FLAG_1', flag: false },
    ])
  })

  it('toFreeFieldPayloadTrimsTextTest', () => {
    const form = { ...COMPLETE, freeFields: { TEXT_1: '  Bio  ' } }

    expect(toFreeFieldPayload(form, [{ code: 'TEXT_1', type: 'TEXT' }])).toEqual([
      { code: 'TEXT_1', text: 'Bio' },
    ])
  })

  it('toFreeFieldPayloadWithoutSlotsTest', () => {
    const form = { ...COMPLETE, freeFields: { TEXT_1: 'Schweiz' } }

    expect(toFreeFieldPayload(form, undefined)).toBeUndefined()
    expect(toFreeFieldPayload(form, [])).toBeUndefined()
  })

  it('toFreeFieldPayloadOfAnUntouchedFieldTest', () => {
    // A place the mask never showed a value for is sent as empty, not skipped.
    expect(toFreeFieldPayload(COMPLETE, [{ code: 'TEXT_1', type: 'TEXT' }])).toEqual([
      { code: 'TEXT_1', text: null },
    ])
  })
})

describe('toPayload with free fields', () => {
  it('toPayloadCarriesFreeFieldsTest', () => {
    const form = { ...COMPLETE, freeFields: { TEXT_1: 'Schweiz' } }

    expect(toPayload(form, [{ code: 'TEXT_1', type: 'TEXT' }]).freeFields).toEqual([
      { code: 'TEXT_1', text: 'Schweiz' },
    ])
  })

  it('toPayloadWithoutFreeFieldsTest', () => {
    // A tenant that defined none: the key stays out of the payload altogether.
    expect(toPayload(COMPLETE).freeFields).toBeUndefined()
  })
})

describe('toForm with free fields', () => {
  it('toFormReadsFreeFieldsTest', () => {
    const form = toForm({ ...STORED, freeFields: FREE_FIELDS })

    expect(form.freeFields).toEqual({ TEXT_1: 'Schweiz', NUMBER_2: '24', FLAG_1: 'true' })
  })

  it('toFormWithoutFreeFieldsTest', () => {
    expect(toForm(STORED).freeFields).toEqual({})
  })
})
