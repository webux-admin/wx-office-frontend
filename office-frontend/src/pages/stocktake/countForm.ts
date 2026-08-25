/**
 * What the counting mask holds, and what it sends.
 *
 * <p>React-free and tested on its own, the way `pages/document/lineForm.ts` is: the arithmetic
 * of a count — what differs, which line comes next, what a typed figure means — is what breaks
 * quietly, and it is easier to prove here than through a rendered table.
 */
import { parseDecimal } from '../../lib/format'
import type { StocktakeLine } from '../../lib/types'

/**
 * What one counted line differs by, against the quantity that was frozen.
 *
 * <p>The figure the mask shows live while counting. It is <b>not</b> what gets booked: the
 * booking works against the stock at that moment, so a delivery during the count is not undone
 * (backend ADR-0070). The difference list before booking says both numbers.
 *
 * @param line the line as the server sent it
 * @returns the difference, or undefined on a line nobody counted and on a blind count
 */
export function lineDifference(line: StocktakeLine): number | undefined {
  if (line.countedQuantity === undefined || line.expectedQuantity === undefined) {
    return undefined
  }
  return line.countedQuantity - line.expectedQuantity
}

/**
 * Whether a line has been counted at all.
 *
 * <p>Zero is a count and says «nothing lies here». Absent says «nobody has looked yet», and
 * the two are different statements — the posting dialog asks about the second kind only.
 *
 * @param line the line
 * @returns true once somebody has entered a figure
 */
export function counted(line: StocktakeLine): boolean {
  return line.countedQuantity !== undefined
}

/**
 * The line the focus goes to after one was counted.
 *
 * <p>Type, Enter, next open line — that is the whole flow through an aisle, and it has to work
 * without a mouse. Wraps around to the top, because the last line is followed by whatever was
 * skipped on the way down.
 *
 * @param lines the lines on screen, in the order they are counted
 * @param from the index just counted
 * @returns the index of the next line nobody has counted, or undefined when none is left
 */
export function nextOpenIndex(
  lines: readonly StocktakeLine[],
  from: number,
): number | undefined {
  for (let step = 1; step <= lines.length; step += 1) {
    const index = (from + step) % lines.length
    if (!counted(lines[index])) return index
  }
  return undefined
}

/**
 * Reads a typed count.
 *
 * <p>Refuses a negative figure rather than sending it: what is missing is counted as 0, and
 * the backend refuses it either way — this only spares the user the refusal.
 *
 * @param value what stands in the field
 * @returns the quantity, or undefined where the field says nothing countable
 */
export function countedQuantity(value: string): number | undefined {
  const parsed = parseDecimal(value)
  if (parsed === null || parsed < 0) return undefined
  return parsed
}

/**
 * What keeps a typed count from being sent.
 *
 * @param value what stands in the field
 * @param serial whether the line stands for a single piece
 * @returns the sentence, or undefined where the figure is fine
 */
export function countProblem(value: string, serial: boolean): string | undefined {
  if (value.trim() === '') return undefined
  const parsed = parseDecimal(value)
  if (parsed === null) return 'Das ist keine Menge.'
  if (parsed < 0) return 'Was fehlt, wird mit 0 gezählt.'
  if (serial && parsed > 1) return 'Eine Seriennummer ist entweder da oder nicht: 0 oder 1.'
  return undefined
}

/**
 * How a line is named in one column: its number, or its lot number under it.
 *
 * @param line the line
 * @returns for example «SN-4711», empty on a product nobody follows by number
 */
export function lineLotLabel(line: StocktakeLine): string {
  return line.lotNumber ?? ''
}

/**
 * Whether the posting button may be pressed at all.
 *
 * <p>Two conditions. The choice for the uncounted lines has to be made — it is a choice and not
 * a confirmation, so there is no preselection to fall back on. And every difference above the
 * threshold has to carry a reason, because that is what the threshold is for.
 *
 * @param handling what was chosen for the uncounted lines, undefined while nothing was
 * @param unexplained how many differences still need a reason
 * @returns true when booking may go ahead
 */
export function mayPost(handling: string | undefined, unexplained: number): boolean {
  return handling !== undefined && handling !== '' && unexplained === 0
}

/**
 * How many uncounted lines a list still has.
 *
 * @param lineCount how many lines it has
 * @param countedCount how many of them somebody has counted
 * @returns the number, never negative
 */
export function uncountedCount(lineCount: number, countedCount: number): number {
  return Math.max(0, lineCount - countedCount)
}

/**
 * What the posting dialog says about the uncounted lines.
 *
 * <p>Named in plain words rather than as a warning icon: «14 von 120 Zeilen wurden nicht
 * gezählt» is a fact somebody has to decide about, and it must not read like a formality
 * (backend ADR-0070).
 *
 * @param lineCount how many lines the list has
 * @param countedCount how many of them somebody has counted
 * @returns the sentence, empty where every line was counted
 */
export function uncountedText(lineCount: number, countedCount: number): string {
  const open = uncountedCount(lineCount, countedCount)
  if (open === 0) return ''
  return open === 1
    ? `1 von ${lineCount} Zeilen wurde nicht gezählt.`
    : `${open} von ${lineCount} Zeilen wurden nicht gezählt.`
}
