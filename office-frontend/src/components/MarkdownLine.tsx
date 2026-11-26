import { Fragment } from 'react'
import { LINE_SEPARATOR, liteLines, plainLine } from '../lib/markdownLite'
import { InlineParts } from './FormattedText'

/**
 * A text with the small Markdown of a time entry, on one line: bold and italic as they were set,
 * the lines of a list one after the other with « · », the way the invoice writes them. The whole
 * text without markers stands in the tooltip, for a cell that cuts it off.
 *
 * <p>Built from React elements, never from HTML: what was typed stays text, markup included
 * (frontend ADR-0090).
 *
 * @param text the text as stored; nothing is drawn for none
 */
export function MarkdownLine({ text, className }: { text: string | null | undefined; className?: string }) {
  const lines = liteLines(text)
  if (lines.length === 0) return null
  return (
    <span className={className} title={plainLine(text)}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && LINE_SEPARATOR}
          <InlineParts parts={line.parts} />
        </Fragment>
      ))}
    </span>
  )
}
