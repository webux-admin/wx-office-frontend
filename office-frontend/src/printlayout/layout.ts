import type {
  LayoutBlock,
  LayoutBlockType,
  PageSetup,
  PrintLayoutDefinition,
} from '../lib/types'

/** Width of an A4 page in millimetres. */
export const A4_WIDTH = 210

/** Height of an A4 page in millimetres. */
export const A4_HEIGHT = 297

/** Least room the positions need, the same number the backend refuses below. */
export const MIN_BODY_HEIGHT = 40

/** What a form starts with when nobody has moved anything. */
export const DEFAULT_PAGE: PageSetup = {
  marginTop: 18,
  marginRight: 20,
  marginBottom: 22,
  marginLeft: 20,
  headerHeight: 85,
  footerHeight: 12,
}

/** Which band a block belongs to. */
export type Band = 'header' | 'body' | 'footer'

/**
 * Whether a block is placed where it was dragged.
 *
 * <p>The tables are not: their height depends on how much the document says, so they flow one
 * after another in the body.
 */
export function isPlaced(type: LayoutBlockType): boolean {
  return (
    type === 'TEXT' ||
    type === 'FIELD' ||
    type === 'IMAGE' ||
    type === 'LINE' ||
    type === 'ADDRESS'
  )
}

/** What each kind of block is called in the palette and on the canvas. */
export const BLOCK_LABELS: Record<LayoutBlockType, string> = {
  TEXT: 'Text',
  FIELD: 'Feld',
  IMAGE: 'Bild',
  LINE: 'Linie',
  ADDRESS: 'Adresse',
  POSITIONS: 'Positionen',
  TOTALS: 'Totale',
  VAT_SUMMARY: 'MwSt-Aufstellung',
  DISCOUNT_STAGES: 'Skontostaffeln',
  PAYMENT_TERMS: 'Zahlungskondition',
  DOCUMENT_TEXT: 'Belegtext',
}

/**
 * Builds a block that is ready to be dropped on the page.
 *
 * @param type what it draws
 * @param at where it goes, in millimetres; ignored for a flowing block
 * @returns the new block
 */
export function newBlock(type: LayoutBlockType, at: { x: number; y: number }): LayoutBlock {
  return {
    type,
    field: defaultFieldOf(type),
    text: type === 'TEXT' ? 'Text' : undefined,
    columns: [],
    x: isPlaced(type) ? at.x : 0,
    y: isPlaced(type) ? at.y : 0,
    width: isPlaced(type) ? defaultWidthOf(type) : undefined,
    height: type === 'ADDRESS' ? 35 : undefined,
    style: { bold: false },
  }
}

/**
 * How much room is left for the positions.
 *
 * @param page the page setup
 * @returns the height of the flowing band in millimetres, negative when nothing is left
 */
export function bodyHeightOf(page: PageSetup): number {
  return (
    A4_HEIGHT - page.marginTop - page.marginBottom - page.headerHeight - page.footerHeight
  )
}

/**
 * Whether the page setup still leaves room to print on.
 *
 * <p>Checked here as well as on the server: the designer should say so while someone is
 * dragging the band, not when they press save.
 *
 * @param page the page setup
 * @returns what is wrong, or undefined when the page works
 */
export function pageProblemOf(page: PageSetup): string | undefined {
  if (page.marginLeft + page.marginRight >= A4_WIDTH) {
    return 'Die seitlichen Ränder lassen keine Breite übrig.'
  }
  const body = bodyHeightOf(page)
  if (body < MIN_BODY_HEIGHT) {
    return `Für die Positionen bleiben nur ${Math.round(body)} mm; nötig sind ${MIN_BODY_HEIGHT} mm.`
  }
  return undefined
}

/**
 * Replaces one block of a band.
 *
 * @param definition the form
 * @param band which band the block sits in
 * @param index its place in that band
 * @param block the block to put there
 * @returns a new form, the old one untouched
 */
export function withBlock(
  definition: PrintLayoutDefinition,
  band: Band,
  index: number,
  block: LayoutBlock,
): PrintLayoutDefinition {
  return {
    ...definition,
    [band]: definition[band].map((current, position) =>
      position === index ? block : current,
    ),
  }
}

/**
 * Drops a block from a band.
 *
 * @param definition the form
 * @param band which band the block sits in
 * @param index its place in that band
 * @returns a new form without it
 */
export function withoutBlock(
  definition: PrintLayoutDefinition,
  band: Band,
  index: number,
): PrintLayoutDefinition {
  return {
    ...definition,
    [band]: definition[band].filter((_, position) => position !== index),
  }
}

/**
 * Adds a block at the end of a band.
 *
 * @param definition the form
 * @param band which band it goes in
 * @param block the block
 * @returns a new form with it
 */
export function withAddedBlock(
  definition: PrintLayoutDefinition,
  band: Band,
  block: LayoutBlock,
): PrintLayoutDefinition {
  return { ...definition, [band]: [...definition[band], block] }
}

/**
 * Moves a flowing block up or down, which is the order it prints in.
 *
 * @param definition the form
 * @param index the block to move
 * @param direction -1 for up, 1 for down
 * @returns a new form, unchanged when the block is already at the end
 */
export function withMovedBodyBlock(
  definition: PrintLayoutDefinition,
  index: number,
  direction: -1 | 1,
): PrintLayoutDefinition {
  const target = index + direction
  if (target < 0 || target >= definition.body.length) return definition
  const body = [...definition.body]
  const [moved] = body.splice(index, 1)
  body.splice(target, 0, moved)
  return { ...definition, body }
}

/** A field block starts bound to something, so it shows a value right away. */
function defaultFieldOf(type: LayoutBlockType): string | undefined {
  if (type === 'FIELD') return 'document.number'
  if (type === 'ADDRESS') return 'recipient'
  if (type === 'DOCUMENT_TEXT') return 'header'
  return undefined
}

function defaultWidthOf(type: LayoutBlockType): number {
  if (type === 'ADDRESS') return 85
  if (type === 'LINE') return 170
  return 60
}
