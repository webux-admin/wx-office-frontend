import { describe, expect, it } from 'vitest'
import type { MasterDataEntry } from '../../lib/types'
import {
  EMPTY_ENTRY,
  codeHintFor,
  decimalPlacesOf,
  entryComplaint,
  toEntryForm,
} from './entryForm'

const STORED: MasterDataEntry = {
  id: 4,
  code: 'PIECE',
  name: 'Stück',
  labels: { de: 'Stück', fr: 'Pièce' },
  shortName: 'Stk',
  description: 'Einzelne Ware',
  sortOrder: 100,
  isDefault: true,
  active: true,
  system: true,
}

describe('toEntryForm', () => {
  it('toEntryFormTest', () => {
    const form = toEntryForm(STORED, 'de')

    expect(form.code).toBe('PIECE')
    expect(form.name).toBe('Stück')
    expect(form.shortName).toBe('Stk')
    expect(form.description).toBe('Einzelne Ware')
  })

  it('toEntryFormLeavesTheDefaultLanguageToTheNameTest', () => {
    // The German text is shown in the name field; a second field for it would invite the two
    // to disagree.
    expect(toEntryForm(STORED, 'de').translations).toEqual({ fr: 'Pièce' })
  })

  it('toEntryFormWithoutTranslationsTest', () => {
    const form = toEntryForm({ id: 1, code: 'AG', name: 'AG' }, 'de')

    expect(form.translations).toEqual({})
    expect(form.shortName).toBe('')
    expect(form.description).toBe('')
    expect(form.documentLanguage).toBe(false)
  })

  it('toEntryFormWithoutKnownDefaultLanguageTest', () => {
    // The language list has not arrived yet: every translation is offered, and the name still
    // wins when the form is sent.
    expect(toEntryForm(STORED, '').translations).toEqual({ de: 'Stück', fr: 'Pièce' })
  })

  it('toEntryFormReadsTheDocumentLanguageFlagTest', () => {
    const form = toEntryForm({ id: 2, code: 'fr', name: 'Français', documentLanguage: true }, 'de')

    expect(form.documentLanguage).toBe(true)
  })
})

describe('codeHintFor', () => {
  it('codeHintForTest', () => {
    expect(codeHintFor('units')).toMatch(/Kurzzeichen/)
  })

  it('codeHintForAStandardCodeTest', () => {
    // Three lists carry a code from a standard, and the backend refuses anything else.
    expect(codeHintFor('languages')).toMatch(/ISO 639-1/)
    expect(codeHintFor('countries')).toMatch(/ISO 3166-1/)
    expect(codeHintFor('currencies')).toMatch(/ISO 4217/)
  })

  it('codeHintForEveryListTest', () => {
    const lists = [
      'legal-forms',
      'salutations',
      'units',
      'languages',
      'countries',
      'currencies',
      'layout-templates',
      'revenue-accounts',
    ] as const

    for (const list of lists) {
      expect(codeHintFor(list).endsWith('.')).toBe(true)
    }
  })
})

describe('entryComplaint', () => {
  const filled = { ...EMPTY_ENTRY, code: 'PALETTE', name: 'Palette' }

  it('entryComplaintTest', () => {
    expect(entryComplaint(filled, 'units')).toBeNull()
  })

  it('entryComplaintWithoutCodeTest', () => {
    expect(entryComplaint({ ...filled, code: '' }, 'units')).toMatch(/Code/)
    expect(entryComplaint({ ...filled, code: '   ' }, 'units')).toMatch(/Code/)
  })

  it('entryComplaintWithoutNameTest', () => {
    expect(entryComplaint({ ...filled, name: '  ' }, 'units')).toMatch(/Bezeichnung/)
  })

  it('entryComplaintReportsTheCodeFirstTest', () => {
    // Both are missing; the code is the one that cannot be corrected later.
    expect(entryComplaint(EMPTY_ENTRY, 'units')).toMatch(/Code/)
  })

  it('entryComplaintWithABadLanguageCodeTest', () => {
    expect(entryComplaint({ ...filled, code: 'de-CH' }, 'languages')).toMatch(/Kleinbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'DE' }, 'languages')).toMatch(/Kleinbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'deu' }, 'languages')).toMatch(/Kleinbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'de' }, 'languages')).toBeNull()
  })

  it('entryComplaintWithABadCountryCodeTest', () => {
    expect(entryComplaint({ ...filled, code: 'ch' }, 'countries')).toMatch(/Grossbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'CHE' }, 'countries')).toMatch(/Grossbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'CH' }, 'countries')).toBeNull()
  })

  it('entryComplaintWithABadCurrencyCodeTest', () => {
    expect(entryComplaint({ ...filled, code: 'chf' }, 'currencies')).toMatch(/Grossbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'CH' }, 'currencies')).toMatch(/Grossbuchstaben/)
    expect(entryComplaint({ ...filled, code: 'CHF' }, 'currencies')).toBeNull()
  })

  it('entryComplaintAcceptsAnyCodeWhereTheTenantInventsItTest', () => {
    // Only three lists follow a standard; the others carry whatever the tenant chose.
    expect(entryComplaint({ ...filled, code: 'palette' }, 'units')).toBeNull()
    expect(entryComplaint({ ...filled, code: '3200' }, 'revenue-accounts')).toBeNull()
  })

  it('entryComplaintIgnoresSurroundingSpaceInTheCodeTest', () => {
    expect(entryComplaint({ ...filled, code: '  de  ' }, 'languages')).toBeNull()
  })
})

describe('toEntryForm with decimal places', () => {
  it('toEntryFormReadsTheDecimalPlacesTest', () => {
    expect(toEntryForm({ ...STORED, decimalPlaces: 2 }, 'de').decimalPlaces).toBe('2')
  })

  it('toEntryFormKeepsAZeroRuleTest', () => {
    // 0 is a rule («whole numbers only»), not the absence of one.
    expect(toEntryForm({ ...STORED, decimalPlaces: 0 }, 'de').decimalPlaces).toBe('0')
  })

  it('toEntryFormWithoutARuleTest', () => {
    expect(toEntryForm(STORED, 'de').decimalPlaces).toBe('')
  })
})

describe('entryComplaint about decimal places', () => {
  const unit = { ...EMPTY_ENTRY, code: 'PIECE', name: 'Stück' }

  it('entryComplaintWithDecimalPlacesTest', () => {
    expect(entryComplaint({ ...unit, decimalPlaces: '2' }, 'units')).toBeNull()
  })

  it('entryComplaintWithDecimalPlacesAtTheEdgesTest', () => {
    // 0 and 4 are the ends of what NUMERIC(19,4) can carry; both are valid.
    expect(entryComplaint({ ...unit, decimalPlaces: '0' }, 'units')).toBeNull()
    expect(entryComplaint({ ...unit, decimalPlaces: '4' }, 'units')).toBeNull()
  })

  it('entryComplaintWithTooManyDecimalPlacesTest', () => {
    expect(entryComplaint({ ...unit, decimalPlaces: '5' }, 'units')).toMatch(/0 bis 4/)
  })

  it('entryComplaintWithNegativeDecimalPlacesTest', () => {
    expect(entryComplaint({ ...unit, decimalPlaces: '-1' }, 'units')).toMatch(/0 bis 4/)
  })

  it('entryComplaintWithFractionalDecimalPlacesTest', () => {
    expect(entryComplaint({ ...unit, decimalPlaces: '1.5' }, 'units')).toMatch(/ganze Zahl/)
  })

  it('entryComplaintIgnoresDecimalPlacesOnOtherListsTest', () => {
    // The field is only shown on units; a stray value elsewhere must not block the save.
    expect(entryComplaint({ ...unit, decimalPlaces: '9' }, 'salutations')).toBeNull()
  })
})

describe('decimalPlacesOf', () => {
  const unit = { ...EMPTY_ENTRY, code: 'PIECE', name: 'Stück' }

  it('decimalPlacesOfTest', () => {
    expect(decimalPlacesOf({ ...unit, decimalPlaces: '2' }, 'units')).toBe(2)
  })

  it('decimalPlacesOfWithZeroTest', () => {
    // «Whole numbers only» has to reach the API as 0, not vanish as falsy.
    expect(decimalPlacesOf({ ...unit, decimalPlaces: '0' }, 'units')).toBe(0)
  })

  it('decimalPlacesOfWithAnEmptyFieldTest', () => {
    // Empty means «no rule», which is a different answer than 0 and must stay out of the
    // payload altogether.
    expect(decimalPlacesOf(unit, 'units')).toBeUndefined()
  })

  it('decimalPlacesOfOnAnotherListTest', () => {
    expect(decimalPlacesOf({ ...unit, decimalPlaces: '2' }, 'languages')).toBeUndefined()
  })
})

describe('toEntryForm with another default language', () => {
  it('toEntryFormShowsTheTextOfTheTenantLanguageTest', () => {
    // The name is only the fallback: a delivered value carries a German one whichever language
    // the tenant works in, and showing that in the Bezeichnung field would overwrite the real
    // French label on the next save.
    const form = toEntryForm(
      { id: 9, code: 'GMBH', name: 'GmbH', labels: { de: 'GmbH', fr: 'Sàrl' } },
      'fr',
    )

    expect(form.name).toBe('Sàrl')
    expect(form.translations).toEqual({ de: 'GmbH' })
  })

  it('toEntryFormFallsBackToTheNameWithoutATranslationTest', () => {
    const form = toEntryForm({ id: 9, code: 'GMBH', name: 'GmbH', labels: { de: 'GmbH' } }, 'fr')

    expect(form.name).toBe('GmbH')
    expect(form.translations).toEqual({ de: 'GmbH' })
  })
})
