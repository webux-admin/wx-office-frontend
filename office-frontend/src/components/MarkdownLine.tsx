import { Fragment } from 'react'
import { LINE_SEPARATOR, liteLines, plainLine, type InlinePart } from '../lib/markdownLite'

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
          {line.parts.map((part, at) => (
            <Inline key={at} part={part} />
          ))}
        </Fragment>
      ))}
    </span>
  )
}

function Inline({ part }: { part: InlinePart }) {
  if (part.bold) return <strong className="font-semibold">{part.text}</strong>
  if (part.italic) return <em>{part.text}</em>
  return <>{part.text}</>
}
