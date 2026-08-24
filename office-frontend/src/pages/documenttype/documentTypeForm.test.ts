import { describe, expect, it } from 'vitest'
import {
  COPY_PRICE_MODES,
  MAX_COPIES,
  STOCK_EFFECTS,
  describeCopies,
  emptyDocumentType,
  firstComplaint,
  nextCopyRow,
  toForm,
  togglePredecessor,
  toPayload,
  withMovedCopy,
  withMovedPredecessor,
  type CopyRow,
  type DocumentTypeForm,
} from './documentTypeForm'

/** One copy row, with only what the test cares about spelled out. */
function copy(fields: Partial<CopyRow> = {}): CopyRow {
  return {
    label: 'Original',
    copies: '1',
    printerId: '',
    trayId: '',
    documentLayoutId: '',
    internal: false,
    ...fields,
  }
}
import type { DocumentType } from '../../lib/types'

const STORED: DocumentType = {
  id: 7,
  code: 'AU',
  category: 'ORDER',
  name: 'Auftrag',
  numberPrefix: 'AU',
  documentLayoutId: 12,
  documentLayout: 'AUFTRAG-A4',
  documentLayoutName: 'Auftrag A4 mit Logo',
  copies: [
    { position: 1, label: 'Original', copies: 1, printerId: 7, printerName: 'Empfang', trayId: 71 },
    { position: 2, label: 'Buchhaltung', copies: 2 },
  ],
  predecessorTypeIds: [3, 5],
  copyPriceMode: 'COPY',
  active: true,
}

/** A mask that may be sent, so a test only has to say which field it breaks. */
const COMPLETE: DocumentTypeForm = {
  ...emptyDocumentType(),
  code: 'AU',
  name: 'Auftrag',
}

/** An offer kind ready to send, which is the only category the validity preset lives on. */
const OFFER_FORM: DocumentTypeForm = {
  ...COMPLETE,
  category: 'OFFER',
  code: 'OF',
  name: 'Offerte',
}

describe('stock effect', () => {
  it('toFormReadsTheStockEffectTest', () => {
    const form = toForm({ ...STORED, stockEffect: 'ISSUE', stockLocationId: 33 })

    expect(form.stockEffect).toBe('ISSUE')
    // Ids live in the mask as strings, because that is what a `<select>` holds.
    expect(form.stockLocationId).toBe('33')
  })

  it('toFormWithoutAStockEffectTest', () => {
    // A kind stored before this setting existed says nothing about stock, and that means none.
    const form = toForm(STORED)

    expect(form.stockEffect).toBe('NONE')
    expect(form.stockLocationId).toBe('')
  })

  it('toPayloadSendsTheStockEffectTest', () => {
    const payload = toPayload({ ...COMPLETE, stockEffect: 'ISSUE', stockLocationId: '33' })

    expect(payload.stockEffect).toBe('ISSUE')
    expect(payload.stockLocationId).toBe(33)
  })

  it('toPayloadWithoutALocationTest', () => {
    // No location means the tenant's default one, and the server is the only place that knows
    // which that is.
    const payload = toPayload({ ...COMPLETE, stockEffect: 'ISSUE', stockLocationId: '' })

    expect(payload.stockEffect).toBe('ISSUE')
    expect(payload.stockLocationId).toBeUndefined()
  })

  it('toPayloadDropsTheStockEffectOnACreditNoteTest', () => {
    const payload = toPayload({
      ...COMPLETE,
      category: 'CREDIT_NOTE',
      stockEffect: 'ISSUE',
      stockLocationId: '33',
    })

    expect(payload.stockEffect).toBe('NONE')
    expect(payload.stockLocationId).toBeUndefined()
  })

  it('emptyDocumentTypeHasNoStockEffectTest', () => {
    expect(emptyDocumentType().stockEffect).toBe('NONE')
    expect(emptyDocumentType().stockLocationId).toBe('')
  })

  it('STOCK_EFFECTSTest', () => {
    // In the order of how deeply they reach into the stock, RESERVE included: the order that
    // speaks a quantity for is evaluated since backend ADR-0066.
    expect(STOCK_EFFECTS.map((effect) => effect.value)).toEqual([
      'NONE',
      'RESERVE',
      'ISSUE',
      'ISSUE_IF_NOT_BOOKED',
    ])
    expect(STOCK_EFFECTS.every((effect) => effect.label !== '' && effect.hint !== '')).toBe(true)
  })
})

describe('toForm', () => {
  it('toFormTest', () => {
    const form = toForm(STORED)

    expect(form.category).toBe('ORDER')
    expect(form.code).toBe('AU')
    expect(form.name).toBe('Auftrag')
    expect(form.numberPrefix).toBe('AU')
    expect(form.documentLayoutId).toBe('12')
    expect(form.copies).toEqual([
      copy({ label: 'Original', copies: '1', printerId: '7', trayId: '71' }),
      copy({ label: 'Buchhaltung', copies: '2', printerId: '', trayId: '' }),
    ])
    expect(form.predecessorTypeIds).toEqual([3, 5])
    expect(form.copyPriceMode).toBe('COPY')
    expect(form.offerValidityDays).toBe('')
  })

  it('toFormCarriesTheFormAndTheInternalMarkOfACopyTest', () => {
    const form = toForm({
      id: 3,
      code: 'LS',
      category: 'DELIVERY_NOTE',
      name: 'Lieferschein',
      active: true,
      copies: [{ position: 1, label: 'Lager', documentLayoutId: 12, internal: true }],
    })

    expect(form.copies[0].documentLayoutId).toBe('12')
    expect(form.copies[0].internal).toBe(true)
  })

  it('toFormTurnsMissingValuesIntoEmptyOnesTest', () => {
    const form = toForm({ id: 1, code: 'LS', category: 'DELIVERY_NOTE', name: 'Lieferschein', active: true })

    expect(form.numberPrefix).toBe('')
    expect(form.documentLayoutId).toBe('')
    expect(form.copies).toEqual([])
    expect(form.predecessorTypeIds).toEqual([])
    expect(form.copyPriceMode).toBe('RECALCULATE')
    expect(form.offerValidityDays).toBe('')
  })

  it('toFormWithOfferValidityDaysTest', () => {
    const form = toForm({
      id: 2,
      code: 'OF',
      category: 'OFFER',
      name: 'Offerte',
      offerValidityDays: 30,
      active: true,
    })

    expect(form.offerValidityDays).toBe('30')
  })
})

describe('toPayload', () => {
  it('toPayloadTest', () => {
    const payload = toPayload(toForm(STORED))

    expect(payload).toEqual({
      category: 'ORDER',
      code: 'AU',
      name: 'Auftrag',
      numberPrefix: 'AU',
      documentLayoutId: 12,
      copies: [
        {
          position: 1,
          label: 'Original',
          copies: 1,
          printerId: 7,
          trayId: 71,
          documentLayoutId: undefined,
          internal: false,
        },
        {
          position: 2,
          label: 'Buchhaltung',
          copies: 2,
          printerId: undefined,
          trayId: undefined,
          documentLayoutId: undefined,
          internal: false,
        },
      ],
      predecessorTypeIds: [3, 5],
      copyPriceMode: 'COPY',
      offerValidityDays: undefined,
      stockEffect: 'NONE',
      stockLocationId: undefined,
    })
  })

  it('toPayloadNumbersTheCopiesByTheirPlaceTest', () => {
    // The position follows from the row, so reordering the rows is what reorders the PDF.
    const copies = [copy({ label: 'Spedition' }), copy({ label: 'Original' })]

    const payload = toPayload({ ...COMPLETE, copies })

    expect(payload.copies).toEqual([
      expect.objectContaining({ position: 1, label: 'Spedition' }),
      expect.objectContaining({ position: 2, label: 'Original' }),
    ])
  })

  it('toPayloadSendsEveryFieldEvenWhenEmptyTest', () => {
    // Both endpoints replace the whole record: a field left out resets, it does not keep.
    const payload = toPayload(COMPLETE)

    expect(Object.keys(payload).sort()).toEqual([
      'category',
      'code',
      'copies',
      'copyPriceMode',
      'documentLayoutId',
      'name',
      'numberPrefix',
      'offerValidityDays',
      'predecessorTypeIds',
      'stockEffect',
      'stockLocationId',
    ])
    // One copy, because a new kind starts with an Original: without one it would print
    // nothing at all (ADR-0053 of the backend).
    expect(payload.copies).toEqual([
      expect.objectContaining({ position: 1, label: 'Original', internal: false }),
    ])
    expect(payload.predecessorTypeIds).toEqual([])
  })

  it('toPayloadCarriesTheFormAndTheInternalMarkOfACopyTest', () => {
    const copies = [copy({ label: 'Lager', documentLayoutId: '12', internal: true })]

    const payload = toPayload({ ...COMPLETE, copies })

    expect(payload.copies).toEqual([
      expect.objectContaining({ documentLayoutId: 12, internal: true }),
    ])
  })

  it('toPayloadWithoutAFormOfItsOwnLeavesItOutTest', () => {
    const payload = toPayload({ ...COMPLETE, copies: [copy({ documentLayoutId: '' })] })

    expect(payload.copies).toEqual([
      expect.objectContaining({ documentLayoutId: undefined, internal: false }),
    ])
  })

  it('toPayloadWithoutPrefixLeavesItOutTest', () => {
    const payload = toPayload({ ...COMPLETE, numberPrefix: '   ' })

    expect(payload.numberPrefix).toBeUndefined()
  })

  it('toPayloadWithoutFormLeavesItOutTest', () => {
    const payload = toPayload({ ...COMPLETE, documentLayoutId: '' })

    expect(payload.documentLayoutId).toBeUndefined()
  })

  it('toPayloadWithOfferValidityDaysTest', () => {
    const payload = toPayload({ ...OFFER_FORM, offerValidityDays: '30' })

    expect(payload.offerValidityDays).toBe(30)
  })

  it('toPayloadWithoutOfferValidityDaysLeavesItOutTest', () => {
    const payload = toPayload({ ...OFFER_FORM, offerValidityDays: '' })

    expect(payload.offerValidityDays).toBeUndefined()
  })

  it('toPayloadDropsTheValidityDaysOnAnotherCategoryTest', () => {
    // While a new kind is entered the category can still move away from OFFER, and days
    // typed before that switch must not land on an order kind.
    const payload = toPayload({ ...COMPLETE, offerValidityDays: '30' })

    expect(payload.offerValidityDays).toBeUndefined()
  })
})

describe('firstComplaint', () => {
  it('firstComplaintTest', () => {
    expect(firstComplaint(COMPLETE, true)).toBeNull()
  })

  it('firstComplaintWithoutCodeWhileCreatingTest', () => {
    expect(firstComplaint({ ...COMPLETE, code: '  ' }, true))
      .toBe('Eine Belegart braucht einen Code. Er steht danach fest.')
  })

  it('firstComplaintWithoutCodeWhileEditingTest', () => {
    // An existing kind never sends a new code, so an empty one cannot block the save.
    expect(firstComplaint({ ...COMPLETE, code: '  ' }, false)).toBeNull()
  })

  it('firstComplaintWithTooLongCodeTest', () => {
    expect(firstComplaint({ ...COMPLETE, code: 'A'.repeat(21) }, true))
      .toBe('Der Code darf höchstens 20 Zeichen lang sein.')
  })

  it('firstComplaintWithCodeOfExactlyTwentyTest', () => {
    expect(firstComplaint({ ...COMPLETE, code: 'A'.repeat(20), numberPrefix: 'AU' }, true))
      .toBeNull()
  })

  it('firstComplaintWithoutNameTest', () => {
    expect(firstComplaint({ ...COMPLETE, name: '' }, true))
      .toBe('Eine Belegart braucht eine Bezeichnung.')
  })

  it('firstComplaintWithTooLongNameTest', () => {
    expect(firstComplaint({ ...COMPLETE, name: 'x'.repeat(61) }, true))
      .toBe('Die Bezeichnung darf höchstens 60 Zeichen lang sein.')
  })

  it('firstComplaintWithTooLongPrefixTest', () => {
    expect(firstComplaint({ ...COMPLETE, numberPrefix: 'x'.repeat(11) }, true))
      .toBe('Das Nummernpräfix darf höchstens 10 Zeichen lang sein.')
  })

  it('firstComplaintWithLongCodeAndNoPrefixTest', () => {
    // The prefix falls back to the code, and a code may be twice as long as a prefix.
    expect(firstComplaint({ ...COMPLETE, code: 'A'.repeat(11), numberPrefix: '' }, true))
      .toBe('Ein Code über 10 Zeichen taugt nicht als Nummernpräfix. Bitte ein eigenes angeben.')
  })

  it('firstComplaintWithLongCodeAndOwnPrefixTest', () => {
    expect(firstComplaint({ ...COMPLETE, code: 'A'.repeat(11), numberPrefix: 'AU' }, true))
      .toBeNull()
  })

  it('firstComplaintWithBlankCopyLabelTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy(), copy({ label: ' ' })] }, true))
      .toBe('Eine Ausfertigung braucht eine Beschriftung. Sonst die Zeile entfernen.')
  })

  it('firstComplaintWithAnUnreadableSheetCountTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy({ copies: 'zwei' })] }, true))
      .toBe('Die Anzahl ist keine Zahl.')
  })

  it('firstComplaintWithZeroSheetsTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy({ copies: '0' })] }, true))
      .toBe('Die Anzahl liegt zwischen 1 und 99.')
  })

  it('firstComplaintWithTooManySheetsTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy({ copies: '100' })] }, true))
      .toBe('Die Anzahl liegt zwischen 1 und 99.')
  })

  it('firstComplaintWithATrayButNoPrinterTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy({ trayId: '71' })] }, true))
      .toBe('Ein Schacht gehört zu einem Drucker. Bitte zuerst den Drucker wählen.')
  })

  it('firstComplaintWithTooLongCopyLabelTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: [copy({ label: 'x'.repeat(61) })] }, true))
      .toBe('Eine Beschriftung darf höchstens 60 Zeichen lang sein.')
  })

  it('firstComplaintWithTooManyCopiesTest', () => {
    const copies = Array.from({ length: MAX_COPIES + 1 }, (_, index) =>
      copy({ label: `Exemplar ${index + 1}` }),
    )

    expect(firstComplaint({ ...COMPLETE, copies }, true))
      .toBe('Ein Beleg wird höchstens 9 Mal gedruckt.')
  })

  it('firstComplaintWithExactlyNineCopiesTest', () => {
    const copies = Array.from({ length: MAX_COPIES }, (_, index) =>
      copy({ label: `Exemplar ${index + 1}` }),
    )

    expect(firstComplaint({ ...COMPLETE, copies }, true)).toBeNull()
  })

  it('firstComplaintWithOfferValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '30' }, true)).toBeNull()
  })

  it('firstComplaintWithZeroValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '0' }, true))
      .toBe('Die Gültigkeit liegt zwischen 1 und 730 Tagen.')
  })

  it('firstComplaintWithTooManyValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '731' }, true))
      .toBe('Die Gültigkeit liegt zwischen 1 und 730 Tagen.')
  })

  it('firstComplaintWithTheOutermostValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '1' }, true)).toBeNull()
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '730' }, true)).toBeNull()
  })

  it('firstComplaintWithBrokenValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: '1.5' }, true))
      .toBe('Die Gültigkeit ist eine ganze Zahl von Tagen.')
  })

  it('firstComplaintWithUnreadableValidityDaysTest', () => {
    expect(firstComplaint({ ...OFFER_FORM, offerValidityDays: 'dreissig' }, true))
      .toBe('Die Gültigkeit ist keine Zahl.')
  })

  it('firstComplaintIgnoresValidityDaysOnAnotherCategoryTest', () => {
    // What toPayload drops anyway cannot block the save.
    expect(firstComplaint({ ...COMPLETE, offerValidityDays: 'dreissig' }, true)).toBeNull()
  })
})

/** The labels of a list of copy rows, which is what the order tests are about. */
function labelsOf(rows: readonly CopyRow[]): string[] {
  return rows.map((row) => row.label)
}

describe('withMovedCopy', () => {
  it('withMovedCopyTest', () => {
    expect(labelsOf(withMovedCopy([copy(), copy({ label: 'Kopie' }), copy({ label: 'Spedition' })], 1, 1)))
      .toEqual(['Original', 'Spedition', 'Kopie'])
  })

  it('withMovedCopyUpTest', () => {
    expect(labelsOf(withMovedCopy([copy(), copy({ label: 'Kopie' })], 1, -1)))
      .toEqual(['Kopie', 'Original'])
  })

  it('withMovedCopyAtTheTopTest', () => {
    expect(labelsOf(withMovedCopy([copy(), copy({ label: 'Kopie' })], 0, -1)))
      .toEqual(['Original', 'Kopie'])
  })

  it('withMovedCopyAtTheBottomTest', () => {
    expect(labelsOf(withMovedCopy([copy(), copy({ label: 'Kopie' })], 1, 1)))
      .toEqual(['Original', 'Kopie'])
  })

  it('withMovedCopyInASingleRowListTest', () => {
    expect(labelsOf(withMovedCopy([copy()], 0, 1))).toEqual(['Original'])
  })

  it('withMovedCopyInAnEmptyListTest', () => {
    expect(withMovedCopy([], 0, 1)).toEqual([])
  })

  it('withMovedCopyLeavesTheOriginalAloneTest', () => {
    const copies = [copy(), copy({ label: 'Kopie' })]

    withMovedCopy(copies, 0, 1)

    expect(labelsOf(copies)).toEqual(['Original', 'Kopie'])
  })
})

describe('withMovedPredecessor', () => {
  it('withMovedPredecessorTest', () => {
    expect(withMovedPredecessor([3, 5, 7], 2, -1)).toEqual([3, 7, 5])
  })

  it('withMovedPredecessorAtTheBottomTest', () => {
    expect(withMovedPredecessor([3, 5], 1, 1)).toEqual([3, 5])
  })
})

describe('togglePredecessor', () => {
  it('togglePredecessorTest', () => {
    expect(togglePredecessor([3], 5, true)).toEqual([3, 5])
  })

  it('togglePredecessorOffTest', () => {
    expect(togglePredecessor([3, 5], 3, false)).toEqual([5])
  })

  it('togglePredecessorTwiceKeepsOneEntryTest', () => {
    expect(togglePredecessor([3, 5], 5, true)).toEqual([3, 5])
  })

  it('togglePredecessorOffWhenItIsNotThereTest', () => {
    expect(togglePredecessor([3], 5, false)).toEqual([3])
  })

  it('togglePredecessorOnAnEmptyListTest', () => {
    expect(togglePredecessor([], 5, true)).toEqual([5])
  })
})

describe('nextCopyRow', () => {
  it('nextCopyRowTest', () => {
    expect(nextCopyRow(2)).toEqual({
      label: 'Buchhaltung',
      copies: '1',
      printerId: '',
      trayId: '',
      documentLayoutId: '',
      internal: false,
    })
  })

  it('nextCopyRowForTheFirstCopyTest', () => {
    expect(nextCopyRow(0).label).toBe('Original')
  })

  it('nextCopyRowBeyondTheUsualNamesTest', () => {
    expect(nextCopyRow(5).label).toBe('Exemplar 6')
  })
})

describe('describeCopies', () => {
  it('describeCopiesTest', () => {
    // Three sheets from two rows: the second copy asks for two of itself.
    expect(describeCopies(STORED.copies)).toBe('3 ×')
  })

  it('describeCopiesWithoutEntriesTest', () => {
    // No entry means this kind of document is not printed at all (ADR-0053 of the backend).
    expect(describeCopies([])).toBe('kein Druck')
  })

  it('describeCopiesWithoutTheFieldTest', () => {
    expect(describeCopies(undefined)).toBe('kein Druck')
  })
})

describe('emptyDocumentType', () => {
  /** Without a copy a new kind would print nothing at all (ADR-0053 of the backend). */
  it('emptyDocumentTypeStartsWithOneOriginalTest', () => {
    const form = emptyDocumentType()

    expect(form.copies).toHaveLength(1)
    expect(form.copies[0].label).toBe('Original')
    expect(form.copies[0].internal).toBe(false)
    expect(form.copies[0].documentLayoutId).toBe('')
  })
})

describe('COPY_PRICE_MODES', () => {
  it('copyPriceModesTest', () => {
    // The stored default comes first, so the ordinary case is the first radio row.
    expect(COPY_PRICE_MODES.map((mode) => mode.value)).toEqual(['RECALCULATE', 'COPY'])
  })
})
