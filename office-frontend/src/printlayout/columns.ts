import type { LayoutAlign, LayoutColumn, PositionsSection, PrintoutColumn } from '../lib/types'
import { clamp, formatLengthShort, roundLength, roundToStep } from './units'

/**
 * The columns a positions table shows while the form names none — the set a Swiss document
 * usually has. Mirrors the list of the renderer, which is not part of the catalogue.
 */
export const DEFAULT_POSITION_COLUMNS: readonly string[] = [
  'position',
  'productNumber',
  'description',
  'quantity',
  'unit',
  'unitPrice',
  'vatRate',
  'lineNet',
]

/**
 * What every column takes on top of its width: one millimetre of padding on either side of
 * the cell. A column stored as 22 mm is 24 mm of table.
 */
export const COLUMN_PADDING = 2

/** The narrowest a column may be made, in millimetres. */
export const MIN_COLUMN_WIDTH = 5

/** The widest a dragged border makes a column; the check of the form knows the real limit. */
const MAX_COLUMN_WIDTH = 400

/**
 * The least the column that fills the rest is counted at. The server refuses a table whose
 * fixed columns leave it less.
 */
export const MIN_FILL_WIDTH = 20

/** What a column is given when it stops filling the rest and the catalogue proposes nothing. */
export const UNFILLED_WIDTH = 40

/** Width of a column whose code the catalogue does not know and which names none itself. */
const UNKNOWN_WIDTH = 20

/** One column as it is drawn: what the form asked for, completed from the catalogue. */
export type ResolvedColumn = {
  code: string
  /** The heading that is printed. */
  heading: string
  /** The heading the catalogue proposes, shown as the placeholder of the heading field. */
  proposedHeading: string
  /** Width of the cell content in millimetres, without its padding; 0 while it fills the rest. */
  widthMm: number
  /** Whether this column takes whatever width the others leave. */
  fills: boolean
  align: LayoutAlign
  numeric: boolean
  /** False when the catalogue no longer offers this code: the renderer drops the column. */
  known: boolean
  /** Whether the form shows the column. */
  shown: boolean
}

/** How the widths of the columns add up against the room they have. */
export type ColumnBudget = {
  /** The width of the table in millimetres. */
  available: number
  /** What the columns with a width of their own take, padding included. */
  used: number
  /**
   * What is left for the content of the filling column, after its own padding; negative when
   * the fixed columns are already too wide.
   */
  remaining: number
  fillCount: number
  /**
   * `ok` needs no word, `info` is worth knowing, `warning` prints badly, and `error` is a
   * table the server refuses: its columns do not fit.
   */
  tone: 'ok' | 'info' | 'warning' | 'error'
  /** A German sentence for everything but `ok`, otherwise `null`. */
  message: string | null
}

/**
 * The columns a form has chosen, in print order.
 *
 * <p>An empty list on the section means «the default columns»; this spells them out so the
 * configurator always has something concrete to change.
 *
 * @param section the positions section
 * @param catalogue the columns the server offers
 * @returns the chosen columns; for an empty list the defaults the catalogue knows
 */
export function chosenColumnsOf(
  section: Pick<PositionsSection, 'columns'>,
  catalogue: readonly PrintoutColumn[],
): LayoutColumn[] {
  if (section.columns.length > 0) return section.columns
  return DEFAULT_POSITION_COLUMNS.filter(
    (code) => catalogue.length === 0 || catalogue.some((column) => column.code === code),
  ).map((code) => ({ code, widthMm: null, label: null, align: null }))
}

function resolve(
  column: LayoutColumn,
  catalogue: readonly PrintoutColumn[],
  shown: boolean,
): ResolvedColumn {
  const offered = catalogue.find((entry) => entry.code === column.code)
  const widthMm = column.widthMm ?? offered?.widthMm ?? UNKNOWN_WIDTH
  const proposedHeading = offered?.label ?? column.code
  return {
    code: column.code,
    heading: column.label ?? proposedHeading,
    proposedHeading,
    widthMm,
    fills: widthMm === 0,
    align: column.align ?? (offered?.numeric === true ? 'right' : 'left'),
    numeric: offered?.numeric === true,
    known: offered !== undefined,
    shown,
  }
}

/**
 * The columns the table prints, completed from the catalogue.
 *
 * <p>A code the catalogue no longer knows is left out, as the renderer leaves it out: a form
 * keeps printing when a column is retired.
 *
 * @param section the positions section
 * @param catalogue the columns the server offers
 * @returns the printed columns in order
 */
export function printedColumnsOf(
  section: Pick<PositionsSection, 'columns'>,
  catalogue: readonly PrintoutColumn[],
): ResolvedColumn[] {
  return chosenColumnsOf(section, catalogue)
    .map((column) => resolve(column, catalogue, true))
    .filter((column) => column.known)
}

/**
 * Every column the configurator lists: the chosen ones first in print order, then the rest of
 * the catalogue.
 *
 * <p>A chosen column the catalogue does not know stays in the list, marked, so it can be
 * taken out instead of lingering unseen in the stored form.
 *
 * @param section the positions section
 * @param catalogue the columns the server offers
 * @returns one row per column
 */
export function columnRowsOf(
  section: Pick<PositionsSection, 'columns'>,
  catalogue: readonly PrintoutColumn[],
): ResolvedColumn[] {
  const chosen = chosenColumnsOf(section, catalogue)
  const rest = catalogue.filter((entry) => !chosen.some((column) => column.code === entry.code))
  return [
    ...chosen.map((column) => resolve(column, catalogue, true)),
    ...rest.map((entry) =>
      resolve({ code: entry.code, widthMm: null, label: null, align: null }, catalogue, false),
    ),
  ]
}

/**
 * Shows or hides a column.
 *
 * @param chosen the chosen columns
 * @param code the column
 * @param shown whether it should be printed
 * @returns the new list; a column switched on goes to the end
 */
export function toggleColumn(
  chosen: readonly LayoutColumn[],
  code: string,
  shown: boolean,
): LayoutColumn[] {
  const without = chosen.filter((column) => column.code !== code)
  if (!shown) return without
  if (without.length !== chosen.length) return [...chosen]
  return [...chosen, { code, widthMm: null, label: null, align: null }]
}

/**
 * Moves a column to another place in the print order.
 *
 * @param chosen the chosen columns
 * @param from the index of the column
 * @param to the index it should have afterwards
 * @returns the new list, unchanged when either index is outside it
 */
export function moveColumn(
  chosen: readonly LayoutColumn[],
  from: number,
  to: number,
): LayoutColumn[] {
  const columns = [...chosen]
  if (from < 0 || from >= columns.length || to < 0 || to >= columns.length) return columns
  const [moved] = columns.splice(from, 1)
  columns.splice(to, 0, moved)
  return columns
}

/**
 * Changes heading, width or alignment of one column.
 *
 * @param chosen the chosen columns
 * @param code the column
 * @param change what to replace; a blank heading falls back to the proposal
 * @returns the new list
 */
export function updateColumn(
  chosen: readonly LayoutColumn[],
  code: string,
  change: Partial<Omit<LayoutColumn, 'code'>>,
): LayoutColumn[] {
  return chosen.map((column) => {
    if (column.code !== code) return column
    const next = { ...column, ...change }
    return { ...next, label: next.label === null || next.label.trim() === '' ? null : next.label }
  })
}

/**
 * Makes a column fill the rest of the table, or gives it a fixed width again.
 *
 * <p>Exactly one column should fill the rest, so switching it on for one switches it off for
 * whichever did before; that one goes back to the width the catalogue proposes.
 *
 * @param chosen the chosen columns
 * @param catalogue the columns the server offers
 * @param code the column
 * @param fills whether it should fill the rest
 * @returns the new list
 */
export function setFillColumn(
  chosen: readonly LayoutColumn[],
  catalogue: readonly PrintoutColumn[],
  code: string,
  fills: boolean,
): LayoutColumn[] {
  const fixedWidthOf = (column: LayoutColumn) => {
    const proposed = catalogue.find((entry) => entry.code === column.code)?.widthMm ?? 0
    return proposed > 0 ? proposed : UNFILLED_WIDTH
  }
  return chosen.map((column) => {
    const filling = resolve(column, catalogue, true).fills
    if (column.code === code) {
      if (fills) return { ...column, widthMm: 0 }
      return filling ? { ...column, widthMm: fixedWidthOf(column) } : column
    }
    return fills && filling ? { ...column, widthMm: fixedWidthOf(column) } : column
  })
}

/**
 * Drags the border between two columns.
 *
 * <p>The border should follow the pointer, and what makes it follow depends on where the
 * filling column stands. With the filler on the left of the border the table grows from the
 * right, so the column right of the border changes; otherwise the one left of it does. A
 * filling column itself is never given a width: it takes what the others leave.
 *
 * @param chosen the chosen columns
 * @param catalogue the columns the server offers
 * @param boundary the index of the column left of the border
 * @param delta how far the border was dragged to the right, in millimetres
 * @returns the new list, unchanged when the border has no fixed column to change
 */
export function resizeColumnBoundary(
  chosen: readonly LayoutColumn[],
  catalogue: readonly PrintoutColumn[],
  boundary: number,
  delta: number,
): LayoutColumn[] {
  const columns = [...chosen]
  if (boundary < 0 || boundary >= columns.length - 1) return columns
  const resolved = columns.map((column) => resolve(column, catalogue, true))
  const filler = resolved.findIndex((column) => column.fills)
  const fillerLeft = filler !== -1 && filler <= boundary
  const index = fillerLeft ? boundary + 1 : boundary
  if (resolved[index].fills) return columns
  const width = resolved[index].widthMm + (fillerLeft ? -delta : delta)
  columns[index] = {
    ...columns[index],
    widthMm: roundToStep(clamp(width, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH), 0.5),
  }
  return columns
}

/**
 * Adds up the widths of the chosen columns against the width of the table.
 *
 * <p>Each column counts with its padding, as the renderer lays it out: the widths in the form
 * are those of the cell content.
 *
 * @param chosen the chosen columns
 * @param catalogue the columns the server offers
 * @param available the width of the table in millimetres
 * @returns the sums, and a German sentence where something is worth saying
 */
export function columnBudgetOf(
  chosen: readonly LayoutColumn[],
  catalogue: readonly PrintoutColumn[],
  available: number,
): ColumnBudget {
  const resolved = chosen
    .map((column) => resolve(column, catalogue, true))
    .filter((column) => column.known)
  const fillers = resolved.filter((column) => column.fills)
  const used = roundLength(
    resolved
      .filter((column) => !column.fills)
      .reduce((sum, column) => sum + column.widthMm + COLUMN_PADDING, 0),
  )
  const remaining = roundLength(available - used - (fillers.length > 0 ? COLUMN_PADDING : 0))
  const base = { available: roundLength(available), used, remaining, fillCount: fillers.length }

  if (used > available) {
    return {
      ...base,
      tone: 'error',
      message:
        `Die Spalten brauchen ${formatLengthShort(used)} mm, Platz ist für ` +
        `${formatLengthShort(available)} mm. Spalten schmaler machen oder ausblenden.`,
    }
  }
  // Every filling column is counted at its minimum and with its padding, as the server does.
  const needed = used + fillers.length * (MIN_FILL_WIDTH + COLUMN_PADDING)
  if (fillers.length > 0 && needed > available) {
    return {
      ...base,
      tone: 'error',
      message:
        `Für «${fillers[0].heading}» bleiben nur ${formatLengthShort(Math.max(remaining, 0))} mm; ` +
        `nötig sind mindestens ${MIN_FILL_WIDTH} mm. Andere Spalten schmaler machen oder ausblenden.`,
    }
  }
  if (fillers.length > 1) {
    return {
      ...base,
      tone: 'warning',
      message: 'Mehrere Spalten füllen den Rest. Genau eine sollte es sein.',
    }
  }
  if (fillers.length === 0 && remaining > 0) {
    return {
      ...base,
      tone: 'info',
      message: `Keine Spalte füllt den Rest: ${formatLengthShort(remaining)} mm bleiben rechts frei.`,
    }
  }
  return { ...base, tone: 'ok', message: null }
}
