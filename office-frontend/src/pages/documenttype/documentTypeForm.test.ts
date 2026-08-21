import { describe, expect, it } from 'vitest'
import {
  COPY_PRICE_MODES,
  MAX_COPIES,
  describeCopies,
  emptyDocumentType,
  firstComplaint,
  nextCopyLabel,
  toForm,
  togglePredecessor,
  toPayload,
  withMovedCopy,
  withMovedPredecessor,
  type DocumentTypeForm,
} from './documentTypeForm'
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
    { position: 1, label: 'Original' },
    { position: 2, label: 'Buchhaltung' },
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

describe('toForm', () => {
  it('toFormTest', () => {
    const form = toForm(STORED)

    expect(form.category).toBe('ORDER')
    expect(form.code).toBe('AU')
    expect(form.name).toBe('Auftrag')
    expect(form.numberPrefix).toBe('AU')
    expect(form.documentLayoutId).toBe('12')
    expect(form.copies).toEqual(['Original', 'Buchhaltung'])
    expect(form.predecessorTypeIds).toEqual([3, 5])
    expect(form.copyPriceMode).toBe('COPY')
  })

  it('toFormTurnsMissingValuesIntoEmptyOnesTest', () => {
    const form = toForm({ id: 1, code: 'LS', category: 'DELIVERY_NOTE', name: 'Lieferschein', active: true })

    expect(form.numberPrefix).toBe('')
    expect(form.documentLayoutId).toBe('')
    expect(form.copies).toEqual([])
    expect(form.predecessorTypeIds).toEqual([])
    expect(form.copyPriceMode).toBe('RECALCULATE')
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
        { position: 1, label: 'Original' },
        { position: 2, label: 'Buchhaltung' },
      ],
      predecessorTypeIds: [3, 5],
      copyPriceMode: 'COPY',
    })
  })

  it('toPayloadNumbersTheCopiesByTheirPlaceTest', () => {
    // The mask holds labels only; the position follows from the row, so reordering the rows
    // is what reorders the PDF.
    const payload = toPayload({ ...COMPLETE, copies: ['Spedition', 'Original'] })

    expect(payload.copies).toEqual([
      { position: 1, label: 'Spedition' },
      { position: 2, label: 'Original' },
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
      'predecessorTypeIds',
    ])
    expect(payload.copies).toEqual([])
    expect(payload.predecessorTypeIds).toEqual([])
  })

  it('toPayloadWithoutPrefixLeavesItOutTest', () => {
    const payload = toPayload({ ...COMPLETE, numberPrefix: '   ' })

    expect(payload.numberPrefix).toBeUndefined()
  })

  it('toPayloadWithoutFormLeavesItOutTest', () => {
    const payload = toPayload({ ...COMPLETE, documentLayoutId: '' })

    expect(payload.documentLayoutId).toBeUndefined()
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
    expect(firstComplaint({ ...COMPLETE, copies: ['Original', ' '] }, true))
      .toBe('Eine Ausfertigung braucht eine Beschriftung. Sonst die Zeile entfernen.')
  })

  it('firstComplaintWithTooLongCopyLabelTest', () => {
    expect(firstComplaint({ ...COMPLETE, copies: ['x'.repeat(61)] }, true))
      .toBe('Eine Beschriftung darf höchstens 60 Zeichen lang sein.')
  })

  it('firstComplaintWithTooManyCopiesTest', () => {
    const copies = Array.from({ length: MAX_COPIES + 1 }, (_, index) => `Exemplar ${index + 1}`)

    expect(firstComplaint({ ...COMPLETE, copies }, true))
      .toBe('Ein Beleg wird höchstens 9 Mal gedruckt.')
  })

  it('firstComplaintWithExactlyNineCopiesTest', () => {
    const copies = Array.from({ length: MAX_COPIES }, (_, index) => `Exemplar ${index + 1}`)

    expect(firstComplaint({ ...COMPLETE, copies }, true)).toBeNull()
  })
})

describe('withMovedCopy', () => {
  it('withMovedCopyTest', () => {
    expect(withMovedCopy(['Original', 'Kopie', 'Spedition'], 1, 1))
      .toEqual(['Original', 'Spedition', 'Kopie'])
  })

  it('withMovedCopyUpTest', () => {
    expect(withMovedCopy(['Original', 'Kopie'], 1, -1)).toEqual(['Kopie', 'Original'])
  })

  it('withMovedCopyAtTheTopTest', () => {
    expect(withMovedCopy(['Original', 'Kopie'], 0, -1)).toEqual(['Original', 'Kopie'])
  })

  it('withMovedCopyAtTheBottomTest', () => {
    expect(withMovedCopy(['Original', 'Kopie'], 1, 1)).toEqual(['Original', 'Kopie'])
  })

  it('withMovedCopyInASingleRowListTest', () => {
    expect(withMovedCopy(['Original'], 0, 1)).toEqual(['Original'])
  })

  it('withMovedCopyInAnEmptyListTest', () => {
    expect(withMovedCopy([], 0, 1)).toEqual([])
  })

  it('withMovedCopyLeavesTheOriginalAloneTest', () => {
    const copies = ['Original', 'Kopie']

    withMovedCopy(copies, 0, 1)

    expect(copies).toEqual(['Original', 'Kopie'])
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

describe('nextCopyLabel', () => {
  it('nextCopyLabelTest', () => {
    expect(nextCopyLabel(2)).toBe('Buchhaltung')
  })

  it('nextCopyLabelForTheFirstCopyTest', () => {
    expect(nextCopyLabel(0)).toBe('Original')
  })

  it('nextCopyLabelBeyondTheUsualNamesTest', () => {
    expect(nextCopyLabel(5)).toBe('Exemplar 6')
  })
})

describe('describeCopies', () => {
  it('describeCopiesTest', () => {
    expect(describeCopies(STORED.copies)).toBe('2 ×')
  })

  it('describeCopiesWithoutEntriesTest', () => {
    // No entries means one copy without a label, not zero copies.
    expect(describeCopies([])).toBe('1 ×')
  })

  it('describeCopiesWithoutTheFieldTest', () => {
    expect(describeCopies(undefined)).toBe('1 ×')
  })
})

describe('COPY_PRICE_MODES', () => {
  it('copyPriceModesTest', () => {
    // The stored default comes first, so the ordinary case is the first radio row.
    expect(COPY_PRICE_MODES.map((mode) => mode.value)).toEqual(['RECALCULATE', 'COPY'])
  })
})
