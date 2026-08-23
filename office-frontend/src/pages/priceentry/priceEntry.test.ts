import { describe, expect, it } from 'vitest'
import type { PriceEntryRow } from '../../lib/types'
import {
  changeCountText,
  dayBefore,
  editedCount,
  fieldValue,
  firstComplaint,
  isRealChange,
  nextRow,
  ownPriceText,
  payloadRows,
  periodText,
  savedText,
  withEdit,
  withoutEdit,
  type PriceEdits,
} from './priceEntry'

function row(fields: Partial<PriceEntryRow> = {}): PriceEntryRow {
  return { productId: 7, name: 'Beratung', ...fields }
}

describe('ownPriceText', () => {
  it('ownPriceTextTest', () => {
    expect(ownPriceText(row({ ownPrice: 120.5 }))).toBe('120.5')
  })

  it('ownPriceTextWithoutAPriceTest', () => {
    expect(ownPriceText(row())).toBe('')
  })

  it('ownPriceTextOfZeroTest', () => {
    expect(ownPriceText(row({ ownPrice: 0 }))).toBe('0')
  })
})

describe('fieldValue', () => {
  it('fieldValueTest', () => {
    const edits = withEdit({}, row({ ownPrice: 120 }), '130')
    expect(fieldValue(row({ ownPrice: 120 }), edits)).toBe('130')
  })

  it('fieldValueWithoutAnEditTest', () => {
    expect(fieldValue(row({ ownPrice: 120 }), {})).toBe('120')
  })

  it('fieldValueOfAnEmptiedFieldTest', () => {
    const edits = withEdit({}, row({ ownPrice: 120 }), '')
    expect(fieldValue(row({ ownPrice: 120 }), edits)).toBe('')
  })
})

describe('withEdit', () => {
  it('withEditTest', () => {
    const edits = withEdit({}, row({ ownPrice: 120 }), '130')
    expect(edits[7]).toEqual({ text: '130', stored: '120', name: 'Beratung' })
  })

  it('withEditBackToTheStoredValueTakesTheChangeAwayTest', () => {
    const typed = withEdit({}, row({ ownPrice: 120 }), '130')
    expect(withEdit(typed, row({ ownPrice: 120 }), '120')).toEqual({})
  })

  it('withEditKeepsTheOtherRowsTest', () => {
    const first = withEdit({}, row({ productId: 7, ownPrice: 120 }), '130')
    const both = withEdit(first, row({ productId: 8, name: 'Kabel' }), '9')
    expect(Object.keys(both)).toEqual(['7', '8'])
  })

  it('withoutEditTest', () => {
    const typed = withEdit({}, row({ ownPrice: 120 }), '130')
    expect(withoutEdit(typed, 7)).toEqual({})
  })
})

describe('isRealChange', () => {
  it('isRealChangeTest', () => {
    expect(isRealChange({ text: '130', stored: '120', name: 'Beratung' })).toBe(true)
  })

  it('isRealChangeOfTheSameNumberWrittenDifferentlyTest', () => {
    expect(isRealChange({ text: '120.00', stored: '120', name: 'Beratung' })).toBe(false)
  })

  it('isRealChangeOfAnEmptiedFieldTest', () => {
    expect(isRealChange({ text: '  ', stored: '120', name: 'Beratung' })).toBe(true)
  })

  it('isRealChangeOfAFieldThatWasEmptyAnywayTest', () => {
    expect(isRealChange({ text: '', stored: '', name: 'Beratung' })).toBe(false)
  })

  it('isRealChangeOfSomethingUnreadableTest', () => {
    expect(isRealChange({ text: 'circa 120', stored: '120', name: 'Beratung' })).toBe(true)
  })
})

describe('editedCount', () => {
  it('editedCountTest', () => {
    const edits: PriceEdits = {
      7: { text: '130', stored: '120', name: 'Beratung' },
      8: { text: '9', stored: '', name: 'Kabel' },
      9: { text: '80.00', stored: '80', name: 'Rohr' },
    }
    expect(editedCount(edits)).toBe(2)
  })

  it('editedCountWithoutAnyEditTest', () => {
    expect(editedCount({})).toBe(0)
  })
})

describe('payloadRows', () => {
  it('payloadRowsTest', () => {
    const edits: PriceEdits = {
      9: { text: '80', stored: '', name: 'Rohr' },
      7: { text: '130', stored: '120', name: 'Beratung' },
    }
    expect(payloadRows(edits)).toEqual([
      { productId: 7, price: 130 },
      { productId: 9, price: 80 },
    ])
  })

  it('payloadRowsOfAnEmptiedFieldTakesThePriceAwayTest', () => {
    const edits: PriceEdits = { 7: { text: '', stored: '120', name: 'Beratung' } }
    expect(payloadRows(edits)).toEqual([{ productId: 7, price: undefined }])
  })

  it('payloadRowsOfZeroIsAPriceNotARemovalTest', () => {
    const edits: PriceEdits = { 7: { text: '0', stored: '120', name: 'Beratung' } }
    expect(payloadRows(edits)).toEqual([{ productId: 7, price: 0 }])
  })

  it('payloadRowsLeavesOutWhatItCannotReadTest', () => {
    const edits: PriceEdits = { 7: { text: 'circa 120', stored: '120', name: 'Beratung' } }
    expect(payloadRows(edits)).toEqual([])
  })

  it('payloadRowsWithoutAnyEditTest', () => {
    expect(payloadRows({})).toEqual([])
  })
})

describe('changeCountText', () => {
  it('changeCountTextTest', () => {
    expect(changeCountText(3)).toBe('3 Preise geändert')
  })

  it('changeCountTextForOneTest', () => {
    expect(changeCountText(1)).toBe('1 Preis geändert')
  })

  it('changeCountTextForNoneTest', () => {
    expect(changeCountText(0)).toBe('')
  })
})

describe('firstComplaint', () => {
  it('firstComplaintTest', () => {
    const edits: PriceEdits = { 7: { text: '130', stored: '120', name: 'Beratung' } }
    expect(firstComplaint(edits, '2027-01-01', '', true)).toBeNull()
  })

  it('firstComplaintWithoutATargetTest', () => {
    expect(firstComplaint({}, '', '', false)).toBe(
      'Wählen Sie zuerst eine Preisgruppe oder einen Kunden.',
    )
  })

  it('firstComplaintAboutAPeriodThatEndsBeforeItStartsTest', () => {
    expect(firstComplaint({}, '2027-01-01', '2026-12-31', true)).toBe(
      'Das Bis-Datum darf nicht vor dem Ab-Datum liegen.',
    )
  })

  it('firstComplaintAboutAnUnreadableAmountTest', () => {
    const edits: PriceEdits = { 7: { text: 'circa 120', stored: '', name: 'Beratung' } }
    expect(firstComplaint(edits, '', '', true)).toBe(
      'Der Preis von «Beratung» ist keine Zahl, zum Beispiel 1250.00.',
    )
  })

  it('firstComplaintAboutANegativeAmountTest', () => {
    const edits: PriceEdits = { 7: { text: '-5', stored: '', name: 'Beratung' } }
    expect(firstComplaint(edits, '', '', true)).toBe(
      'Der Preis von «Beratung» darf nicht negativ sein.',
    )
  })

  it('firstComplaintIgnoresAFieldThatWasNotReallyChangedTest', () => {
    const edits: PriceEdits = { 7: { text: '120.00', stored: '120', name: 'Beratung' } }
    expect(firstComplaint(edits, '', '', true)).toBeNull()
  })
})

describe('savedText', () => {
  it('savedTextTest', () => {
    expect(savedText({ written: 12, removed: 0, closed: 0 })).toBe('12 Preise gespeichert.')
  })

  it('savedTextWithEveryCountTest', () => {
    expect(savedText({ written: 1, removed: 1, closed: 1 })).toBe(
      '1 Preis gespeichert, 1 Preis entfernt, 1 laufender Preis am Vortag beendet.',
    )
  })

  it('savedTextOfSeveralClosedRowsTest', () => {
    expect(savedText({ written: 2, removed: 0, closed: 3 })).toBe(
      '2 Preise gespeichert, 3 laufende Preise am Vortag beendet.',
    )
  })

  it('savedTextWithoutAnythingToSaveTest', () => {
    expect(savedText({ written: 0, removed: 0, closed: 0 })).toBe('Nichts zu speichern')
  })
})

describe('dayBefore', () => {
  it('dayBeforeTest', () => {
    expect(dayBefore('2027-06-15')).toBe('2027-06-14')
  })

  it('dayBeforeANewYearTest', () => {
    expect(dayBefore('2027-01-01')).toBe('2026-12-31')
  })

  it('dayBeforeTheFirstOfMarchInALeapYearTest', () => {
    expect(dayBefore('2028-03-01')).toBe('2028-02-29')
  })

  it('dayBeforeNothingTest', () => {
    expect(dayBefore('')).toBe('')
  })

  it('dayBeforeSomethingThatIsNoDateTest', () => {
    expect(dayBefore('demnächst')).toBe('')
  })
})

describe('periodText', () => {
  it('periodTextTest', () => {
    expect(periodText(row({ ownPrice: 120, ownValidFrom: '2020-01-01' }))).toBe('ab 01.01.2020')
  })

  it('periodTextOfAClosedPeriodTest', () => {
    expect(
      periodText(row({ ownPrice: 120, ownValidFrom: '2027-01-01', ownValidTo: '2027-03-31' })),
    ).toBe('ab 01.01.2027 bis 31.03.2027')
  })

  it('periodTextOfARowWithoutAnyDateTest', () => {
    expect(periodText(row({ ownPrice: 120 }))).toBe('ohne Zeitraum')
  })

  it('periodTextWithoutAnOwnPriceTest', () => {
    expect(periodText(row())).toBe('')
  })
})

describe('nextRow', () => {
  it('nextRowTest', () => {
    expect(nextRow('ArrowDown', 2, 10)).toBe(3)
  })

  it('nextRowWithEnterTest', () => {
    expect(nextRow('Enter', 0, 3)).toBe(1)
  })

  it('nextRowUpwardsTest', () => {
    expect(nextRow('ArrowUp', 2, 10)).toBe(1)
  })

  it('nextRowAtTheEndsDoesNotWrapTest', () => {
    expect(nextRow('ArrowDown', 9, 10)).toBeNull()
    expect(nextRow('ArrowUp', 0, 10)).toBeNull()
  })

  it('nextRowInASingleRowTableTest', () => {
    expect(nextRow('ArrowDown', 0, 1)).toBeNull()
  })

  it('nextRowOfAKeyThatMovesNothingTest', () => {
    expect(nextRow('Tab', 2, 10)).toBeNull()
  })
})
