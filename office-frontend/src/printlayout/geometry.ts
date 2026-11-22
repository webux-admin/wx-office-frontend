import { clamp, roundLength } from './units'

/** A spot on the paper or inside a frame, in millimetres. */
export type Point = { x: number; y: number }

/** A box in millimetres, measured from the top left corner of whatever holds it. */
export type Rect = { x: number; y: number; width: number; height: number }

/** One of the eight grips of a selected element, named by the compass. */
export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/** Every grip, clockwise from the top. */
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']

/** The smallest side an element may be dragged down to, in millimetres. */
export const MIN_ELEMENT_SIZE = 2

/** @returns the x of the right edge */
export function rightOf(rect: Rect): number {
  return rect.x + rect.width
}

/** @returns the y of the bottom edge */
export function bottomOf(rect: Rect): number {
  return rect.y + rect.height
}

/**
 * The smallest box around several boxes.
 *
 * @param rects the boxes
 * @returns the box around all of them, or `null` for an empty list
 */
export function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map(rightOf))
  const bottom = Math.max(...rects.map(bottomOf))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Whether a spot lies in a box, its edges included.
 *
 * @param rect the box
 * @param point the spot
 * @returns true when the spot is inside or on the edge
 */
export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rightOf(rect) &&
    point.y >= rect.y &&
    point.y <= bottomOf(rect)
  )
}

/**
 * Shortens a move so that every box stays in its own frame.
 *
 * <p>The whole group stops together, which keeps the distances between its members: a group
 * pushed against the edge of the sheet does not fold up.
 *
 * @param items each moved box with the frame that holds it
 * @param dx how far the pointer went to the right, in millimetres
 * @param dy how far the pointer went down, in millimetres
 * @returns the move every box can make
 */
export function clampDelta(
  items: readonly { rect: Rect; frame: Rect }[],
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  let minDx = -Infinity
  let maxDx = Infinity
  let minDy = -Infinity
  let maxDy = Infinity
  for (const { rect, frame } of items) {
    // A box already outside its frame may still move back in, so its own position is always
    // inside the allowed range.
    minDx = Math.max(minDx, Math.min(frame.x - rect.x, 0))
    maxDx = Math.min(maxDx, Math.max(rightOf(frame) - rightOf(rect), 0))
    minDy = Math.max(minDy, Math.min(frame.y - rect.y, 0))
    maxDy = Math.min(maxDy, Math.max(bottomOf(frame) - bottomOf(rect), 0))
  }
  return { dx: clamp(dx, minDx, maxDx), dy: clamp(dy, minDy, maxDy) }
}

/**
 * Resizes a box by dragging one of its grips.
 *
 * <p>The edge opposite the grip stays where it is. The box never gets smaller than `minSize`
 * and never leaves the frame.
 *
 * @param rect the box before the drag
 * @param handle the grip that is dragged
 * @param dx how far the pointer went to the right, in millimetres
 * @param dy how far the pointer went down, in millimetres
 * @param frame the frame the box has to stay in
 * @param minSize the smallest width and height
 * @returns the resized box
 */
export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  frame: Rect,
  minSize = MIN_ELEMENT_SIZE,
): Rect {
  let left = rect.x
  let top = rect.y
  let right = rightOf(rect)
  let bottom = bottomOf(rect)

  if (handle.includes('w')) left = clamp(left + dx, frame.x, right - minSize)
  if (handle.includes('e')) right = clamp(right + dx, left + minSize, rightOf(frame))
  if (handle.includes('n')) top = clamp(top + dy, frame.y, bottom - minSize)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minSize, bottomOf(frame))

  return {
    x: roundLength(left),
    y: roundLength(top),
    width: roundLength(right - left),
    height: roundLength(bottom - top),
  }
}

/**
 * Where something dropped at a height lands among boxes stacked from top to bottom.
 *
 * @param rects the stacked boxes in order, each with its top and bottom
 * @param y the height of the pointer
 * @returns the index to insert at: 0 before the first box, the length after the last
 */
export function insertionIndexAt(
  rects: readonly { top: number; bottom: number }[],
  y: number,
): number {
  for (let index = 0; index < rects.length; index++) {
    if (y < (rects[index].top + rects[index].bottom) / 2) return index
  }
  return rects.length
}

/**
 * Where the bar is drawn that shows an insertion point.
 *
 * @param rects the stacked boxes in order
 * @param index the insertion index, as {@link insertionIndexAt} returned it
 * @param start where the stack begins, used while it is empty
 * @returns the height of the bar: halfway between its two neighbours
 */
export function insertionLineAt(
  rects: readonly { top: number; bottom: number }[],
  index: number,
  start: number,
): number {
  if (rects.length === 0) return start
  if (index <= 0) return rects[0].top
  if (index >= rects.length) return rects[rects.length - 1].bottom
  return (rects[index - 1].bottom + rects[index].top) / 2
}
