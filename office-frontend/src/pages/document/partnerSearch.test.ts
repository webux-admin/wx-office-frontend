import { describe, expect, it } from 'vitest'
import type { Partner } from '../../lib/types'
import { hitCountText, partnerLabel } from './partnerSearch'

/** One customer, with only what the test cares about spelled out. */
function partner(fields: Partial<Partner> = {}): Partner {
  return { id: 1, name: 'Druckerei Meier AG', ...fields } as Partner
}

describe('partnerLabel', () => {
  it('partnerLabelTest', () => {
    expect(partnerLabel(partner({ partnerNumber: 'K-1001' }))).toBe(
      'K-1001 · Druckerei Meier AG',
    )
  })

  /** Without a number the name stands alone, not behind a dangling separator. */
  it('partnerLabelWithoutANumberTest', () => {
    expect(partnerLabel(partner())).toBe('Druckerei Meier AG')
  })

  it('partnerLabelWithoutAPartnerTest', () => {
    expect(partnerLabel(undefined)).toBe('')
  })
})

describe('hitCountText', () => {
  it('hitCountTextTest', () => {
    expect(hitCountText(false, false, 3)).toBe('3 Treffer')
  })

  it('hitCountTextWithoutHitsTest', () => {
    expect(hitCountText(false, false, 0)).toBe('Kein Treffer')
  })

  /** Announcing a count that is about to change is worse than staying quiet. */
  it('hitCountTextWhilePendingTest', () => {
    expect(hitCountText(true, false, 0)).toBe('')
  })

  /** The refusal is announced by the alert next to it; saying it twice is worse. */
  it('hitCountTextAfterAFailureTest', () => {
    expect(hitCountText(false, true, 0)).toBe('')
  })
})
