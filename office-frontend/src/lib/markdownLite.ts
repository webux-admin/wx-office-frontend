/**
 * The small piece of Markdown a formatted text carries — the text of a time entry, the comment of
 * a document line and a comment line: **bold**, *italic*, lines that start with «- » and lines
 * that start with «1. ». A backslash keeps a character as typed (`\*`), so a star typed in the
 * editor never turns into a marker. Nothing else is read, and nothing becomes HTML: the text stays
 * text in the database, on the invoice and in the CSV, and the screen builds React elements from
 * the parts (frontend ADR-0090 and ADR-0091, backend ADR-0168 and ADR-0170).
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
  parts: InlinePart[]
}

/** How the entries of a list stand on one line, on the screen, the invoice and in the CSV. */
export const LINE_SEPARATOR = ' · '

const BULLET = /^-\s+(.*)$/
const NUMBER = /^\d{1,2}\.\s+(.*)$/
/** What a backslash may keep as typed: every ASCII punctuation mark, as in CommonMark. */
const ESCAPABLE = /[!-/:-@[-`{-~]/
const SPACE = /\s/

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
    .map(lineOf)
    .filter((line) => line.parts.length > 0)
}

/**
 * Reads the text line by line for the editor, the empty lines kept: a line the user has just
 * started is still there when the text is read back.
 *
 * @param text the text as stored
 * @returns its lines, one empty line for an empty text
 */
export function editorLines(text: string | null | undefined): LiteLine[] {
  if (!text) return [{ kind: 'text', parts: [] }]
  return text.split(/\r?\n/).map(lineOf)
}

/**
 * Reads one line: its list marker, then its stretches. The number a numbered line was typed with
 * says nothing; a list counts from 1 wherever it is shown.
 *
 * @param raw one line as stored
 * @returns the line, without the blanks around it
 */
export function lineOf(raw: string): LiteLine {
  const line = raw.trim()
  const bullet = BULLET.exec(line)
  if (bullet) return { kind: 'bullet', parts: inlineParts(bullet[1]) }
  const number = NUMBER.exec(line)
  if (number) return { kind: 'number', parts: inlineParts(number[1]) }
  return { kind: 'text', parts: inlineParts(line) }
}

type Marker = {
  kind: 'mark'
  mark: 'bold' | 'italic'
  raw: string
  /** Followed by a character that is no blank. */
  opens: boolean
  /** Preceded by a character that is no blank. */
  closes: boolean
  paired: boolean
}

type Token = { kind: 'text'; text: string } | Marker

/**
 * Splits a line into plain and set off stretches. `**` sets bold and `*` italic, and both may be
 * set at once. A marker opens only before a character and closes only after one, so «2 * 3»
 * reads as typed, and a marker without its partner stays as it was typed.
 *
 * @param line one line, without its list marker
 * @returns the stretches in reading order, none for an empty line
 */
export function inlineParts(line: string): InlinePart[] {
  const tokens = tokensOf(line)
  pair(tokens, 'bold')
  pair(tokens, 'italic')
  const parts: InlinePart[] = []
  let bold = false
  let italic = false
  for (const token of tokens) {
    if (token.kind === 'mark' && token.paired) {
      if (token.mark === 'bold') bold = !bold
      else italic = !italic
      continue
    }
    const text = token.kind === 'text' ? token.text : token.raw
    const last = parts.at(-1)
    if (last && last.bold === bold && last.italic === italic) last.text += text
    else parts.push({ text, bold, italic })
  }
  return parts
}

/** The characters of a line and its markers; `**` is read before `*`. */
function tokensOf(line: string): Token[] {
  const tokens: Token[] = []
  let text = ''
  const flush = () => {
    if (text !== '') tokens.push({ kind: 'text', text })
    text = ''
  }
  let at = 0
  while (at < line.length) {
    const char = line[at]
    if (char === '\\' && at + 1 < line.length && ESCAPABLE.test(line[at + 1])) {
      text += line[at + 1]
      at += 2
      continue
    }
    if (char !== '*') {
      text += char
      at += 1
      continue
    }
    const raw = line.startsWith('**', at) ? '**' : '*'
    const before = line[at - 1]
    const after = line[at + raw.length]
    flush()
    tokens.push({
      kind: 'mark',
      mark: raw === '**' ? 'bold' : 'italic',
      raw,
      opens: after !== undefined && !SPACE.test(after),
      closes: before !== undefined && !SPACE.test(before),
      paired: false,
    })
    at += raw.length
  }
  flush()
  return tokens
}

/**
 * Pairs the markers of one kind from the left, around at least one character; a marker that finds
 * no partner stays text, so «****» reads as typed.
 */
function pair(tokens: Token[], mark: 'bold' | 'italic') {
  let open: Marker | null = null
  let filled = false
  for (const token of tokens) {
    if (token.kind === 'text') {
      filled = true
      continue
    }
    if (token.mark !== mark) continue
    if (open !== null && token.closes && filled) {
      open.paired = true
      token.paired = true
      open = null
    } else if (token.opens) {
      open = token
      filled = false
    }
  }
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

// --- writing ---------------------------------------------------------------------------

/**
 * Writes lines back into the stored form: a list marker per entry, a numbered list counted from 1,
 * an empty line of any kind as an empty line. A plain line that would read as a list entry keeps
 * its first characters with a backslash.
 *
 * @param lines the lines, as the editor holds them
 * @returns the text to store
 */
export function writeLines(lines: LiteLine[]): string {
  let counted = 0
  return lines
    .map((line) => {
      const text = writeParts(line.parts)
      if (line.kind !== 'number') counted = 0
      if (text === '') return ''
      if (line.kind === 'bullet') return `- ${text}`
      if (line.kind === 'number') {
        counted += 1
        return `${counted}. ${text}`
      }
      return text.replace(/^-(\s)/, '\\-$1').replace(/^(\d{1,2})\.(\s)/, '$1\\.$2')
    })
    .join('\n')
}

/**
 * Writes the stretches of one line with their markers. A blank at the edge of a set off stretch
 * stands outside it, because a marker next to a blank is no marker; a star or a backslash of the
 * text keeps a backslash.
 *
 * @param parts the stretches
 * @returns the line as stored
 */
export function writeParts(parts: InlinePart[]): string {
  const chars = parts.flatMap((part) =>
    [...part.text].map((char) => ({ char, bold: part.bold, italic: part.italic })),
  )
  const marked = chars.map((entry, at) => {
    if (!SPACE.test(entry.char)) return entry
    const before = chars.slice(0, at).findLast((other) => !SPACE.test(other.char))
    const after = chars.slice(at + 1).find((other) => !SPACE.test(other.char))
    return {
      char: entry.char,
      bold: before?.bold === true && after?.bold === true,
      italic: before?.italic === true && after?.italic === true,
    }
  })
  let written = ''
  let bold = false
  let italic = false
  for (const entry of marked) {
    if (bold && !entry.bold) written += '**'
    if (italic && !entry.italic) written += '*'
    if (!bold && entry.bold) written += '**'
    if (!italic && entry.italic) written += '*'
    bold = entry.bold
    italic = entry.italic
    written += entry.char === '*' || entry.char === '\\' ? `\\${entry.char}` : entry.char
  }
  if (italic) written += '*'
  if (bold) written += '**'
  return written
}
