/**
 * Lengths of a print form.
 *
 * <p>A form is stored in millimetres and font sizes in points, because that is what the PDF is
 * made of. The screen only ever shows a scaled picture of those numbers, so every conversion
 * lives here and nowhere else.
 */

/** CSS pixels per millimetre at 100 %: the CSS inch is 96 px and 25.4 mm. */
export const PX_PER_MM = 96 / 25.4

/** Millimetres per typographic point: 72 points are one inch. */
export const MM_PER_PT = 25.4 / 72

/**
 * @param millimetres a length on paper
 * @param zoom the scale of the sheet, 1 for 100 %
 * @returns the same length in CSS pixels on screen
 */
export function mmToPx(millimetres: number, zoom = 1): number {
  return millimetres * PX_PER_MM * zoom
}

/**
 * @param pixels a distance on screen in CSS pixels
 * @param zoom the scale of the sheet, 1 for 100 %
 * @returns the same distance on paper in millimetres; 0 when the zoom is not positive
 */
export function pxToMm(pixels: number, zoom = 1): number {
  if (zoom <= 0) return 0
  return pixels / (PX_PER_MM * zoom)
}

/**
 * @param points a font size or line width in points
 * @returns the same length in millimetres
 */
export function ptToMm(points: number): number {
  return points * MM_PER_PT
}

/**
 * Keeps a value between two bounds.
 *
 * <p>Where the bounds cross, the lower one wins: a frame smaller than what is put into it
 * pins the thing to its start rather than throwing it out.
 *
 * @param value the value
 * @param min the lowest allowed
 * @param max the highest allowed
 * @returns the value, or the bound it went past
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(max, min))
}

/**
 * Rounds to the two decimals a stored length may carry.
 *
 * @param value a length
 * @returns the length with at most two decimals, without the noise of binary fractions
 */
export function roundLength(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  // Minus zero would print as "-0" and compare unequal in a deep check of two forms.
  return rounded === 0 ? 0 : rounded
}

/**
 * Rounds to a grid.
 *
 * @param value a length
 * @param step the distance between two grid lines; anything not positive leaves the value
 * @returns the nearest grid line
 */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return roundLength(value)
  return roundLength(Math.round(value / step) * step)
}

/**
 * Writes a length the way the inspector shows it: a decimal point, one decimal, and a second
 * one only where the value really has it.
 *
 * @param value a length in millimetres or points
 * @returns for example `20.0` or `12.25`
 */
export function formatLength(value: number): string {
  const rounded = roundLength(value)
  const oneDecimal = Math.round(rounded * 10) / 10
  return oneDecimal === rounded ? rounded.toFixed(1) : rounded.toFixed(2)
}

/**
 * Writes a length for a sentence: without a trailing `.0`.
 *
 * @param value a length in millimetres
 * @returns for example `20` or `12.5`
 */
export function formatLengthShort(value: number): string {
  return String(roundLength(value))
}

/**
 * Reads a length somebody typed.
 *
 * <p>Takes the comma as well as the point, and a unit typed after the number, because both
 * are what people type when a field says «mm».
 *
 * @param input the raw text of the field
 * @returns the number, or `null` when the text is empty or not a number
 */
export function parseLength(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/\s*(mm|pt)$/i, '')
    .replace(/[’']/g, '')
    .replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
