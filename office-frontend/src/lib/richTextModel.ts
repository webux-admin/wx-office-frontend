import type { InlinePart, LiteLine } from './markdownLite'

/**
 * What the formatted text editor does to its text, as pure steps on its lines: set a stretch
 * bold or italic, turn lines into a list, insert, split a line, take a line out of its list.
 * Every step takes the lines and the selection and gives both back; the editor draws the result
 * and writes it into the stored form (frontend ADR-0091).
 *
 * <p>A place in the text is a line and an offset in its characters, counted in UTF-16 units like
 * the offsets of the browser's selection.
 */

export type Mark = 'bold' | 'italic'

/** Which of the two a character carries. */
export type Marks = { bold: boolean; italic: boolean }

/** A place in the text: the line and how many characters of it stand before. */
export type Point = { block: number; offset: number }

/** A selection, its start never after its end; a caret where both are the same. */
export type Span = { start: Point; end: Point }

/** The lines after a step and where the selection stands then. */
export type Change = { blocks: LiteLine[]; selection: Span }

/** No mark at all, the way pasted text comes in. */
export const NO_MARKS: Marks = { bold: false, italic: false }

/** One character with its marks. */
export type MarkedChar = Marks & { char: string }

/** The characters of a line, without its marks. */
export function textOf(block: LiteLine): string {
  return block.parts.map((part) => part.text).join('')
}

/**
 * @param a one place
 * @param b another
 * @returns below zero when `a` stands before `b`, zero for the same place
 */
export function comparePoints(a: Point, b: Point): number {
  return a.block === b.block ? a.offset - b.offset : a.block - b.block
}

/**
 * @param a one end of a selection, the anchor or the focus
 * @param b the other end
 * @returns the selection with its start first
 */
export function spanOf(a: Point, b: Point): Span {
  return comparePoints(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a }
}

/** Whether a selection is a caret. */
export function isCaret(span: Span): boolean {
  return comparePoints(span.start, span.end) === 0
}

/** The caret at a place. */
export function caretAt(point: Point): Span {
  return { start: point, end: point }
}

/** The place after the last character. */
export function endOf(blocks: LiteLine[]): Point {
  const last = blocks.length - 1
  return { block: last, offset: textOf(blocks[last]).length }
}

/** Whether the text is one empty plain line — where the placeholder shows. */
export function isBlank(blocks: LiteLine[]): boolean {
  return blocks.length === 1 && blocks[0].kind === 'text' && textOf(blocks[0]) === ''
}

/**
 * The marks typing at a caret goes on with: those of the character before it, at the start of a
 * line those of the first character.
 *
 * @param blocks the lines
 * @param point the caret
 * @returns the marks, none on an empty line
 */
export function marksAt(blocks: LiteLine[], point: Point): Marks {
  const chars = charsOf(blocks[point.block])
  const next = chars[point.offset > 0 ? point.offset - 1 : 0]
  return next === undefined ? NO_MARKS : { bold: next.bold, italic: next.italic }
}

/**
 * Whether a selection carries a mark: every character of it; a caret what typing there would
 * carry.
 *
 * @param blocks the lines
 * @param span the selection
 * @param mark bold or italic
 * @returns true where the button of the mark shows as pressed
 */
export function carries(blocks: LiteLine[], span: Span, mark: Mark): boolean {
  if (isCaret(span)) return marksAt(blocks, span.start)[mark]
  const chosen = selectedChars(blocks, span)
  return chosen.length > 0 && chosen.every((char) => char[mark])
}

/**
 * Whether every line the selection touches is an entry of such a list.
 *
 * @param blocks the lines
 * @param span the selection
 * @param kind the list
 * @returns true where the button of the list shows as pressed
 */
export function listed(blocks: LiteLine[], span: Span, kind: 'bullet' | 'number'): boolean {
  return blocks.slice(span.start.block, span.end.block + 1).every((block) => block.kind === kind)
}

/**
 * Sets the selection bold or italic, or takes the mark away where all of it carries it already.
 * A caret changes nothing: the editor keeps the mark for what is typed next.
 *
 * @param blocks the lines
 * @param span the selection
 * @param mark bold or italic
 * @returns the lines, and the selection around the same characters
 */
export function toggleMark(blocks: LiteLine[], span: Span, mark: Mark): Change {
  if (isCaret(span)) return { blocks, selection: span }
  const value = !carries(blocks, span, mark)
  const changed = blocks.map((block, index) => {
    if (index < span.start.block || index > span.end.block) return block
    const from = index === span.start.block ? span.start.offset : 0
    const to = index === span.end.block ? span.end.offset : textOf(block).length
    const chars = charsOf(block).map((char, at) =>
      at >= from && at < to ? { ...char, [mark]: value } : char,
    )
    return { kind: block.kind, parts: partsOf(chars) }
  })
  return { blocks: changed, selection: span }
}

/**
 * Turns the lines of the selection into a list, or back into plain lines where every one of them
 * is such a list already.
 *
 * @param blocks the lines
 * @param span the selection
 * @param kind a list with points or a numbered one
 * @returns the lines, and the same selection
 */
export function toggleList(blocks: LiteLine[], span: Span, kind: 'bullet' | 'number'): Change {
  const next: LiteLine['kind'] = listed(blocks, span, kind) ? 'text' : kind
  const changed = blocks.map((block, index): LiteLine =>
    index < span.start.block || index > span.end.block ? block : { kind: next, parts: block.parts },
  )
  return { blocks: changed, selection: span }
}

/**
 * Takes the selected characters out; a selection over several lines joins the first and the last.
 *
 * @param blocks the lines
 * @param span the selection
 * @returns the lines, and the caret where the selection started
 */
export function removeSpan(blocks: LiteLine[], span: Span): Change {
  if (isCaret(span)) return { blocks, selection: span }
  const first = blocks[span.start.block]
  const last = blocks[span.end.block]
  const joined: LiteLine = {
    kind: first.kind,
    parts: partsOf([
      ...charsOf(first).slice(0, span.start.offset),
      ...charsOf(last).slice(span.end.offset),
    ]),
  }
  return {
    blocks: [...blocks.slice(0, span.start.block), joined, ...blocks.slice(span.end.block + 1)],
    selection: caretAt(span.start),
  }
}

/**
 * Puts text in place of the selection. A line break in it starts a new line of the same kind, so
 * pasted lines in a list stay entries of it. Tabs become blanks.
 *
 * @param blocks the lines
 * @param span the selection the text replaces
 * @param text what to insert, plain
 * @param marks what the inserted characters carry
 * @returns the lines, and the caret after the inserted text
 */
export function insertText(blocks: LiteLine[], span: Span, text: string, marks: Marks): Change {
  const removed = removeSpan(blocks, span)
  const caret = removed.selection.start
  const block = removed.blocks[caret.block]
  const chars = charsOf(block)
  const head = chars.slice(0, caret.offset)
  const tail = chars.slice(caret.offset)
  const lines = text.replace(/\t/g, ' ').split(/\r?\n/)
  const typed = (line: string): MarkedChar[] => line.split('').map((char) => ({ char, ...marks }))
  const inserted: LiteLine[] = lines.map((line, index) => ({
    kind: block.kind,
    parts: partsOf([
      ...(index === 0 ? head : []),
      ...typed(line),
      ...(index === lines.length - 1 ? tail : []),
    ]),
  }))
  const lastLine = lines[lines.length - 1]
  const offset = (lines.length === 1 ? caret.offset : 0) + lastLine.length
  return {
    blocks: [
      ...removed.blocks.slice(0, caret.block),
      ...inserted,
      ...removed.blocks.slice(caret.block + 1),
    ],
    selection: caretAt({ block: caret.block + lines.length - 1, offset }),
  }
}

/**
 * A new line from the caret, a list going on with its next entry. On an empty entry the list ends
 * instead: the entry becomes a plain line and no line is added.
 *
 * @param blocks the lines
 * @param span the selection, replaced by the new line
 * @returns the lines, and the caret at the start of the new line
 */
export function splitBlock(blocks: LiteLine[], span: Span): Change {
  const removed = removeSpan(blocks, span)
  const caret = removed.selection.start
  const block = removed.blocks[caret.block]
  if (block.kind !== 'text' && textOf(block) === '') return unlist(removed.blocks, caret)
  const chars = charsOf(block)
  const head: LiteLine = { kind: block.kind, parts: partsOf(chars.slice(0, caret.offset)) }
  const tail: LiteLine = { kind: block.kind, parts: partsOf(chars.slice(caret.offset)) }
  return {
    blocks: [
      ...removed.blocks.slice(0, caret.block),
      head,
      tail,
      ...removed.blocks.slice(caret.block + 1),
    ],
    selection: caretAt({ block: caret.block + 1, offset: 0 }),
  }
}

/**
 * Takes a line out of its list; its text stays.
 *
 * @param blocks the lines
 * @param point a place in the line
 * @returns the lines, and the caret at the same place
 */
export function unlist(blocks: LiteLine[], point: Point): Change {
  return {
    blocks: blocks.map((block, index) =>
      index === point.block ? { kind: 'text', parts: block.parts } : block,
    ),
    selection: caretAt(point),
  }
}

/**
 * What typing «- » or «1. » at the start of a plain line means: the line becomes an entry of that
 * list, and the characters go. «* » makes a list with points as well.
 *
 * @param blocks the lines, just typed into
 * @param caret where the caret stands
 * @returns the lines with the list, or `null` where the line does not start a list
 */
export function autoList(blocks: LiteLine[], caret: Point): Change | null {
  const block = blocks[caret.block]
  if (block.kind !== 'text') return null
  const start = /^(?:([-*])|\d{1,2}\.) /.exec(textOf(block))
  if (start === null || caret.offset !== start[0].length) return null
  const kind = start[1] === undefined ? 'number' : 'bullet'
  const rest: LiteLine = { kind, parts: partsOf(charsOf(block).slice(start[0].length)) }
  return {
    blocks: blocks.map((other, index) => (index === caret.block ? rest : other)),
    selection: caretAt({ block: caret.block, offset: 0 }),
  }
}

function selectedChars(blocks: LiteLine[], span: Span): MarkedChar[] {
  return blocks.flatMap((block, index) => {
    if (index < span.start.block || index > span.end.block) return []
    const from = index === span.start.block ? span.start.offset : 0
    const to = index === span.end.block ? span.end.offset : textOf(block).length
    return charsOf(block).slice(from, to)
  })
}

function charsOf(block: LiteLine): MarkedChar[] {
  return block.parts.flatMap((part) =>
    part.text.split('').map((char) => ({ char, bold: part.bold, italic: part.italic })),
  )
}

/** Characters back into stretches, neighbours with the same marks as one. */
export function partsOf(chars: MarkedChar[]): InlinePart[] {
  const parts: InlinePart[] = []
  for (const { char, bold, italic } of chars) {
    const last = parts.at(-1)
    if (last && last.bold === bold && last.italic === italic) last.text += char
    else parts.push({ text: char, bold, italic })
  }
  return parts
}
