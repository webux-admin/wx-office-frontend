import { describe, expect, it } from 'vitest'
import type { DocumentLine, SalesDocument } from '../../lib/types'
import {
  currencyChanged,
  headerFieldsChanged,
  headerKey,
  paymentKey,
  freeLineNumbers,
  freeLineWarning,
  headerPayload,
  headerUnchanged,
  listNumbers,
  toHeaderForm,
  validityBeforeHeader,
  validityChanged,
  type HeaderForm,
} from './headerForm'

/** A draft in the middle of the value range: foreign currency, a rate, three positions. */
function draft(fields: Partial<SalesDocument> = {}): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    language: 'de',
    currency: 'EUR',
    baseCurrency: 'CHF',
    exchangeRate: 0.94,
    exchangeRateDate: '2026-08-21',
    totalNet: 1250,
    totalVat: 101.25,
    totalGross: 1351.25,
    subtotalsIncludeVat: false,
    pricesIncludeVat: false,
    ...fields,
  }
}

/** One line, with only what the test cares about spelled out. */
function line(fields: Partial<DocumentLine> & { lineNumber: number }): DocumentLine {
  return { kind: 'ITEM', priceIncludesVat: false, lineNet: 0, lineVat: 0, lineGross: 0, ...fields }
}

const LINES: DocumentLine[] = [
  line({ lineNumber: 1, productId: 7, description: 'Wartung' }),
  line({ lineNumber: 2, description: 'Nach Aufwand' }),
  line({ lineNumber: 3, kind: 'COMMENT', description: 'Ausserhalb der Bürozeiten' }),
  line({ lineNumber: 4, description: 'Anfahrt' }),
]

describe('toHeaderForm', () => {
  it('toHeaderFormTest', () => {
    const form = toHeaderForm(draft())

    expect(form).toEqual({
      documentDate: '2026-08-21',
      language: 'de',
      currency: 'EUR',
      exchangeRate: '0.94',
      exchangeRateDate: '2026-08-21',
      validUntil: '',
    })
  })

  it('toHeaderFormWithValidUntilTest', () => {
    const form = toHeaderForm(draft({ validUntil: '2026-09-20' }))

    expect(form.validUntil).toBe('2026-09-20')
  })

  it('toHeaderFormWithoutOptionalFieldsTest', () => {
    const form = toHeaderForm(
      draft({ language: undefined, exchangeRate: undefined, exchangeRateDate: undefined }),
    )

    expect(form.language).toBe('')
    expect(form.exchangeRate).toBe('')
    expect(form.exchangeRateDate).toBe('')
    expect(form.validUntil).toBe('')
  })
})

describe('headerKey', () => {
  it('headerKeyTest', () => {
    expect(headerKey(draft())).toBe('2026-08-21|de|EUR|0.94|2026-08-21|')
  })

  it('headerKeyDiffersAfterACustomerChangeTest', () => {
    // What a customer change moves: the language, and with it the whole head.
    expect(headerKey(draft({ language: 'fr' }))).not.toBe(headerKey(draft()))
  })

  it('headerKeyDiffersAfterTheValidityChangedTest', () => {
    // Saving through /validity rewrites the stored date, and the section has to remount to
    // show it — the key is that mechanism.
    expect(headerKey(draft({ validUntil: '2026-09-20' }))).not.toBe(headerKey(draft()))
  })

  it('headerKeyIsStableWhileTheHeadIsTest', () => {
    // The lines change constantly; the section that edits the head must not remount for that.
    expect(headerKey(draft({ totalNet: 99 }))).toBe(headerKey(draft()))
  })

  it('headerKeyWithoutOptionalFieldsTest', () => {
    expect(headerKey(draft({ exchangeRate: undefined, exchangeRateDate: undefined }))).toBe(
      '2026-08-21|de|EUR|||',
    )
  })
})

describe('paymentKey', () => {
  it('paymentKeyTest', () => {
    expect(paymentKey(draft({ paymentTerm: '30', dueDate: '2026-09-20' }))).toBe('30|2026-09-20')
  })

  it('paymentKeyDiffersAfterACustomerChangeTest', () => {
    // What a customer change moves: the term follows the new customer.
    expect(paymentKey(draft({ paymentTerm: '30_2_10' }))).not.toBe(
      paymentKey(draft({ paymentTerm: '30' })),
    )
  })

  it('paymentKeyWithoutTermsTest', () => {
    expect(paymentKey(draft())).toBe('|')
  })
})

describe('currencyChanged', () => {
  it('currencyChangedTest', () => {
    const form = { ...toHeaderForm(draft()), currency: 'CHF' }

    expect(currencyChanged(form, draft())).toBe(true)
  })

  it('currencyChangedWithSameCurrencyTest', () => {
    expect(currencyChanged(toHeaderForm(draft()), draft())).toBe(false)
  })

  it('currencyChangedWithEmptyFieldTest', () => {
    // An empty dropdown means the list has not arrived, not "no currency".
    const form = { ...toHeaderForm(draft()), currency: '' }

    expect(currencyChanged(form, draft())).toBe(false)
  })
})

describe('headerUnchanged', () => {
  it('headerUnchangedTest', () => {
    expect(headerUnchanged(toHeaderForm(draft()), draft())).toBe(true)
  })

  it('headerUnchangedWithAnotherDateTest', () => {
    const form = { ...toHeaderForm(draft()), documentDate: '2026-08-22' }

    expect(headerUnchanged(form, draft())).toBe(false)
  })

  it('headerUnchangedWithSurroundingSpaceTest', () => {
    const form = { ...toHeaderForm(draft()), exchangeRate: ' 0.94 ' }

    expect(headerUnchanged(form, draft())).toBe(true)
  })

  it('headerUnchangedWithAnotherValidUntilTest', () => {
    // The date is part of the section, so moving only it has to enable «Übernehmen».
    const form = { ...toHeaderForm(draft()), validUntil: '2026-09-20' }

    expect(headerUnchanged(form, draft())).toBe(false)
  })
})

describe('headerFieldsChanged', () => {
  it('headerFieldsChangedTest', () => {
    const form = { ...toHeaderForm(draft()), documentDate: '2026-08-22' }

    expect(headerFieldsChanged(form, draft())).toBe(true)
  })

  it('headerFieldsChangedWithOnlyTheValidUntilMovedTest', () => {
    // The date travels through /validity alone: no header write for a date-only save.
    const form = { ...toHeaderForm(draft()), validUntil: '2026-09-20' }

    expect(headerFieldsChanged(form, draft())).toBe(false)
  })

  it('headerFieldsChangedWithoutChangeTest', () => {
    expect(headerFieldsChanged(toHeaderForm(draft()), draft())).toBe(false)
  })
})

describe('validityChanged', () => {
  it('validityChangedTest', () => {
    const stored = draft({ validUntil: '2026-09-20' })
    const form = { ...toHeaderForm(stored), validUntil: '2026-09-30' }

    expect(validityChanged(form, stored)).toBe(true)
  })

  it('validityChangedWhenClearedTest', () => {
    // Emptying the field is a change: it becomes { validUntil: null } on the way out.
    const stored = draft({ validUntil: '2026-09-20' })
    const form = { ...toHeaderForm(stored), validUntil: '' }

    expect(validityChanged(form, stored)).toBe(true)
  })

  it('validityChangedWithSameDateTest', () => {
    const stored = draft({ validUntil: '2026-09-20' })

    expect(validityChanged(toHeaderForm(stored), stored)).toBe(false)
  })

  it('validityChangedWithoutAnyDateTest', () => {
    // No stored date and an empty field are the same silence, not a change.
    expect(validityChanged(toHeaderForm(draft()), draft())).toBe(false)
  })

  it('validityChangedLeavesTheHeaderPayloadAloneTest', () => {
    // The date never travels with the header request, whose contract keeps a left-out field.
    const form = { ...toHeaderForm(draft()), validUntil: '2026-09-30' }

    expect(headerPayload(form, draft(), 'COPY')).toEqual({
      documentDate: undefined,
      languageCode: undefined,
      currencyCode: undefined,
      exchangeRate: undefined,
      exchangeRateDate: undefined,
      priceMode: 'COPY',
    })
  })
})

describe('validityBeforeHeader', () => {
  it('validityBeforeHeaderTest', () => {
    // Both dates move forward: the header would pass the STORED validity, so it must wait.
    const stored = draft({ validUntil: '2026-08-31' })
    const form = { ...toHeaderForm(stored), documentDate: '2026-09-15', validUntil: '2026-10-15' }

    expect(validityBeforeHeader(form, stored)).toBe(true)
  })

  it('validityBeforeHeaderWithBothDatesMovedBackTest', () => {
    // Both dates move back: the new validity would fall before the STORED document date,
    // so the header has to go first and shrink it.
    const stored = draft({ documentDate: '2026-08-21', validUntil: '2026-08-31' })
    const form = { ...toHeaderForm(stored), documentDate: '2026-07-01', validUntil: '2026-07-15' }

    expect(validityBeforeHeader(form, stored)).toBe(false)
  })

  it('validityBeforeHeaderWhenClearedTest', () => {
    // Clearing the validity can never fail, so it may safely go first when the new document
    // date passes the stored one.
    const stored = draft({ validUntil: '2026-08-31' })
    const form = { ...toHeaderForm(stored), documentDate: '2026-09-15', validUntil: '' }

    expect(validityBeforeHeader(form, stored)).toBe(true)
  })

  it('validityBeforeHeaderWithoutAStoredDateTest', () => {
    // Nothing stored means nothing the header could pass.
    const form = { ...toHeaderForm(draft()), documentDate: '2026-09-15', validUntil: '2026-10-15' }

    expect(validityBeforeHeader(form, draft())).toBe(false)
  })

  it('validityBeforeHeaderWithUnchangedValidityTest', () => {
    // Without a validity write there is nothing to order.
    const stored = draft({ validUntil: '2026-08-31' })
    const form = { ...toHeaderForm(stored), documentDate: '2026-08-25' }

    expect(validityBeforeHeader(form, stored)).toBe(false)
  })
})

describe('headerPayload', () => {
  it('headerPayloadTest', () => {
    const form: HeaderForm = { ...toHeaderForm(draft()), documentDate: '2026-08-22' }

    const payload = headerPayload(form, draft(), 'COPY')

    expect(payload).toEqual({
      documentDate: '2026-08-22',
      languageCode: undefined,
      currencyCode: undefined,
      exchangeRate: undefined,
      exchangeRateDate: undefined,
      priceMode: 'COPY',
    })
  })

  it('headerPayloadWithoutChangeTest', () => {
    const payload = headerPayload(toHeaderForm(draft()), draft(), 'COPY')

    expect(payload).toEqual({
      documentDate: undefined,
      languageCode: undefined,
      currencyCode: undefined,
      exchangeRate: undefined,
      exchangeRateDate: undefined,
      priceMode: 'COPY',
    })
  })

  it('headerPayloadWithAnotherCurrencyTest', () => {
    const form: HeaderForm = { ...toHeaderForm(draft()), currency: 'CHF', exchangeRate: '' }

    const payload = headerPayload(form, draft(), 'RECALCULATE')

    expect(payload.currencyCode).toBe('CHF')
    expect(payload.priceMode).toBe('RECALCULATE')
    // An emptied rate is not sent: a rate is dropped by writing in the tenant currency.
    expect(payload.exchangeRate).toBeUndefined()
  })

  it('headerPayloadReadsATypedCommaTest', () => {
    const form: HeaderForm = { ...toHeaderForm(draft()), exchangeRate: '0,97' }

    expect(headerPayload(form, draft(), 'COPY').exchangeRate).toBe(0.97)
  })
})

describe('freeLineNumbers', () => {
  it('freeLineNumbersTest', () => {
    expect(freeLineNumbers(LINES)).toEqual([2, 4])
  })

  it('freeLineNumbersWithoutLinesTest', () => {
    expect(freeLineNumbers(undefined)).toEqual([])
    expect(freeLineNumbers([])).toEqual([])
  })

  it('freeLineNumbersWithCatalogueLinesOnlyTest', () => {
    expect(freeLineNumbers([line({ lineNumber: 1, productId: 7 })])).toEqual([])
  })

  it('freeLineNumbersIgnoresStructureLinesTest', () => {
    // A comment carries no price, so nothing about it can be re-priced or kept.
    expect(freeLineNumbers([line({ lineNumber: 1, kind: 'SUBTOTAL' })])).toEqual([])
  })
})

describe('listNumbers', () => {
  it('listNumbersTest', () => {
    expect(listNumbers([2, 5, 7])).toBe('2, 5 und 7')
  })

  it('listNumbersWithOneNumberTest', () => {
    expect(listNumbers([4])).toBe('4')
  })

  it('listNumbersWithTwoNumbersTest', () => {
    expect(listNumbers([4, 9])).toBe('4 und 9')
  })

  it('listNumbersWithoutNumbersTest', () => {
    expect(listNumbers([])).toBe('')
  })
})

describe('freeLineWarning', () => {
  it('freeLineWarningTest', () => {
    expect(freeLineWarning(LINES, 'RECALCULATE')).toBe(
      'Die Positionen 2 und 4 sind von Hand geschrieben und behalten ihre eingegebenen Zahlen. Bitte nachher prüfen.',
    )
  })

  it('freeLineWarningWithOneLineTest', () => {
    const lines = [line({ lineNumber: 2 })]

    expect(freeLineWarning(lines, 'RECALCULATE')).toBe(
      'Position 2 ist von Hand geschrieben und behält ihre eingegebene Zahl. Bitte nachher prüfen.',
    )
  })

  it('freeLineWarningWhileKeepingPricesTest', () => {
    expect(freeLineWarning(LINES, 'COPY')).toBeUndefined()
  })

  it('freeLineWarningWithoutFreeLinesTest', () => {
    expect(freeLineWarning([line({ lineNumber: 1, productId: 7 })], 'RECALCULATE')).toBeUndefined()
  })
})
