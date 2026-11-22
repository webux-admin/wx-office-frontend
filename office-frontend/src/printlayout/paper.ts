import type { LayoutPage, PaperFormat, PrintLayoutDefinition } from '../lib/types'
import type { Rect } from './geometry'

/** Width and height of a sheet in millimetres. */
export type Paper = { width: number; height: number }

/** Which page of a document the sheet shows: the first, or any that follows it. */
export type PageView = 'first' | 'following'

/** The named formats in portrait, the same numbers the backend prints on. */
export const PAPER_SIZES: Record<Exclude<PaperFormat, 'CUSTOM'>, Paper> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  A3: { width: 297, height: 420 },
  LETTER: { width: 215.9, height: 279.4 },
  LEGAL: { width: 215.9, height: 355.6 },
}

/** The shortest and the longest side a custom format may have. */
export const CUSTOM_SIDE_MIN = 50
export const CUSTOM_SIDE_MAX = 450

/** Least room the content needs, in height and in width — the backend refuses below. */
export const MIN_FLOW_HEIGHT = 40
export const MIN_CONTENT_WIDTH = 40

/** The Swiss QR payment part: prescribed by SIX, at the bottom edge of an A4 sheet. */
export const PAYMENT_PART_WIDTH = 210
export const PAYMENT_PART_HEIGHT = 105

/**
 * What the content keeps free at the bottom of the last page for a payment part printed
 * there: its 105 mm and 2 mm for the line with the scissors.
 */
export const PAYMENT_PART_RESERVE = 107

/**
 * The size of the sheet a form prints on.
 *
 * <p>Landscape swaps the two sides of a named format. A custom format is taken as given, and
 * where it names no side yet the sheet falls back to A4 so there is always something to draw.
 *
 * @param page the page setup of the form
 * @returns width and height in millimetres
 */
export function paperSizeOf(page: LayoutPage): Paper {
  if (page.format === 'CUSTOM') {
    return {
      width: page.customWidth ?? PAPER_SIZES.A4.width,
      height: page.customHeight ?? PAPER_SIZES.A4.height,
    }
  }
  const size = PAPER_SIZES[page.format] ?? PAPER_SIZES.A4
  return page.orientation === 'LANDSCAPE'
    ? { width: size.height, height: size.width }
    : { ...size }
}

/**
 * How wide the content may be: the paper less the two side margins.
 *
 * @param page the page setup
 * @returns the width in millimetres, never negative
 */
export function contentWidthOf(page: LayoutPage): number {
  return Math.max(paperSizeOf(page).width - page.marginLeft - page.marginRight, 0)
}

/**
 * Where the content flows on a page.
 *
 * <p>On the first page it starts at `flow.top`, on every later one at the top margin. It ends
 * at the bottom margin on every page.
 *
 * @param definition the form
 * @param view which page is meant
 * @returns the region in millimetres from the top left corner of the paper
 */
export function flowRegionOf(definition: PrintLayoutDefinition, view: PageView): Rect {
  const paper = paperSizeOf(definition.page)
  const top = view === 'first' ? definition.flow.top : definition.page.marginTop
  return {
    x: definition.page.marginLeft,
    y: top,
    width: contentWidthOf(definition.page),
    height: Math.max(paper.height - top - definition.page.marginBottom, 0),
  }
}

/**
 * Whether the QR payment part may be printed at the bottom of the last page.
 *
 * <p>Only on paper exactly 210 mm wide and at least 297 mm high, which in practice is A4
 * portrait: SIX prescribes the part as 210 × 105 mm at the bottom edge.
 *
 * @param page the page setup
 * @returns true when the bottom placement is allowed
 */
export function allowsPaymentPartAtBottom(page: LayoutPage): boolean {
  const paper = paperSizeOf(page)
  return Math.abs(paper.width - PAYMENT_PART_WIDTH) < 0.005 && paper.height >= 297
}

