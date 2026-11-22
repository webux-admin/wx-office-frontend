import { bottomOf, rightOf, type Rect, type ResizeHandle } from './geometry'
import { roundLength, roundToStep } from './units'

/** The grid everything lands on when nothing else attracts it, in millimetres. */
export const GRID_STEP = 0.5

/** The grid while snapping is switched off with Alt: fine, but still no binary noise. */
export const FREE_STEP = 0.1

/** A line drawn across the sheet while something is aligned with it. */
export type Guide = {
  /** `x` is a vertical line at that x, `y` a horizontal line at that y. */
  axis: 'x' | 'y'
  position: number
}

/** The lines a dragged box is attracted to, in the coordinates of its frame. */
export type SnapTargets = { x: number[]; y: number[] }

/** How a drag snaps. */
export type SnapOptions = {
  /** How near an edge has to come to a line to jump onto it, in millimetres. */
  threshold: number
  /** The grid used where no line is near. */
  grid: number
  /** Off, only the grid is used: no lines attract and no guides are drawn. */
  magnetic: boolean
}

/**
 * Collects the lines a drag may snap to.
 *
 * <p>The edges and the centre of the frame, whatever extra lines the caller names — the
 * margins, the start of the content — and the edges and centres of every other box.
 *
 * @param frame the sheet, or the free section the dragged box lives in
 * @param extra more lines, for example the margins
 * @param others the boxes that are not being dragged
 * @returns the lines per axis, without duplicates
 */
export function snapTargetsOf(
  frame: Rect,
  extra: { x?: readonly number[]; y?: readonly number[] },
  others: readonly Rect[],
): SnapTargets {
  const x = [frame.x, frame.x + frame.width / 2, rightOf(frame), ...(extra.x ?? [])]
  const y = [frame.y, frame.y + frame.height / 2, bottomOf(frame), ...(extra.y ?? [])]
  for (const other of others) {
    x.push(other.x, other.x + other.width / 2, rightOf(other))
    y.push(other.y, other.y + other.height / 2, bottomOf(other))
  }
  return { x: distinct(x), y: distinct(y) }
}

/**
 * Snaps a box that is being moved.
 *
 * <p>Per axis the left edge, the centre and the right edge are held against the lines; the
 * nearest pair within the threshold wins and the box jumps by that distance. Where nothing is
 * near, its top left corner lands on the grid.
 *
 * @param rect the box where the pointer put it
 * @param targets the lines it may snap to
 * @param options threshold, grid and whether lines attract at all
 * @returns the snapped position and the guides to draw
 */
export function snapMove(
  rect: Rect,
  targets: SnapTargets,
  options: SnapOptions,
): { x: number; y: number; guides: Guide[] } {
  const horizontal = snapAxis(
    [rect.x, rect.x + rect.width / 2, rightOf(rect)],
    targets.x,
    options,
  )
  const vertical = snapAxis(
    [rect.y, rect.y + rect.height / 2, bottomOf(rect)],
    targets.y,
    options,
  )
  const x = horizontal === null ? roundToStep(rect.x, options.grid) : rect.x + horizontal.delta
  const y = vertical === null ? roundToStep(rect.y, options.grid) : rect.y + vertical.delta
  const snapped = { ...rect, x: roundLength(x), y: roundLength(y) }
  return {
    x: snapped.x,
    y: snapped.y,
    guides: options.magnetic ? guidesOf(snapped, targets) : [],
  }
}

/**
 * Snaps a box that is being resized.
 *
 * <p>Only the edges the grip moves are snapped; the opposite ones stay exactly where they
 * were. An edge is never pulled past its opposite: a snap that would turn the box inside out
 * is ignored.
 *
 * @param rect the box as the pointer resized it
 * @param handle the grip that is dragged
 * @param targets the lines it may snap to
 * @param options threshold, grid and whether lines attract at all
 * @returns the snapped box and the guides to draw
 */
export function snapResize(
  rect: Rect,
  handle: ResizeHandle,
  targets: SnapTargets,
  options: SnapOptions,
): { rect: Rect; guides: Guide[] } {
  let left = rect.x
  let top = rect.y
  let right = rightOf(rect)
  let bottom = bottomOf(rect)
  const guides: Guide[] = []

  const edge = (value: number, lines: readonly number[], axis: 'x' | 'y'): number => {
    const hit = snapAxis([value], lines, options)
    if (hit === null) return roundToStep(value, options.grid)
    guides.push({ axis, position: hit.line })
    return roundLength(value + hit.delta)
  }

  if (handle.includes('w')) left = Math.min(edge(left, targets.x, 'x'), right)
  if (handle.includes('e')) right = Math.max(edge(right, targets.x, 'x'), left)
  if (handle.includes('n')) top = Math.min(edge(top, targets.y, 'y'), bottom)
  if (handle.includes('s')) bottom = Math.max(edge(bottom, targets.y, 'y'), top)

  return {
    rect: {
      x: roundLength(left),
      y: roundLength(top),
      width: roundLength(right - left),
      height: roundLength(bottom - top),
    },
    guides: options.magnetic ? guides : [],
  }
}

/** The nearest line to any of the candidate edges, if one is within the threshold. */
function snapAxis(
  candidates: readonly number[],
  lines: readonly number[],
  options: SnapOptions,
): { delta: number; line: number } | null {
  if (!options.magnetic) return null
  let best: { delta: number; line: number } | null = null
  for (const candidate of candidates) {
    for (const line of lines) {
      const delta = line - candidate
      if (Math.abs(delta) > options.threshold) continue
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line }
    }
  }
  return best
}

/** Every line the snapped box now touches with an edge or its centre. */
function guidesOf(rect: Rect, targets: SnapTargets): Guide[] {
  const guides: Guide[] = []
  const touches = (value: number, line: number) => Math.abs(value - line) < 0.01
  for (const line of targets.x) {
    if ([rect.x, rect.x + rect.width / 2, rightOf(rect)].some((value) => touches(value, line))) {
      guides.push({ axis: 'x', position: line })
    }
  }
  for (const line of targets.y) {
    if ([rect.y, rect.y + rect.height / 2, bottomOf(rect)].some((value) => touches(value, line))) {
      guides.push({ axis: 'y', position: line })
    }
  }
  return guides
}

function distinct(values: readonly number[]): number[] {
  return [...new Set(values.map(roundLength))]
}
