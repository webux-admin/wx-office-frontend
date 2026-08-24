import { describe, expect, it } from 'vitest'
import {
  exceedsOpenQuantity,
  openByLineId,
  openByLineNumber,
  openLinesOf,
} from './openQuantity'
import type { OpenLineQuantity } from './types'

/** A position of a source document, with the three numbers the mask shows. */
function row(
  lineId: number,
  lineNumber: number,
  ordered: number,
  delivered: number,
  open: number,
): OpenLineQuantity {
  return {
    lineId,
    lineNumber,
    productId: 5,
    productNumber: 'P-100',
    description: 'Beratung',
    unit: 'Std.',
    orderedQuantity: ordered,
    deliveredQuantity: delivered,
    openQuantity: open,
  }
}

describe('openLinesOf', () => {
  it('openLinesOfTest', () => {
    const rows = [row(1, 1, 10, 6, 4), row(2, 2, 4, 4, 0), row(3, 3, 8, 0, 8)]

    expect(openLinesOf(rows).map((line) => line.lineId)).toEqual([1, 3])
  })

  it('openLinesOfWithoutRowsTest', () => {
    expect(openLinesOf([])).toEqual([])
  })

  it('openLinesOfWithEverythingDeliveredTest', () => {
    expect(openLinesOf([row(1, 1, 10, 10, 0)])).toEqual([])
  })

  it('openLinesOfKeepsANegativePositionTest', () => {
    // A returned position runs negative and is open all the same.
    expect(openLinesOf([row(1, 1, -5, 0, -5)])).toHaveLength(1)
  })
})

describe('openByLineId', () => {
  it('openByLineIdTest', () => {
    const map = openByLineId([row(7, 1, 10, 6, 4), row(9, 2, 4, 0, 4)])

    expect(map.get(7)?.openQuantity).toBe(4)
    expect(map.get(9)?.lineNumber).toBe(2)
  })

  it('openByLineIdWithoutRowsTest', () => {
    expect(openByLineId([]).size).toBe(0)
  })

  it('openByLineIdOfAnUnknownLineTest', () => {
    expect(openByLineId([row(7, 1, 10, 6, 4)]).get(8)).toBeUndefined()
  })
})

describe('openByLineNumber', () => {
  it('openByLineNumberTest', () => {
    const map = openByLineNumber([row(7, 1, 10, 6, 4), row(9, 2, 4, 0, 4)])

    expect(map.get(1)?.lineId).toBe(7)
    expect(map.get(2)?.openQuantity).toBe(4)
  })

  it('openByLineNumberWithoutRowsTest', () => {
    expect(openByLineNumber([]).size).toBe(0)
  })
})

describe('exceedsOpenQuantity', () => {
  it('exceedsOpenQuantityTest', () => {
    expect(exceedsOpenQuantity(6, 4)).toBe(true)
  })

  it('exceedsOpenQuantityWithinTheOpenQuantityTest', () => {
    expect(exceedsOpenQuantity(3, 4)).toBe(false)
  })

  it('exceedsOpenQuantityAtTheOpenQuantityTest', () => {
    expect(exceedsOpenQuantity(4, 4)).toBe(false)
  })

  it('exceedsOpenQuantityOfAReturnTest', () => {
    // Minus three against minus two is the same overshoot as three against two.
    expect(exceedsOpenQuantity(-3, -2)).toBe(true)
    expect(exceedsOpenQuantity(-1, -2)).toBe(false)
  })

  it('exceedsOpenQuantityWithoutAQuantityTest', () => {
    expect(exceedsOpenQuantity(undefined, 4)).toBe(false)
  })

  it('exceedsOpenQuantityWithoutAnOpenQuantityTest', () => {
    expect(exceedsOpenQuantity(6, undefined)).toBe(false)
  })

  it('exceedsOpenQuantityWithNothingOpenTest', () => {
    expect(exceedsOpenQuantity(1, 0)).toBe(true)
  })
})
