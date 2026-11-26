/**
 * The small piece of Markdown the text of a time entry may carry: **bold**, *italic*, lines that
 * start with «- » and lines that start with «1. ». Nothing else is read, and nothing becomes HTML:
 * the text stays text in the database, on the invoice and in the CSV, and the screen builds
 * React elements from the parts (frontend ADR-0090, backend ADR-0168).
 */

/** A stretch of a line, plain or set off. */
export type InlinePart = {
  text: string
  bold: boolean
  italic: boolean
}

/** One line of the text, with what kind of line it is. */
export type LiteLine = {
  kind: 'text' | 'bullet' | 'number'
  /** The number a numbered line was typed with, for «1.» to «99.». */
  number?: number
  parts: InlinePart[]
}

/** How the entries of a list stand on one line, on the screen, the invoice and in the CSV. */
export const LINE_SEPARATOR = ' · '

const BULLET = /^-\s+(.*)$/
const NUMBER = /^(\d{1,2})\.\s+(.*)$/

/**
 * Reads the text line by line; empty lines are left out.
 *
 * @param text the text as stored, `null` or empty for none
 * @returns its lines, none for an empty text
 */
export function liteLines(text: string | null | undefined): LiteLine[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(lineOf)
}

/**
 * Splits a line into plain and set off stretches. A marker without its partner stays as it was
 * typed, so «2 ** 3» reads as typed.
 *
 * @param line one line, without its list marker
 * @returns the stretches in reading order, none for an empty line
 */
export function inlineParts(line: string): InlinePart[] {
  const parts: InlinePart[] = []
  // Bold first, so «**» is never taken as two italic markers.
  const pattern = /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*/g
  let read = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > read) parts.push(plain(line.slice(read, match.index)))
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true, italic: false })
    else parts.push({ text: match[2], bold: false, italic: true })
    read = match.index + match[0].length
  }
  if (read < line.length) parts.push(plain(line.slice(read)))
  return parts
}

/**
 * The text on one line, without any marker: the lines one after the other with « · », the way
 * the invoice and the CSV write it.
 *
 * @param text the text as stored
 * @returns the plain line, `''` for none
 */
export function plainLine(text: string | null | undefined): string {
  return liteLines(text)
    .map((line) => line.parts.map((part) => part.text).join(''))
    .join(LINE_SEPARATOR)
}

function lineOf(line: string): LiteLine {
  const bullet = BULLET.exec(line)
  if (bullet) return { kind: 'bullet', parts: inlineParts(bullet[1]) }
  const number = NUMBER.exec(line)
  if (number) return { kind: 'number', number: Number(number[1]), parts: inlineParts(number[2]) }
  return { kind: 'text', parts: inlineParts(line) }
}

function plain(text: string): InlinePart {
  return { text, bold: false, italic: false }
}

// --- writing ---------------------------------------------------------------------------

/** What a text field holds after a step of the toolbar: the text and the selection in it. */
export type Edited = {
  value: string
  selectionStart: number
  selectionEnd: number
}

/**
 * Sets the selection bold or italic, or takes the marker away where it is set already. Without a
 * selection the pair of markers goes in with the caret between them, ready to type.
 *
 * @param value the text
 * @param start where the selection starts
 * @param end where it ends
 * @param marker `**` for bold, `*` for italic
 * @returns the text and the selection afterwards, still around the same words
 */
export function toggleEmphasis(value: string, start: number, end: number, marker: string): Edited {
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)
  const wrapped = before.endsWith(marker) && after.startsWith(marker)
    // «**» is bold, so a single «*» next to another one is no italic marker of its own.
    && !(marker === '*' && before.endsWith('**') && after.startsWith('**'))
  if (wrapped) {
    return {
      value: before.slice(0, -marker.length) + selected + after.slice(marker.length),
      selectionStart: start - marker.length,
      selectionEnd: end - marker.length,
    }
  }
  return {
    value: before + marker + selected + marker + after,
    selectionStart: start + marker.length,
    selectionEnd: end + marker.length,
  }
}

/**
 * Turns the lines of the selection into a list, or back into plain lines where every one of them
 * is such a list already. A numbered list counts from 1.
 *
 * @param value the text
 * @param start where the selection starts
 * @param end where it ends
 * @param kind a list with «- » or one with «1. »
 * @returns the text and the selection afterwards, around the same lines
 */
export function toggleList(
  value: string,
  start: number,
  end: number,
  kind: 'bullet' | 'number',
): Edited {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  const to = lineEnd < 0 ? value.length : lineEnd
  const lines = value.slice(from, to).split('\n')
  const marker = kind === 'bullet' ? BULLET : NUMBER
  const listed = lines.every((line) => marker.test(line.trim()))
  const changed = lines.map((line, index) => {
    const text = line.trim()
    if (listed) return kind === 'bullet' ? text.replace(/^-\s+/, '') : text.replace(/^\d{1,2}\.\s+/, '')
    const bare = text.replace(/^-\s+/, '').replace(/^\d{1,2}\.\s+/, '')
    return kind === 'bullet' ? `- ${bare}` : `${index + 1}. ${bare}`
  })
  const block = changed.join('\n')
  return {
    value: value.slice(0, from) + block + value.slice(to),
    selectionStart: from,
    selectionEnd: from + block.length,
  }
}

/**
 * A new line from the caret, the list going on: after «- Wireframes» the next line starts with
 * «- », after «2. Review» with «3. ». On an empty entry the list ends instead and its marker goes.
 *
 * @param value the text
 * @param caret where the caret stands
 * @returns the text and the caret afterwards
 */
export function newLine(value: string, caret: number): Edited {
  const from = value.lastIndexOf('\n', caret - 1) + 1
  const line = value.slice(from, caret)
  const bullet = /^-\s+(.*)$/.exec(line)
  const number = /^(\d{1,2})\.\s+(.*)$/.exec(line)
  const rest = bullet?.[1] ?? number?.[2]
  if (rest !== undefined && rest.trim() === '') {
    // An empty entry ends the list: the marker goes, no line is added.
    const cut = value.slice(0, from) + value.slice(caret)
    return { value: cut, selectionStart: from, selectionEnd: from }
  }
  const next = bullet ? '- ' : number ? `${Number(number[1]) + 1}. ` : ''
  const inserted = `\n${next}`
  const caretAfter = caret + inserted.length
  return {
    value: value.slice(0, caret) + inserted + value.slice(caret),
    selectionStart: caretAfter,
    selectionEnd: caretAfter,
  }
}
