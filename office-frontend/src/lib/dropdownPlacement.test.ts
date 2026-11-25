import { describe, expect, it } from 'vitest'
import { dropdownPlacement, type DropdownAnchor } from './dropdownPlacement'

/** A field of 36 pixels height and 400 width, its upper edge at `top`. */
function field(top: number): DropdownAnchor {
  return { top, bottom: top + 36, left: 120, width: 400 }
}

describe('dropdownPlacement', () => {
  /** A field in the upper half of a laptop screen: the list drops below it, as wide as it. */
  it('dropdownPlacementTest', () => {
    expect(dropdownPlacement(field(200), 800, 280, 8)).toEqual({
      top: 244,
      left: 120,
      width: 400,
      room: 548,
    })
  })

  /** Just enough room below for the whole list: it stays below. */
  it('dropdownPlacementWithJustEnoughRoomBelowTest', () => {
    const placement = dropdownPlacement(field(500), 852, 300, 8)

    expect(placement.top).toBe(544)
    expect(placement.room).toBe(300)
  })

  /** A field near the bottom of a phone: more room above, so the list grows upwards. */
  it('dropdownPlacementAboveTest', () => {
    expect(dropdownPlacement(field(600), 700, 280, 8)).toEqual({
      bottom: 108,
      left: 120,
      width: 400,
      room: 584,
    })
  })

  /** Too little room on both sides: the list takes the larger side, below on a tie. */
  it('dropdownPlacementWithLittleRoomEitherWayTest', () => {
    expect(dropdownPlacement(field(100), 272, 280, 8).top).toBe(144)
    expect(dropdownPlacement(field(118), 272, 280, 8).top).toBe(162)
    expect(dropdownPlacement(field(120), 272, 280, 8).bottom).toBe(160)
  })

  /** A field scrolled out of the viewport leaves no room, never a negative one. */
  it('dropdownPlacementOutOfViewTest', () => {
    expect(dropdownPlacement(field(-200), 800, 280, 8).room).toBe(948)
    expect(dropdownPlacement(field(900), 800, 280, 8)).toMatchObject({ room: 884 })
    expect(dropdownPlacement(field(900), 800, 280, 8).top).toBeUndefined()
    expect(dropdownPlacement({ top: 0, bottom: 0, left: 0, width: 0 }, 0, 280, 8).room).toBe(0)
  })
})
