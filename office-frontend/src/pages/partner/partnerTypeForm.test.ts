import { describe, expect, it } from 'vitest'
import type { DocumentType, PartnerDocumentType } from '../../lib/types'
import {
  assignmentComplaint,
  assignmentPayload,
  defaultNameOf,
  describeCopyRow,
  toAssignmentRows,
  type AssignmentRow,
  type CopyRow,
} from './partnerTypeForm'

/** One answer of the backend, with only what the test cares about spelled out. */
function assigned(fields: Partial<PartnerDocumentType> = {}): PartnerDocumentType {
  return {
    category: 'INVOICE',
    documentTypeId: 4,
    documentTypeCode: 'RE',
    documentTypeName: 'Rechnung',
    overridden: false,
    active: true,
    ...fields,
  }
}

/** One copy row of the mask, with only what the test cares about spelled out. */
function copyRow(fields: Partial<CopyRow> = {}): CopyRow {
  return { position: 1, label: 'Original', defaultCopies: 1, copies: '1', ...fields }
}

/** One row of the mask, with only what the test cares about spelled out. */
function row(fields: Partial<AssignmentRow> = {}): AssignmentRow {
  return { category: 'INVOICE', documentTypeId: '', copies: [], ...fields }
}

/** One kind of the catalogue, with only what the test cares about spelled out. */
function type(fields: Partial<DocumentType> = {}): DocumentType {
  return {
    id: 4,
    code: 'RE',
    category: 'INVOICE',
    name: 'Rechnung',
    active: true,
    ...fields,
  }
}

describe('toAssignmentRows', () => {
  it('toAssignmentRowsTest', () => {
    const rows = toAssignmentRows([
      assigned({ category: 'OFFER', documentTypeId: 1, overridden: false }),
      assigned({ category: 'INVOICE', documentTypeId: 9, overridden: true }),
    ])

    expect(rows).toEqual([
      row({ category: 'OFFER', documentTypeId: '' }),
      row({ category: 'INVOICE', documentTypeId: '9' }),
    ])
  })

  /** The distinction the whole register turns on: the default is not an assignment. */
  it('toAssignmentRowsLeavesTheDefaultEmptyTest', () => {
    const rows = toAssignmentRows([assigned({ documentTypeId: 4, overridden: false })])

    expect(rows[0].documentTypeId).toBe('')
  })

  it('toAssignmentRowsCarriesTheCopiesTest', () => {
    const rows = toAssignmentRows([
      assigned({
        copies: [
          { position: 1, label: 'Original', defaultCopies: 1, copies: 3, overridden: true },
          { position: 2, label: 'Ablage', defaultCopies: 2, copies: 2, overridden: false },
        ],
      }),
    ])

    expect(rows[0].copies).toEqual([
      copyRow({ position: 1, label: 'Original', defaultCopies: 1, copies: '3' }),
      copyRow({ position: 2, label: 'Ablage', defaultCopies: 2, copies: '2' }),
    ])
  })

  it('toAssignmentRowsWithoutCopiesTest', () => {
    expect(toAssignmentRows([assigned()])[0].copies).toEqual([])
  })

  it('toAssignmentRowsWithoutEntriesTest', () => {
    expect(toAssignmentRows([])).toEqual([])
  })

  it('toAssignmentRowsWithoutAListTest', () => {
    expect(toAssignmentRows(undefined)).toEqual([])
  })
})

describe('defaultNameOf', () => {
  it('defaultNameOfTest', () => {
    const types = [
      type({ id: 4, name: 'Rechnung', categoryDefault: true }),
      type({ id: 5, name: 'Behördenrechnung', categoryDefault: false }),
    ]

    expect(defaultNameOf(types, 'INVOICE')).toBe('Rechnung')
  })

  it('defaultNameOfAnotherCategoryTest', () => {
    const types = [type({ category: 'OFFER', name: 'Offerte', categoryDefault: true })]

    expect(defaultNameOf(types, 'INVOICE')).toBeNull()
  })

  it('defaultNameOfWithoutAMarkedKindTest', () => {
    expect(defaultNameOf([type({ categoryDefault: false })], 'INVOICE')).toBeNull()
  })

  it('defaultNameOfWithoutAnyKindTest', () => {
    expect(defaultNameOf([], 'INVOICE')).toBeNull()
  })
})

describe('assignmentPayload', () => {
  it('assignmentPayloadTest', () => {
    const rows: AssignmentRow[] = [
      row({ category: 'OFFER', documentTypeId: '' }),
      row({ category: 'INVOICE', documentTypeId: '9' }),
    ]

    expect(assignmentPayload(rows)).toEqual({
      assignments: [{ category: 'INVOICE', documentTypeId: 9, copies: [] }],
    })
  })

  /** Leaving a step out is how it goes back to the default of that step. */
  it('assignmentPayloadDropsTheEmptyRowsTest', () => {
    const rows: AssignmentRow[] = [
      row({ category: 'OFFER', documentTypeId: '' }),
      row({ category: 'ORDER', documentTypeId: '' }),
    ]

    expect(assignmentPayload(rows).assignments).toEqual([])
  })

  /** The point of the whole register: what matches the kind of document is not sent. */
  it('assignmentPayloadSendsOnlyTheDeviatingCopiesTest', () => {
    const rows = [
      row({
        copies: [
          copyRow({ position: 1, defaultCopies: 1, copies: '1' }),
          copyRow({ position: 2, label: 'Ablage', defaultCopies: 1, copies: '3' }),
        ],
      }),
    ]

    expect(assignmentPayload(rows).assignments).toEqual([
      { category: 'INVOICE', documentTypeId: undefined, copies: [{ position: 2, copies: 3 }] },
    ])
  })

  it('assignmentPayloadSendsZeroAsADeviationTest', () => {
    const rows = [row({ copies: [copyRow({ defaultCopies: 1, copies: '0' })] })]

    expect(assignmentPayload(rows).assignments[0].copies).toEqual([{ position: 1, copies: 0 }])
  })

  /** A step that neither picks a kind nor deviates has nothing to say and is left out. */
  it('assignmentPayloadDropsAStepThatFollowsEverythingTest', () => {
    const rows = [row({ copies: [copyRow({ defaultCopies: 2, copies: '2' })] })]

    expect(assignmentPayload(rows).assignments).toEqual([])
  })

  it('assignmentPayloadWithoutRowsTest', () => {
    expect(assignmentPayload([])).toEqual({ assignments: [] })
  })
})

describe('assignmentComplaint', () => {
  it('assignmentComplaintTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: '2' })] })])).toBeNull()
  })

  /** None at all is a value here, unlike everywhere else copies are counted. */
  it('assignmentComplaintWithZeroTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: '0' })] })])).toBeNull()
  })

  it('assignmentComplaintWithNinetyNineTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: '99' })] })])).toBeNull()
  })

  it('assignmentComplaintWithAnUnreadableCountTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: 'zwei' })] })])).toBe(
      'Die Anzahl bei «Original» ist keine Zahl.',
    )
  })

  it('assignmentComplaintWithAFractionTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: '1.5' })] })])).toBe(
      'Die Anzahl bei «Original» ist eine ganze Zahl.',
    )
  })

  it('assignmentComplaintWithTooManySheetsTest', () => {
    expect(assignmentComplaint([row({ copies: [copyRow({ copies: '100' })] })])).toBe(
      'Die Anzahl bei «Original» liegt zwischen 0 und 99.',
    )
  })

  it('assignmentComplaintWithoutRowsTest', () => {
    expect(assignmentComplaint([])).toBeNull()
  })
})

describe('describeCopyRow', () => {
  it('describeCopyRowTest', () => {
    expect(describeCopyRow(copyRow({ defaultCopies: 2, copies: '2' }))).toBe(
      'Wie die Belegart: 2.',
    )
  })

  it('describeCopyRowWithZeroTest', () => {
    expect(describeCopyRow(copyRow({ defaultCopies: 1, copies: '0' }))).toBe(
      'Wird für diesen Kunden nicht gedruckt.',
    )
  })

  it('describeCopyRowWithADeviationTest', () => {
    expect(describeCopyRow(copyRow({ defaultCopies: 1, copies: '3' }))).toBe(
      'Abweichend. Die Belegart sagt 1.',
    )
  })
})
