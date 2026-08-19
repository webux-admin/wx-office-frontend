import { describe, expect, it } from 'vitest'
import {
  defaultCodeOf,
  labelForCode,
  labelForm,
  labelPayload,
  selectOptions,
  shortLabelForCode,
  type SelectableEntry,
} from './masterData'

const UNITS: SelectableEntry[] = [
  { code: 'PIECE', name: 'Stück', shortName: 'Stk' },
  { code: 'HOUR', name: 'Stunde', shortName: 'Std' },
  { code: 'PALETTE', name: 'Palette' },
]

describe('selectOptions', () => {
  it('selectOptionsTest', () => {
    const options = selectOptions(UNITS)

    expect(options).toEqual([
      { value: 'PIECE', label: 'Stück' },
      { value: 'HOUR', label: 'Stunde' },
      { value: 'PALETTE', label: 'Palette' },
    ])
  })

  it('selectOptionsWithoutEntriesTest', () => {
    expect(selectOptions([])).toEqual([])
  })

  it('selectOptionsLeavesOutWhatMayNoLongerBeChosenTest', () => {
    const entries: SelectableEntry[] = [
      { code: 'PIECE', name: 'Stück' },
      { code: 'HOUR', name: 'Stunde', active: false },
      { code: 'DAY', name: 'Tag', visible: false },
    ]

    expect(selectOptions(entries).map((option) => option.value)).toEqual(['PIECE'])
  })

  it('selectOptionsKeepsTheStoredValueTest', () => {
    // A deactivated value stays valid where it is stored, so it must stay selectable.
    const entries: SelectableEntry[] = [
      { code: 'PIECE', name: 'Stück' },
      { code: 'HOUR', name: 'Stunde', active: false },
    ]

    expect(selectOptions(entries, 'HOUR')).toEqual([
      { value: 'PIECE', label: 'Stück' },
      { value: 'HOUR', label: 'Stunde' },
    ])
  })

  it('selectOptionsWithStoredValueOutsideTheListTest', () => {
    // The list of another tenant, or one not loaded yet: the label from the record is used.
    expect(selectOptions([], 'GMBH', 'GmbH')).toEqual([{ value: 'GMBH', label: 'GmbH' }])
  })

  it('selectOptionsWithUnknownStoredValueAndNoLabelTest', () => {
    expect(selectOptions([], 'GMBH')).toEqual([{ value: 'GMBH', label: 'GMBH' }])
  })

  it('selectOptionsWithoutStoredValueTest', () => {
    expect(selectOptions(UNITS, '')).toHaveLength(3)
    expect(selectOptions(UNITS, null)).toHaveLength(3)
    expect(selectOptions(UNITS, undefined)).toHaveLength(3)
  })
})

describe('labelForCode', () => {
  it('labelForCodeTest', () => {
    expect(labelForCode(UNITS, 'HOUR')).toBe('Stunde')
  })

  it('labelForCodeWithoutValueTest', () => {
    expect(labelForCode(UNITS, undefined)).toBe('-')
    expect(labelForCode(UNITS, null)).toBe('-')
    expect(labelForCode(UNITS, '')).toBe('-')
  })

  it('labelForCodeWithUnknownCodeShowsTheCodeTest', () => {
    // A value added while the list was cached must stay visible, not disappear.
    expect(labelForCode(UNITS, 'TONNE')).toBe('TONNE')
  })
})

describe('shortLabelForCode', () => {
  it('shortLabelForCodeTest', () => {
    expect(shortLabelForCode(UNITS, 'PIECE')).toBe('Stk')
  })

  it('shortLabelForCodeWithoutShortNameTest', () => {
    expect(shortLabelForCode(UNITS, 'PALETTE')).toBe('Palette')
  })

  it('shortLabelForCodeWithoutValueTest', () => {
    expect(shortLabelForCode(UNITS, undefined)).toBe('-')
    expect(shortLabelForCode(UNITS, '')).toBe('-')
  })

  it('shortLabelForCodeWithUnknownCodeShowsTheCodeTest', () => {
    expect(shortLabelForCode(UNITS, 'TONNE')).toBe('TONNE')
  })
})

describe('defaultCodeOf', () => {
  it('defaultCodeOfTest', () => {
    const entries = [
      { code: 'CHF', isDefault: true },
      { code: 'EUR', isDefault: false },
    ]

    expect(defaultCodeOf(entries)).toBe('CHF')
  })

  it('defaultCodeOfWithoutDefaultTest', () => {
    expect(defaultCodeOf([{ code: 'CHF' }])).toBe('')
    expect(defaultCodeOf([])).toBe('')
  })
})

describe('labelPayload', () => {
  it('labelPayloadTest', () => {
    const labels = labelPayload('Zahlbar in 30 Tagen', { fr: 'Payable à 30 jours' }, 'de')

    expect(labels).toEqual({ fr: 'Payable à 30 jours', de: 'Zahlbar in 30 Tagen' })
  })

  it('labelPayloadWithoutTranslationsTest', () => {
    expect(labelPayload('Normalsatz', {}, 'de')).toEqual({ de: 'Normalsatz' })
  })

  it('labelPayloadWithoutAnythingTest', () => {
    // Nothing to translate: the field goes out as absent rather than as an empty object.
    expect(labelPayload('', {}, 'de')).toBeUndefined()
    expect(labelPayload('', { fr: '   ' }, 'de')).toBeUndefined()
  })

  it('labelPayloadLeavesOutEmptyTranslationsTest', () => {
    expect(labelPayload('Normalsatz', { fr: '', it: '  ', en: 'Standard rate' }, 'de')).toEqual({
      en: 'Standard rate',
      de: 'Normalsatz',
    })
  })

  it('labelPayloadTrimsTest', () => {
    expect(labelPayload('  Normalsatz  ', { fr: '  Taux normal  ' }, 'de')).toEqual({
      fr: 'Taux normal',
      de: 'Normalsatz',
    })
  })

  it('labelPayloadWithoutDefaultLanguageTest', () => {
    // The language list has no default: the name is the only place that text can live.
    expect(labelPayload('Normalsatz', { fr: 'Taux normal' }, '')).toEqual({ fr: 'Taux normal' })
  })

  it('labelPayloadNeverLetsTheNameLoseToATranslationTest', () => {
    // A stale field for the default language must not overwrite what the name field says.
    expect(labelPayload('Normalsatz', { de: 'Veralteter Text' }, 'de')).toEqual({
      de: 'Normalsatz',
    })
  })
})

describe('labelForm', () => {
  it('labelFormTest', () => {
    expect(labelForm({ de: 'Normalsatz', fr: 'Taux normal' }, 'de')).toEqual({
      fr: 'Taux normal',
    })
  })

  it('labelFormWithoutLabelsTest', () => {
    expect(labelForm(undefined, 'de')).toEqual({})
    expect(labelForm({}, 'de')).toEqual({})
  })

  it('labelFormWithOnlyTheDefaultLanguageTest', () => {
    expect(labelForm({ de: 'Normalsatz' }, 'de')).toEqual({})
  })
})
