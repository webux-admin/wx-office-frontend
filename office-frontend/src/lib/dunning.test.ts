import { describe, expect, it } from 'vitest'
import {
  DUNNING_GROUPINGS,
  DUNNING_GROUPING_HINTS,
  DUNNING_RIGHTS,
  FEE_BOOKINGS,
  FEE_VAT_MODES,
  activeLevelCount,
  escalationProblem,
  isHighestLevel,
} from './dunning'
import type { DunningGrouping, DunningLevel } from './types'

/** One level, with only the parts these functions look at spelled out. */
function level(overrides: Partial<DunningLevel> = {}): DunningLevel {
  return {
    id: 1,
    levelNo: 1,
    dunningTypeId: 7,
    dunningTypeName: 'Zahlungserinnerung',
    daysAfterDue: 10,
    paymentDays: 10,
    minDaysSincePrevious: 0,
    feeAmount: 0,
    active: true,
    ...overrides,
  }
}

/** The four shipped levels, as the backend creates them on first use. */
function shipped(): DunningLevel[] {
  return [
    level({ id: 1, levelNo: 1, daysAfterDue: 10, minDaysSincePrevious: 0 }),
    level({ id: 2, levelNo: 2, daysAfterDue: 20, minDaysSincePrevious: 10 }),
    level({ id: 3, levelNo: 3, daysAfterDue: 30, minDaysSincePrevious: 10 }),
    level({ id: 4, levelNo: 4, daysAfterDue: 45, minDaysSincePrevious: 10 }),
  ]
}

describe('isHighestLevel', () => {
  it('isHighestLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[3])).toBe(true)
  })

  it('isHighestLevelOfAMiddleLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[1])).toBe(false)
  })

  /** The only level is also the highest, so it may go. */
  it('isHighestLevelOfTheOnlyLevelTest', () => {
    const only = level()

    expect(isHighestLevel([only], only)).toBe(true)
  })

  /** A switched off level still holds its position, so it still blocks the one below. */
  it('isHighestLevelWithASwitchedOffTopTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(isHighestLevel(levels, levels[2])).toBe(false)
  })
})

describe('activeLevelCount', () => {
  it('activeLevelCountTest', () => {
    expect(activeLevelCount(shipped())).toBe(4)
  })

  it('activeLevelCountWithSwitchedOffLevelsTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(activeLevelCount(levels)).toBe(3)
  })

  it('activeLevelCountOfNothingTest', () => {
    expect(activeLevelCount([])).toBe(0)
  })
})

describe('escalationProblem', () => {
  it('escalationProblemOfTheShippedSequenceTest', () => {
    expect(escalationProblem(shipped())).toBeNull()
  })

  it('escalationProblemOfASingleLevelTest', () => {
    expect(escalationProblem([level()])).toBeNull()
  })

  it('escalationProblemOfNothingTest', () => {
    expect(escalationProblem([])).toBeNull()
  })

  it('escalationProblemWithAnEarlierDeadlineTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 10 })]

    expect(escalationProblem(levels)).toContain('Stufe 2')
  })

  /** The same day twice is allowed; only going backwards is not. */
  it('escalationProblemWithEqualDeadlinesTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 })]

    expect(escalationProblem(levels)).toBeNull()
  })

  it('escalationProblemWithASmallerFeeTest', () => {
    const levels = [level({ id: 1, levelNo: 1, feeAmount: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, feeAmount: 10 })]

    expect(escalationProblem(levels)).toContain('Gebühr')
  })

  it('escalationProblemWithALongerPaymentPeriodTest', () => {
    const levels = [level({ id: 1, levelNo: 1, paymentDays: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, paymentDays: 20 })]

    expect(escalationProblem(levels)).toContain('Zahlfrist')
  })

  /** A switched off level is not part of the escalation and must not block a fix. */
  it('escalationProblemIgnoresSwitchedOffLevelsTest', () => {
    const levels = [
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 5, paymentDays: 30, active: false }),
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })

  /** The order is judged by position, whatever order the list arrives in. */
  it('escalationProblemSortsFirstTest', () => {
    const levels = [
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })
})

describe('the catalogues', () => {
  it('everyGroupingHasALabelAndAHintTest', () => {
    const codes: DunningGrouping[] = ['PER_INVOICE', 'PER_PARTNER']

    for (const code of codes) {
      expect(DUNNING_GROUPINGS[code]).toBeTruthy()
      expect(DUNNING_GROUPING_HINTS[code]).toBeTruthy()
    }
  })

  it('everyFeeCatalogueIsCompleteTest', () => {
    expect(Object.keys(FEE_BOOKINGS)).toHaveLength(2)
    expect(Object.keys(FEE_VAT_MODES)).toHaveLength(3)
  })

  /** Four rights, and `run` among them although no screen uses it yet. */
  it('theFourRightsTest', () => {
    expect(Object.values(DUNNING_RIGHTS)).toEqual([
      'DUNNING_READ',
      'DUNNING_WRITE',
      'DUNNING_CONFIGURE',
      'DUNNING_RUN',
    ])
  })
})
