import { describe, expect, it } from 'vitest'
import {
  describeUsers,
  layoutComplaint,
  suggestCopy,
  type NewLayoutForm,
} from './printLayoutForm'
import type { PrintLayout } from '../../lib/types'

const STANDARD: PrintLayout = {
  id: 12,
  code: 'STANDARD',
  name: 'Standard',
  system: true,
  active: true,
  designed: false,
}

/** A dialog that may be sent, so a test only has to say which field it breaks. */
const COMPLETE: NewLayoutForm = { sourceId: '12', code: 'AUFTRAG-A4', name: 'Auftrag A4' }

describe('suggestCopy', () => {
  it('suggestCopyTest', () => {
    expect(suggestCopy(STANDARD)).toEqual({
      sourceId: '12',
      code: 'STANDARD-2',
      name: 'Standard (Kopie)',
    })
  })

  it('suggestCopyWithoutSourceTest', () => {
    // Nothing to copy means an empty arrangement, and nothing to propose either.
    expect(suggestCopy(undefined)).toEqual({ sourceId: '', code: '', name: '' })
  })

  it('suggestCopyCutsAProposalToTheColumnWidthTest', () => {
    const long: PrintLayout = { ...STANDARD, code: 'A'.repeat(30), name: 'B'.repeat(60) }

    const suggestion = suggestCopy(long)

    expect(suggestion.code).toHaveLength(30)
    expect(suggestion.name).toHaveLength(60)
  })
})

describe('layoutComplaint', () => {
  it('layoutComplaintTest', () => {
    expect(layoutComplaint(COMPLETE)).toBeNull()
  })

  it('layoutComplaintWithoutCodeTest', () => {
    expect(layoutComplaint({ ...COMPLETE, code: '  ' }))
      .toBe('Eine Druckvorlage braucht einen Code.')
  })

  it('layoutComplaintWithTooLongCodeTest', () => {
    expect(layoutComplaint({ ...COMPLETE, code: 'A'.repeat(31) }))
      .toBe('Der Code darf höchstens 30 Zeichen lang sein.')
  })

  it('layoutComplaintWithCodeOfExactlyThirtyTest', () => {
    expect(layoutComplaint({ ...COMPLETE, code: 'A'.repeat(30) })).toBeNull()
  })

  it('layoutComplaintWithASpaceInTheCodeTest', () => {
    expect(layoutComplaint({ ...COMPLETE, code: 'AUFTRAG A4' })).not.toBeNull()
  })

  it('layoutComplaintWithALeadingHyphenTest', () => {
    expect(layoutComplaint({ ...COMPLETE, code: '-AUFTRAG' })).not.toBeNull()
  })

  it('layoutComplaintAcceptsALowercaseCodeTest', () => {
    // The backend upper-cases it, so refusing it here would be a rule of our own.
    expect(layoutComplaint({ ...COMPLETE, code: 'auftrag-a4' })).toBeNull()
  })

  it('layoutComplaintWithoutNameTest', () => {
    expect(layoutComplaint({ ...COMPLETE, name: '' }))
      .toBe('Eine Druckvorlage braucht eine Bezeichnung.')
  })

  it('layoutComplaintWithTooLongNameTest', () => {
    expect(layoutComplaint({ ...COMPLETE, name: 'x'.repeat(61) }))
      .toBe('Die Bezeichnung darf höchstens 60 Zeichen lang sein.')
  })
})

describe('describeUsers', () => {
  it('describeUsersTest', () => {
    const form: PrintLayout = {
      ...STANDARD,
      usedBy: [
        { id: 1, code: 'AU', name: 'Auftrag' },
        { id: 2, code: 'LS', name: 'Lieferschein' },
      ],
    }

    expect(describeUsers(form)).toBe('Auftrag, Lieferschein')
  })

  it('describeUsersCountsTheRestTest', () => {
    const form: PrintLayout = {
      ...STANDARD,
      usedBy: [
        { id: 1, code: 'AU', name: 'Auftrag' },
        { id: 2, code: 'LS', name: 'Lieferschein' },
        { id: 3, code: 'RE', name: 'Rechnung' },
      ],
    }

    expect(describeUsers(form)).toBe('Auftrag, Lieferschein +1')
  })

  it('describeUsersWithOneEntryTest', () => {
    const form: PrintLayout = { ...STANDARD, usedBy: [{ id: 1, code: 'AU', name: 'Auftrag' }] }

    expect(describeUsers(form)).toBe('Auftrag')
  })

  it('describeUsersWithoutEntriesTest', () => {
    expect(describeUsers({ ...STANDARD, usedBy: [] })).toBe('')
  })

  it('describeUsersWithoutTheFieldTest', () => {
    expect(describeUsers(STANDARD)).toBe('')
  })
})
