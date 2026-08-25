import { describe, expect, it } from 'vitest'
import type { StocktakeLine } from '../../lib/types'
import {
  counted,
  countedQuantity,
  countProblem,
  lineDifference,
  lineLotLabel,
  mayPost,
  nextOpenIndex,
  uncountedCount,
  uncountedText,
} from './countForm'

/** One line, with only what a test cares about spelled out. */
function line(fields: Partial<StocktakeLine> & { id: number }): StocktakeLine {
  return {
    productId: 7,
    productName: 'Schraube M4',
    movedSinceCounting: false,
    addedDuringCounting: false,
    sortOrder: 10,
    ...fields,
  }
}

describe('lineDifference', () => {
  it('lineDifferenceTest', () => {
    expect(lineDifference(line({ id: 1, expectedQuantity: 20, countedQuantity: 18 }))).toBe(-2)
  })

  it('lineDifferenceWithoutADifferenceTest', () => {
    expect(lineDifference(line({ id: 1, expectedQuantity: 20, countedQuantity: 20 }))).toBe(0)
  })

  it('lineDifferenceOnFoundGoodsTest', () => {
    expect(lineDifference(line({ id: 1, expectedQuantity: 0, countedQuantity: 4 }))).toBe(4)
  })

  it('lineDifferenceWithoutACountTest', () => {
    expect(lineDifference(line({ id: 1, expectedQuantity: 20 }))).toBeUndefined()
  })

  it('lineDifferenceOnABlindCountTest', () => {
    // Without an expected quantity there is nothing to compare against, and inventing a zero
    // would show every counted line as a difference.
    expect(lineDifference(line({ id: 1, countedQuantity: 18 }))).toBeUndefined()
  })
})

describe('counted', () => {
  it('countedTest', () => {
    expect(counted(line({ id: 1, countedQuantity: 3 }))).toBe(true)
  })

  it('countedWithZeroTest', () => {
    // Zero is a count and says «nothing lies here».
    expect(counted(line({ id: 1, countedQuantity: 0 }))).toBe(true)
  })

  it('countedWithoutACountTest', () => {
    expect(counted(line({ id: 1 }))).toBe(false)
  })
})

describe('nextOpenIndex', () => {
  const lines = [
    line({ id: 1, countedQuantity: 5 }),
    line({ id: 2 }),
    line({ id: 3, countedQuantity: 1 }),
    line({ id: 4 }),
  ]

  it('nextOpenIndexTest', () => {
    expect(nextOpenIndex(lines, 1)).toBe(3)
  })

  it('nextOpenIndexSkipsCountedLinesTest', () => {
    expect(nextOpenIndex(lines, 0)).toBe(1)
  })

  it('nextOpenIndexWrapsAroundTest', () => {
    // The last line is followed by whatever was skipped on the way down.
    expect(nextOpenIndex(lines, 3)).toBe(1)
  })

  it('nextOpenIndexWithNothingOpenTest', () => {
    expect(nextOpenIndex([line({ id: 1, countedQuantity: 5 })], 0)).toBeUndefined()
  })

  it('nextOpenIndexOnAnEmptyListTest', () => {
    expect(nextOpenIndex([], 0)).toBeUndefined()
  })
})

describe('countedQuantity', () => {
  it('countedQuantityTest', () => {
    expect(countedQuantity('18')).toBe(18)
  })

  it('countedQuantityOfZeroTest', () => {
    expect(countedQuantity('0')).toBe(0)
  })

  it('countedQuantityOfNothingTest', () => {
    expect(countedQuantity('')).toBeUndefined()
    expect(countedQuantity('abc')).toBeUndefined()
  })

  it('countedQuantityBelowZeroTest', () => {
    expect(countedQuantity('-1')).toBeUndefined()
  })
})

describe('countProblem', () => {
  it('countProblemTest', () => {
    expect(countProblem('18', false)).toBeUndefined()
  })

  it('countProblemOfAnEmptyFieldTest', () => {
    // An empty field is not a mistake; it is a line nobody has counted yet.
    expect(countProblem('', false)).toBeUndefined()
  })

  it('countProblemBelowZeroTest', () => {
    expect(countProblem('-1', false)).toBe('Was fehlt, wird mit 0 gezählt.')
  })

  it('countProblemOfNonsenseTest', () => {
    expect(countProblem('abc', false)).toBe('Das ist keine Menge.')
  })

  it('countProblemOfASerialAboveOneTest', () => {
    expect(countProblem('2', true)).toBe(
      'Eine Seriennummer ist entweder da oder nicht: 0 oder 1.',
    )
    expect(countProblem('1', true)).toBeUndefined()
    expect(countProblem('0', true)).toBeUndefined()
  })
})

describe('lineLotLabel', () => {
  it('lineLotLabelTest', () => {
    expect(lineLotLabel(line({ id: 1, lotNumber: 'SN-4711' }))).toBe('SN-4711')
  })

  it('lineLotLabelWithoutALotTest', () => {
    expect(lineLotLabel(line({ id: 1 }))).toBe('')
  })
})

describe('uncountedCount', () => {
  it('uncountedCountTest', () => {
    expect(uncountedCount(120, 106)).toBe(14)
  })

  it('uncountedCountWithEverythingCountedTest', () => {
    expect(uncountedCount(120, 120)).toBe(0)
  })

  it('uncountedCountNeverGoesNegativeTest', () => {
    expect(uncountedCount(5, 7)).toBe(0)
  })
})

describe('uncountedText', () => {
  it('uncountedTextTest', () => {
    expect(uncountedText(120, 106)).toBe('14 von 120 Zeilen wurden nicht gezählt.')
  })

  it('uncountedTextWithOneLineTest', () => {
    expect(uncountedText(120, 119)).toBe('1 von 120 Zeilen wurde nicht gezählt.')
  })

  it('uncountedTextWithEverythingCountedTest', () => {
    // Nothing to decide, so nothing is said.
    expect(uncountedText(120, 120)).toBe('')
  })
})

describe('mayPost', () => {
  it('mayPostTest', () => {
    expect(mayPost('KEEP', 0)).toBe(true)
  })

  it('mayPostWithoutAChoiceTest', () => {
    // Not a confirmation but a choice: without it the button stays shut.
    expect(mayPost(undefined, 0)).toBe(false)
    expect(mayPost('', 0)).toBe(false)
  })

  it('mayPostWithAnUnexplainedDifferenceTest', () => {
    expect(mayPost('KEEP', 1)).toBe(false)
  })
})
