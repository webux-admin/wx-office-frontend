import { describe, expect, it } from 'vitest'
import type { Rect } from './geometry'
import {
  FREE_STEP,
  GRID_STEP,
  snapMove,
  snapResize,
  snapTargetsOf,
  type SnapOptions,
} from './snapping'

const SHEET: Rect = { x: 0, y: 0, width: 210, height: 297 }
const MAGNETIC: SnapOptions = { threshold: 2, grid: GRID_STEP, magnetic: true }
const GRID_ONLY: SnapOptions = { threshold: 2, grid: GRID_STEP, magnetic: false }

describe('snapTargetsOf', () => {
  it('snapTargetsOfTest', () => {
    const targets = snapTargetsOf(
      SHEET,
      { x: [20, 190], y: [18, 275] },
      [{ x: 40, y: 50, width: 60, height: 10 }],
    )

    // Edges and centre of the sheet, the margins, and the three lines of the neighbour.
    expect(targets.x).toEqual(expect.arrayContaining([0, 105, 210, 20, 190, 40, 70, 100]))
    expect(targets.y).toEqual(expect.arrayContaining([0, 148.5, 297, 18, 275, 50, 55, 60]))
  })

  it('snapTargetsOfWithoutNeighboursTest', () => {
    expect(snapTargetsOf(SHEET, {}, [])).toEqual({ x: [0, 105, 210], y: [0, 148.5, 297] })
  })

  it('snapTargetsOfWithoutDuplicatesTest', () => {
    // A neighbour standing on the margin adds that line only once.
    const targets = snapTargetsOf(SHEET, { x: [20] }, [{ x: 20, y: 0, width: 10, height: 10 }])
    expect(targets.x.filter((line) => line === 20)).toHaveLength(1)
  })
})

describe('snapMove', () => {
  const targets = snapTargetsOf(SHEET, { x: [20, 190], y: [18] }, [])

  it('snapMoveTest', () => {
    // The left edge is 1.3 mm from the margin at 20: it jumps there, and a guide says so.
    const snapped = snapMove({ x: 21.3, y: 60.2, width: 50, height: 10 }, targets, MAGNETIC)

    expect(snapped.x).toBe(20)
    expect(snapped.y).toBe(60)
    expect(snapped.guides).toEqual([{ axis: 'x', position: 20 }])
  })

  it('snapMoveByTheRightEdgeAndTheCentreTest', () => {
    // The right edge at 189 is nearer to the margin at 190 than anything else.
    expect(snapMove({ x: 139, y: 60, width: 50, height: 10 }, targets, MAGNETIC).x).toBe(140)
    // The centre at 104 snaps to the centre of the sheet at 105.
    expect(snapMove({ x: 79, y: 60, width: 50, height: 10 }, targets, MAGNETIC).x).toBe(80)
  })

  it('snapMoveOutsideTheThresholdTest', () => {
    // Nothing is within 2 mm: the corner lands on the half-millimetre grid, no guide.
    const snapped = snapMove({ x: 43.3, y: 60.74, width: 50, height: 10 }, targets, MAGNETIC)

    expect(snapped).toEqual({ x: 43.5, y: 60.5, guides: [] })
  })

  it('snapMoveAtTheThresholdTest', () => {
    expect(snapMove({ x: 22, y: 60, width: 5, height: 5 }, targets, MAGNETIC).x).toBe(20)
    expect(snapMove({ x: 22.1, y: 60, width: 5, height: 5 }, targets, MAGNETIC).x).toBe(22)
  })

  it('snapMoveWithoutMagnetTest', () => {
    // Guides switched off: only the grid is left, also right beside a margin.
    const snapped = snapMove({ x: 20.2, y: 18.3, width: 50, height: 10 }, targets, GRID_ONLY)

    expect(snapped).toEqual({ x: 20, y: 18.5, guides: [] })
  })

  it('snapMoveWithTheFineGridTest', () => {
    // Alt held: a tenth of a millimetre, and nothing attracts.
    const free: SnapOptions = { threshold: 2, grid: FREE_STEP, magnetic: false }
    expect(snapMove({ x: 20.26, y: 18.33, width: 50, height: 10 }, targets, free)).toEqual({
      x: 20.3,
      y: 18.3,
      guides: [],
    })
  })

  it('snapMoveOnBothAxesTest', () => {
    const snapped = snapMove({ x: 19, y: 17, width: 50, height: 10 }, targets, MAGNETIC)

    expect(snapped.x).toBe(20)
    expect(snapped.y).toBe(18)
    expect(snapped.guides).toEqual(
      expect.arrayContaining([
        { axis: 'x', position: 20 },
        { axis: 'y', position: 18 },
      ]),
    )
  })
})

describe('snapResize', () => {
  const targets = snapTargetsOf(SHEET, { x: [20, 190] }, [])

  it('snapResizeTest', () => {
    // The right edge at 189.2 jumps to the margin; the left edge does not move.
    const snapped = snapResize({ x: 30.3, y: 40, width: 158.9, height: 10 }, 'e', targets, MAGNETIC)

    expect(snapped.rect).toEqual({ x: 30.3, y: 40, width: 159.7, height: 10 })
    expect(snapped.guides).toEqual([{ axis: 'x', position: 190 }])
  })

  it('snapResizeOnTheGridTest', () => {
    const snapped = snapResize({ x: 30, y: 40, width: 60.2, height: 10.3 }, 'se', targets, MAGNETIC)

    expect(snapped.rect).toEqual({ x: 30, y: 40, width: 60, height: 10.5 })
    expect(snapped.guides).toEqual([])
  })

  it('snapResizeFromTheLeftTest', () => {
    const snapped = snapResize({ x: 21, y: 40, width: 59, height: 10 }, 'w', targets, MAGNETIC)

    // The right edge stays at 80.
    expect(snapped.rect).toEqual({ x: 20, y: 40, width: 60, height: 10 })
  })

  it('snapResizeNeverTurnsTheBoxInsideOutTest', () => {
    // A box 1 mm wide next to a line: the snap must not pull the right edge past the left.
    const snapped = snapResize({ x: 20.4, y: 40, width: 0.2, height: 10 }, 'e', targets, MAGNETIC)

    expect(snapped.rect.width).toBeGreaterThanOrEqual(0)
    expect(snapped.rect.x).toBe(20.4)
  })

  it('snapResizeWithoutMagnetTest', () => {
    const snapped = snapResize({ x: 30, y: 40, width: 159.2, height: 10 }, 'e', targets, GRID_ONLY)

    expect(snapped.rect.width).toBe(159)
    expect(snapped.guides).toEqual([])
  })
})
