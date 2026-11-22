import { describe, expect, it } from 'vitest'
import {
  bottomOf,
  clampDelta,
  containsPoint,
  insertionIndexAt,
  insertionLineAt,
  resizeRect,
  rightOf,
  unionOf,
  type Rect,
} from './geometry'

const BOX: Rect = { x: 20, y: 30, width: 60, height: 10 }
const SHEET: Rect = { x: 0, y: 0, width: 210, height: 297 }

describe('rightOf', () => {
  it('rightOfTest', () => {
    expect(rightOf(BOX)).toBe(80)
  })

  it('rightOfWithoutWidthTest', () => {
    expect(rightOf({ ...BOX, width: 0 })).toBe(20)
  })
})

describe('bottomOf', () => {
  it('bottomOfTest', () => {
    expect(bottomOf(BOX)).toBe(40)
  })

  it('bottomOfWithoutHeightTest', () => {
    expect(bottomOf({ ...BOX, height: 0 })).toBe(30)
  })
})

describe('unionOf', () => {
  it('unionOfTest', () => {
    expect(unionOf([BOX, { x: 70, y: 10, width: 40, height: 5 }])).toEqual({
      x: 20,
      y: 10,
      width: 90,
      height: 30,
    })
  })

  it('unionOfWithOneBoxTest', () => {
    expect(unionOf([BOX])).toEqual(BOX)
  })

  it('unionOfWithNothingTest', () => {
    expect(unionOf([])).toBeNull()
  })
})

describe('containsPoint', () => {
  it('containsPointTest', () => {
    expect(containsPoint(BOX, { x: 50, y: 35 })).toBe(true)
    expect(containsPoint(BOX, { x: 90, y: 35 })).toBe(false)
  })

  it('containsPointOnTheEdgeTest', () => {
    expect(containsPoint(BOX, { x: 20, y: 30 })).toBe(true)
    expect(containsPoint(BOX, { x: 80, y: 40 })).toBe(true)
    expect(containsPoint(BOX, { x: 80.01, y: 40 })).toBe(false)
  })
})

describe('clampDelta', () => {
  it('clampDeltaTest', () => {
    expect(clampDelta([{ rect: BOX, frame: SHEET }], 10, 5)).toEqual({ dx: 10, dy: 5 })
  })

  it('clampDeltaAtTheEdgeTest', () => {
    // The box may go 20 mm left and 30 mm up, no further.
    expect(clampDelta([{ rect: BOX, frame: SHEET }], -50, -50)).toEqual({ dx: -20, dy: -30 })
    expect(clampDelta([{ rect: BOX, frame: SHEET }], 500, 500)).toEqual({ dx: 130, dy: 257 })
  })

  it('clampDeltaWithAGroupTest', () => {
    // The group stops when its first member reaches the edge, and keeps its shape.
    const near: Rect = { x: 5, y: 100, width: 10, height: 10 }
    const far: Rect = { x: 100, y: 100, width: 10, height: 10 }
    expect(
      clampDelta(
        [
          { rect: near, frame: SHEET },
          { rect: far, frame: SHEET },
        ],
        -40,
        0,
      ),
    ).toEqual({ dx: -5, dy: 0 })
  })

  it('clampDeltaWithABoxOutsideItsFrameTest', () => {
    // Already outside: it may come back in, but is not pushed further out.
    const outside: Rect = { x: -10, y: 0, width: 20, height: 10 }
    expect(clampDelta([{ rect: outside, frame: SHEET }], -5, 0).dx).toBe(0)
    expect(clampDelta([{ rect: outside, frame: SHEET }], 15, 0).dx).toBe(15)
  })

  it('clampDeltaWithNothingTest', () => {
    expect(clampDelta([], 7, -3)).toEqual({ dx: 7, dy: -3 })
  })
})

describe('resizeRect', () => {
  it('resizeRectTest', () => {
    expect(resizeRect(BOX, 'se', 10, 5, SHEET)).toEqual({ x: 20, y: 30, width: 70, height: 15 })
  })

  it('resizeRectFromTheTopLeftTest', () => {
    // The opposite corner stays where it is.
    expect(resizeRect(BOX, 'nw', -5, -10, SHEET)).toEqual({ x: 15, y: 20, width: 65, height: 20 })
  })

  it('resizeRectWithOneEdgeTest', () => {
    expect(resizeRect(BOX, 'e', 10, 99, SHEET)).toEqual({ x: 20, y: 30, width: 70, height: 10 })
    expect(resizeRect(BOX, 'n', 99, 4, SHEET)).toEqual({ x: 20, y: 34, width: 60, height: 6 })
  })

  it('resizeRectDownToTheSmallestSizeTest', () => {
    expect(resizeRect(BOX, 'e', -500, 0, SHEET).width).toBe(2)
    expect(resizeRect(BOX, 'w', 500, 0, SHEET)).toMatchObject({ x: 78, width: 2 })
    expect(resizeRect(BOX, 's', 0, -500, SHEET, 5).height).toBe(5)
  })

  it('resizeRectAgainstTheFrameTest', () => {
    expect(resizeRect(BOX, 'e', 500, 0, SHEET)).toMatchObject({ x: 20, width: 190 })
    expect(resizeRect(BOX, 'nw', -500, -500, SHEET)).toEqual({ x: 0, y: 0, width: 80, height: 40 })
  })
})

describe('insertionIndexAt', () => {
  const stack = [
    { top: 100, bottom: 110 },
    { top: 114, bottom: 160 },
    { top: 164, bottom: 180 },
  ]

  it('insertionIndexAtTest', () => {
    expect(insertionIndexAt(stack, 120)).toBe(1)
    expect(insertionIndexAt(stack, 150)).toBe(2)
  })

  it('insertionIndexAtTheEndsTest', () => {
    expect(insertionIndexAt(stack, 0)).toBe(0)
    expect(insertionIndexAt(stack, 500)).toBe(3)
  })

  it('insertionIndexAtTheMiddleOfABoxTest', () => {
    // Exactly on the middle counts as the lower half.
    expect(insertionIndexAt(stack, 105)).toBe(1)
    expect(insertionIndexAt(stack, 104.9)).toBe(0)
  })

  it('insertionIndexAtWithNothingTest', () => {
    expect(insertionIndexAt([], 50)).toBe(0)
  })
})

describe('insertionLineAt', () => {
  const stack = [
    { top: 100, bottom: 110 },
    { top: 114, bottom: 160 },
  ]

  it('insertionLineAtTest', () => {
    expect(insertionLineAt(stack, 1, 100)).toBe(112)
  })

  it('insertionLineAtTheEndsTest', () => {
    expect(insertionLineAt(stack, 0, 100)).toBe(100)
    expect(insertionLineAt(stack, 2, 100)).toBe(160)
    expect(insertionLineAt(stack, 9, 100)).toBe(160)
  })

  it('insertionLineAtWithNothingTest', () => {
    expect(insertionLineAt([], 0, 103)).toBe(103)
  })
})
