import { describe, expect, it } from 'vitest'
import {
  CLEARING_PATH,
  CLEARING_RIGHTS,
  DUNNING_WARNING_DAYS,
  OUTCOME_NAMES,
  conflictsKey,
  mayBook,
  remainderOf,
  shouldWarnDunning,
  worklistCountKey,
  worklistKey,
} from './clearing'
import type { WorklistCount } from './types'

function count(over: Partial<WorklistCount> = {}): WorklistCount {
  return {
    open: 4,
    toCheck: 1,
    oldestValueDate: '2026-08-01',
    unassignedAmount: 3240.55,
    currencyCode: 'CHF',
    ...over,
  }
}

describe('shouldWarnDunning', () => {
  const today = new Date('2026-08-20T10:00:00Z')

  it('shouldWarnDunningTest', () => {
    expect(shouldWarnDunning(count(), today)).toBe(true)
  })

  /** Yesterday's import raises nothing. */
  it('shouldWarnDunningWithAFreshImportTest', () => {
    expect(shouldWarnDunning(count({ oldestValueDate: '2026-08-19' }), today)).toBe(false)
  })

  /** Exactly at the limit is not yet older than it. */
  it('shouldWarnDunningAtTheLimitTest', () => {
    expect(shouldWarnDunning(count({ oldestValueDate: '2026-08-15' }), today)).toBe(false)
    expect(shouldWarnDunning(count({ oldestValueDate: '2026-08-14' }), today)).toBe(true)
  })

  it('shouldWarnDunningWithNothingOpenTest', () => {
    expect(shouldWarnDunning(count({ open: 0 }), today)).toBe(false)
  })

  it('shouldWarnDunningWithoutADateTest', () => {
    expect(shouldWarnDunning(count({ oldestValueDate: undefined }), today)).toBe(false)
  })

  /** The module is off, or the call failed: the mask says nothing at all. */
  it('shouldWarnDunningWithoutAnAnswerTest', () => {
    expect(shouldWarnDunning(undefined, today)).toBe(false)
  })

  it('theLimitIsShorterThanAnyDunningPeriodTest', () => {
    expect(DUNNING_WARNING_DAYS).toBe(5)
  })
})

describe('remainderOf', () => {
  it('remainderOfTest', () => {
    expect(remainderOf(1000, [{ amount: 400 }, { amount: 600 }])).toBe(0)
  })

  it('remainderOfWithNothingSetTest', () => {
    expect(remainderOf(1000, [])).toBe(1000)
  })

  it('remainderOfWithTooMuchSetTest', () => {
    expect(remainderOf(1000, [{ amount: 1200 }])).toBe(-200)
  })

  /** Rappen, not floating dust: 0.1 + 0.2 must not leave a remainder of 3e-17. */
  it('remainderOfRoundsToRappenTest', () => {
    expect(remainderOf(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(0)
  })

  /** A half-typed number is not a number, and must not turn the remainder into NaN. */
  it('remainderOfWithAHalfTypedAmountTest', () => {
    expect(remainderOf(1000, [{ amount: Number.NaN }])).toBe(1000)
  })
})

describe('mayBook', () => {
  /**
   * The single most important rule of the screen: «erst gleich, dann buchbar» — not «buchen und
   * der Rest wird schon irgendwie».
   */
  it('mayBookTest', () => {
    expect(mayBook(0, false)).toBe(true)
  })

  it('mayBookWithARemainderTest', () => {
    expect(mayBook(0.03, false)).toBe(false)
    expect(mayBook(-12, false)).toBe(false)
  })

  /** A deliberately chosen treatment for the rest frees the button. */
  it('mayBookWithAHandledRestTest', () => {
    expect(mayBook(0.03, true)).toBe(true)
  })

  /** Below half a rappen is nil. */
  it('mayBookAtTheRappenTest', () => {
    expect(mayBook(0.004, false)).toBe(true)
    expect(mayBook(0.005, false)).toBe(false)
  })
})

describe('the catalogue', () => {
  it('everyOutcomeIsNamedTest', () => {
    for (const outcome of ['POSTED', 'SKIPPED', 'FAILED']) {
      expect(OUTCOME_NAMES[outcome]).toBeTruthy()
    }
  })

  /**
   * The collective action carries a right of its own: a run moves many amounts at once, and
   * nobody looks at every figure.
   */
  it('theRunHasItsOwnRightTest', () => {
    expect(CLEARING_RIGHTS.run).toBe('BANKING_MATCH_RUN')
    expect(CLEARING_RIGHTS.run).not.toBe(CLEARING_RIGHTS.assign)
  })

  it('thePathLivesUnderPaymentsTest', () => {
    expect(CLEARING_PATH.startsWith('/zahlungen/')).toBe(true)
  })
})

describe('cache keys', () => {
  it('worklistKeyTest', () => {
    expect(worklistKey(4)).toEqual(['banking-worklist', 4])
    expect(worklistKey(4, '{}')).toEqual(['banking-worklist', 4, '{}'])
  })

  it('worklistCountKeyTest', () => {
    expect(worklistCountKey(4)).toEqual(['banking-worklist-count', 4])
  })

  it('conflictsKeyTest', () => {
    expect(conflictsKey(4, 9)).toEqual(['banking-dunning-conflicts', 4, 9])
  })
})
