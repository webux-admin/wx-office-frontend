/**
 * Marking what a search term matched inside a text.
 *
 * <p>Splits rather than builds markup: a hit comes from the backend, and a text from the
 * backend is never written into the page as HTML.
 */

/** One stretch of a text, either what the term matched or what stands around it. */
export type TextPart = {
  text: string
  /** True where this stretch is what the search term matched. */
  match: boolean
}

/**
 * Splits a text into the stretches a search term matched and the ones between them.
 *
 * <p>Compares without regard to case, and takes the term as plain text: a product number
 * carries dots and hyphens, which as a pattern would match something else entirely.
 *
 * @param text the text to mark up, as the backend sent it
 * @param term what was typed into the search field
 * @returns the stretches in reading order; one unmatched part for an empty term, and an
 *          empty list only for an empty text
 */
export function matchParts(text: string, term: string): TextPart[] {
  if (text === '') return []
  const needle = term.trim().toLowerCase()
  if (needle === '') return [{ text, match: false }]

  const haystack = text.toLowerCase()
  const parts: TextPart[] = []
  let read = 0
  for (;;) {
    const found = haystack.indexOf(needle, read)
    if (found < 0) break
    if (found > read) parts.push({ text: text.slice(read, found), match: false })
    parts.push({ text: text.slice(found, found + needle.length), match: true })
    read = found + needle.length
  }
  if (read < text.length) parts.push({ text: text.slice(read), match: false })
  return parts
}
