import type { LiteLine } from '../lib/markdownLite'
import {
  endOf,
  isBlank,
  NO_MARKS,
  partsOf,
  spanOf,
  type MarkedChar,
  type Marks,
  type Point,
  type Span,
} from '../lib/richTextModel'

/**
 * The formatted text editor in the page: draws its lines into the editable box, reads back what
 * the browser typed there, and maps the browser's selection to places in the lines and back
 * (frontend ADR-0091).
 *
 * <p>A line is a `div` with its kind in `data-block`; bold is `strong`, italic `em`. The point of a
 * list stands in `data-marker` and is drawn by the stylesheet, so it is no character of the text
 * and the caret never lands in it.
 */

/** How a line of each kind is drawn: the marker in front of an entry, from `data-marker`. */
const BLOCK_CLASS: Record<LiteLine['kind'], string> = {
  text: '',
  bullet: 'relative pl-6 before:absolute before:left-1.5 before:content-[attr(data-marker)]',
  number:
    'relative pl-6 before:absolute before:left-0 before:w-4.5 before:text-right before:tabular-nums before:content-[attr(data-marker)]',
}

/** Elements that start a line of their own when the browser puts them into the box. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'])

/** A place the browser names: a node and an offset in it. */
export type Boundary = { node: Node; offset: number }

/**
 * Draws the lines into the box, replacing what stands there. An empty line holds a `br`, so it
 * keeps its height and the caret has somewhere to go; the box is marked empty for the placeholder.
 *
 * @param root the editable box
 * @param blocks the lines
 * @param placeholder what the empty box shows, if anything
 */
export function renderBlocks(root: HTMLElement, blocks: LiteLine[], placeholder?: string) {
  const document = root.ownerDocument
  let counted = 0
  const lines = blocks.map((block) => {
    const line = document.createElement('div')
    line.dataset.block = block.kind
    if (block.kind === 'number') {
      counted += 1
      line.dataset.marker = `${counted}.`
    } else {
      counted = 0
      if (block.kind === 'bullet') line.dataset.marker = '•'
    }
    if (BLOCK_CLASS[block.kind] !== '') line.className = BLOCK_CLASS[block.kind]
    if (block.parts.length === 0) line.append(document.createElement('br'))
    for (const part of block.parts) {
      let node: Node = document.createTextNode(part.text)
      if (part.italic) node = wrapped(document.createElement('em'), node)
      if (part.bold) node = wrapped(document.createElement('strong'), node)
      line.append(node)
    }
    return line
  })
  root.replaceChildren(...lines)
  const blank = isBlank(blocks) && placeholder !== undefined && placeholder !== ''
  if (blank) lines[0].dataset.placeholder = placeholder
  root.dataset.empty = String(blank)
}

function wrapped(element: HTMLElement, child: Node): HTMLElement {
  element.append(child)
  return element
}

/**
 * Reads the lines out of the box, whatever the browser made of it: a `div`, `p` or `li` starts a
 * line, `strong`, `b`, `em` and `i` and a weight or slant in a style set the marks, any other
 * element only holds text. A hard blank becomes a blank, a zero width space goes.
 *
 * @param root the editable box
 * @param boundaries places to find in the lines, such as both ends of the selection
 * @returns the lines, at least one, and the places in them in the order asked for
 */
export function readBlocks(
  root: HTMLElement,
  boundaries: Boundary[] = [],
): { blocks: LiteLine[]; points: Point[] } {
  const lines: { kind: LiteLine['kind']; chars: MarkedChar[] }[] = []
  let current: (typeof lines)[number] | null = null
  const found: (Point | null)[] = boundaries.map(() => null)

  const open = (kind: LiteLine['kind']) => {
    current = { kind, chars: [] }
    lines.push(current)
  }
  const here = (): Point =>
    current === null
      ? { block: lines.length, offset: 0 }
      : { block: lines.length - 1, offset: current.chars.length }
  const note = (node: Node, offset: number) => {
    boundaries.forEach((boundary, index) => {
      if (found[index] === null && boundary.node === node && boundary.offset === offset) {
        found[index] = here()
      }
    })
  }

  const visit = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const data = (node as Text).data
      if (current === null) open('text')
      for (let at = 0; at < data.length; at++) {
        note(node, at)
        const char = data[at]
        if (char === '​' || char === '﻿') continue
        current!.chars.push({ char: char === ' ' || char === '\t' ? ' ' : char, ...marks })
      }
      note(node, data.length)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    const starts = BLOCK_TAGS.has(element.tagName)
    if (starts) open(kindOf(element))
    const inner = marksOf(element, marks)
    element.childNodes.forEach((child, index) => {
      note(element, index)
      visit(child, inner)
    })
    note(element, element.childNodes.length)
    if (starts) current = null
  }

  root.childNodes.forEach((child, index) => {
    note(root, index)
    visit(child, NO_MARKS)
  })
  note(root, root.childNodes.length)

  if (lines.length === 0) open('text')
  const blocks = lines.map((line) => ({ kind: line.kind, parts: partsOf(line.chars) }))
  const points = found.map((point) =>
    point === null || point.block >= blocks.length ? endOf(blocks) : point,
  )
  return { blocks, points }
}

function kindOf(element: HTMLElement): LiteLine['kind'] {
  const kind = element.dataset.block
  if (kind === 'text' || kind === 'bullet' || kind === 'number') return kind
  if (element.tagName !== 'LI') return 'text'
  return element.parentElement?.tagName === 'OL' ? 'number' : 'bullet'
}

function marksOf(element: HTMLElement, marks: Marks): Marks {
  let { bold, italic } = marks
  if (element.tagName === 'STRONG' || element.tagName === 'B') bold = true
  if (element.tagName === 'EM' || element.tagName === 'I') italic = true
  const weight = element.style.fontWeight
  if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) bold = true
  if (weight === 'normal' || (weight !== '' && Number(weight) > 0 && Number(weight) < 600)) bold = false
  const slant = element.style.fontStyle
  if (slant === 'italic' || slant === 'oblique') italic = true
  if (slant === 'normal') italic = false
  return { bold, italic }
}

/**
 * Where the browser's selection stands in the lines.
 *
 * @param root the editable box
 * @returns the selection, `null` when it is not inside the box
 */
export function readSelection(root: HTMLElement): Span | null {
  const selection = root.ownerDocument.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
  if (anchorNode === null || focusNode === null) return null
  if (!root.contains(anchorNode) || !root.contains(focusNode)) return null
  const { points } = readBlocks(root, [
    { node: anchorNode, offset: anchorOffset },
    { node: focusNode, offset: focusOffset },
  ])
  return spanOf(points[0], points[1])
}

/**
 * Sets the browser's selection to places in the drawn lines. Between two stretches the caret
 * goes to the end of the first, so typing goes on with its marks.
 *
 * @param root the editable box, as {@link renderBlocks} drew it
 * @param span the selection
 */
export function selectSpan(root: HTMLElement, span: Span) {
  const selection = root.ownerDocument.getSelection()
  if (selection === null) return
  const start = boundaryOf(root, span.start)
  const end = boundaryOf(root, span.end)
  selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset)
}

function boundaryOf(root: HTMLElement, point: Point): Boundary {
  const line = root.children.item(point.block)
  if (line === null) return { node: root, offset: root.childNodes.length }
  const walker = root.ownerDocument.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let left = point.offset
  let last: Text | null = null
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    if (left <= text.data.length) return { node: text, offset: left }
    left -= text.data.length
    last = text
  }
  return last === null ? { node: line, offset: 0 } : { node: last, offset: last.data.length }
}
