import { describe, expect, it } from 'vitest'
import type { DocumentType, PartnerDocumentType } from '../../lib/types'
import {
  assignmentPayload,
  defaultNameOf,
  toAssignmentRows,
  type AssignmentRow,
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
      { category: 'OFFER', documentTypeId: '' },
      { category: 'INVOICE', documentTypeId: '9' },
    ])
  })

  /** The distinction the whole register turns on: the default is not an assignment. */
  it('toAssignmentRowsLeavesTheDefaultEmptyTest', () => {
    const rows = toAssignmentRows([assigned({ documentTypeId: 4, overridden: false })])

    expect(rows[0].documentTypeId).toBe('')
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
      { category: 'OFFER', documentTypeId: '' },
      { category: 'INVOICE', documentTypeId: '9' },
    ]

    expect(assignmentPayload(rows)).toEqual({
      assignments: [{ category: 'INVOICE', documentTypeId: 9 }],
    })
  })

  /** Leaving a step out is how it goes back to the default of that step. */
  it('assignmentPayloadDropsTheEmptyRowsTest', () => {
    const rows: AssignmentRow[] = [
      { category: 'OFFER', documentTypeId: '' },
      { category: 'ORDER', documentTypeId: '' },
    ]

    expect(assignmentPayload(rows).assignments).toEqual([])
  })

  it('assignmentPayloadWithoutRowsTest', () => {
    expect(assignmentPayload([])).toEqual({ assignments: [] })
  })
})
