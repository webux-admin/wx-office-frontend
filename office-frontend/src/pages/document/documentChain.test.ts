import { describe, expect, it } from 'vitest'
import type { DocumentChainEntry } from '../../lib/types'
import { chainEntryLabel, relationLabel, successorNotice, successorsOf } from './documentChain'

/** One document of a chain, with only what the test cares about spelled out. */
function entry(fields: Partial<DocumentChainEntry> = {}): DocumentChainEntry {
  return {
    id: 1,
    documentTypeCode: 'RE',
    documentTypeName: 'Rechnung',
    category: 'INVOICE',
    status: 'FINALISED',
    documentNumber: 'RE-2026-0001',
    documentDate: '2026-01-15',
    currencyCode: 'CHF',
    totalGross: 100,
    relation: 'SELF',
    distance: 0,
    ...fields,
  }
}

describe('relationLabel', () => {
  it('relationLabelTest', () => {
    expect(relationLabel('SUCCESSOR')).toBe('Nachfolgebeleg')
    expect(relationLabel('PREDECESSOR')).toBe('Vorgängerbeleg')
    expect(relationLabel('REVERSAL')).toBe('Storno')
  })

  /** A relation a later backend adds must not blank the badge. */
  it('relationLabelWithAnUnknownRelationTest', () => {
    expect(relationLabel('SOMETHING' as DocumentChainEntry['relation'])).toBe('SOMETHING')
  })
})

describe('successorsOf', () => {
  it('successorsOfTest', () => {
    const chain = [
      entry({ id: 1, relation: 'PREDECESSOR' }),
      entry({ id: 2, relation: 'SELF' }),
      entry({ id: 3, relation: 'SUCCESSOR' }),
    ]

    expect(successorsOf(chain).map((found) => found.id)).toEqual([3])
  })

  /** A reversal is not a successor: it takes the sale back rather than continuing it. */
  it('successorsOfIgnoresAReversalTest', () => {
    expect(successorsOf([entry({ relation: 'REVERSAL' })])).toEqual([])
  })

  it('successorsOfWithoutAChainTest', () => {
    expect(successorsOf(undefined)).toEqual([])
  })
})

describe('successorNotice', () => {
  it('successorNoticeTest', () => {
    const chain = [
      entry({ id: 1, relation: 'SELF' }),
      entry({ id: 2, relation: 'SUCCESSOR', documentNumber: 'RE-2026-0007' }),
    ]

    expect(successorNotice(chain)).toBe('Aus diesem Beleg wurde RE-2026-0007 geschrieben.')
  })

  it('successorNoticeWithSeveralTest', () => {
    const chain = [
      entry({ id: 2, relation: 'SUCCESSOR', documentNumber: 'LS-2026-0001' }),
      entry({ id: 3, relation: 'SUCCESSOR', documentNumber: 'LS-2026-0002' }),
    ]

    expect(successorNotice(chain)).toBe(
      'Aus diesem Beleg wurden LS-2026-0001, LS-2026-0002 geschrieben.',
    )
  })

  /** A header line is not a list: beyond three the count takes over. */
  it('successorNoticeCountsBeyondThreeTest', () => {
    const chain = [1, 2, 3, 4, 5].map((id) =>
      entry({ id, relation: 'SUCCESSOR', documentNumber: `LS-000${id}` }),
    )

    expect(successorNotice(chain)).toBe(
      'Aus diesem Beleg wurden LS-0001, LS-0002, LS-0003 und 2 weitere geschrieben.',
    )
  })

  it('successorNoticeWithADraftTest', () => {
    const chain = [entry({ id: 42, relation: 'SUCCESSOR', documentNumber: undefined })]

    expect(successorNotice(chain)).toBe('Aus diesem Beleg wurde Entwurf 42 geschrieben.')
  })

  /** Nothing to warn about is nothing on screen, not an empty sentence. */
  it('successorNoticeWithoutSuccessorsTest', () => {
    expect(successorNotice([entry({ relation: 'SELF' })])).toBeNull()
  })

  it('successorNoticeWithoutAChainTest', () => {
    expect(successorNotice(undefined)).toBeNull()
  })
})

describe('chainEntryLabel', () => {
  it('chainEntryLabelTest', () => {
    expect(chainEntryLabel(entry())).toBe('RE-2026-0001 · Rechnung')
  })

  it('chainEntryLabelForADraftTest', () => {
    expect(chainEntryLabel(entry({ id: 42, documentNumber: undefined }))).toBe(
      'Entwurf 42 · Rechnung',
    )
  })
})
