/**
 * Where a list that drops from a field goes on screen.
 *
 * <p>The list floats above the page instead of inside the box that holds the field, because a
 * dialog scrolls its body and would cut a list off after a few rows (#134). Floating, it needs its
 * place worked out: under the field where there is room, above it where there is more.
 */

/** The box of the field the list drops from, in viewport pixels. */
export type DropdownAnchor = {
  top: number
  bottom: number
  left: number
  width: number
}

/** Where the list goes: under the field from `top` down, or above it from `bottom` up. */
export type DropdownPlacement = {
  /** Distance of the upper edge from the top of the viewport; set when the list goes below. */
  top?: number
  /** Distance of the lower edge from the bottom of the viewport; set when the list goes above. */
  bottom?: number
  left: number
  width: number
  /** How high the list may grow before it reaches the edge of the viewport. */
  room: number
}

/**
 * Places a list under its field, or above it when there is less room below than the list wants
 * and more room above.
 *
 * @param anchor the field, as `getBoundingClientRect` gives it
 * @param viewportHeight the height of the viewport, in pixels
 * @param wanted how high the list wants to be at most, in pixels
 * @param gap the space between field and list, and between list and the edge of the viewport
 * @returns the placement; `room` is never below zero
 */
export function dropdownPlacement(
  anchor: DropdownAnchor,
  viewportHeight: number,
  wanted: number,
  gap: number,
): DropdownPlacement {
  const roomBelow = Math.max(0, viewportHeight - anchor.bottom - 2 * gap)
  const roomAbove = Math.max(0, anchor.top - 2 * gap)
  const across = { left: anchor.left, width: anchor.width }
  if (roomBelow >= wanted || roomBelow >= roomAbove) {
    return { ...across, top: anchor.bottom + gap, room: roomBelow }
  }
  return { ...across, bottom: viewportHeight - anchor.top + gap, room: roomAbove }
}
