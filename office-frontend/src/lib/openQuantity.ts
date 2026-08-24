import type { OpenLineQuantity } from './types'

/**
 * The positions of a source document that still have something open, in printed order.
 *
 * <p>A position that is fully taken over is left out. The takeover writes no line for it, so
 * showing it in the preview would promise something the new document will not carry.
 *
 * @param rows what the backend answered for the source document
 * @returns the positions with something left, empty when the document is done
 */
export function openLinesOf(rows: readonly OpenLineQuantity[]): OpenLineQuantity[] {
  return rows.filter((row) => row.openQuantity !== 0)
}

/**
 * Looks the open quantities up by the line they belong to.
 *
 * <p>Keyed by `lineId`, which is what a taken-over line names as its `predecessorLineId`.
 *
 * @param rows what the backend answered for the source document
 * @returns one entry per position
 */
export function openByLineId(
  rows: readonly OpenLineQuantity[],
): Map<number, OpenLineQuantity> {
  return new Map(rows.map((row) => [row.lineId, row]))
}

/**
 * Looks the open quantities up by the printed position they belong to.
 *
 * <p>For the document's own mask, whose lines carry a position and no database id.
 *
 * @param rows what the backend answered for that document
 * @returns one entry per position
 */
export function openByLineNumber(
  rows: readonly OpenLineQuantity[],
): Map<number, OpenLineQuantity> {
  return new Map(rows.map((row) => [row.lineNumber, row]))
}

/**
 * Whether a position was entered for more than the predecessor still has open.
 *
 * <p>Not a mistake and never blocked — a subsequent delivery beyond the ordered quantity
 * happens — but worth pointing out, because the usual reason is that somebody overwrote the
 * proposed quantity by accident.
 *
 * <p>Compared by size, not by sign: a returned position runs negative on both sides, and
 * minus three against minus two is the same overshoot as three against two.
 *
 * @param quantity what the line carries, absent on a line that charges nothing
 * @param open     what the predecessor line has left, absent when the line names none
 * @returns true only when both are known and the line is the larger of the two
 */
export function exceedsOpenQuantity(quantity?: number, open?: number): boolean {
  if (quantity === undefined || open === undefined) {
    return false
  }
  return Math.abs(quantity) > Math.abs(open)
}
