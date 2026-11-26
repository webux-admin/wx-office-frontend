import { Fragment } from 'react'
import { liteLines, type InlinePart, type LiteLine } from '../lib/markdownLite'

/** Lines of one kind that stand together: a paragraph line, a list, a numbered list. */
type Group = { kind: LiteLine['kind']; lines: LiteLine[] }

/**
 * A formatted text over several lines, the way it was set and the way it is printed: bold and
 * italic, a list with its points, a numbered list counted from 1. For the comment of a document
 * line and for a comment line.
 *
 * <p>Built from React elements, never from HTML: what was typed stays text, markup included
 * (frontend ADR-0091).
 *
 * @param text the text as stored; nothing is drawn for none
 */
export function FormattedText({ text, className }: { text: string | null | undefined; className?: string }) {
  const groups = groupsOf(liteLines(text))
  if (groups.length === 0) return null
  return (
    <div className={className}>
      {groups.map((group, index) => {
        if (group.kind === 'text') {
          return (
            <Fragment key={index}>
              {group.lines.map((line, at) => (
                <p key={at}>
                  <InlineParts parts={line.parts} />
                </p>
              ))}
            </Fragment>
          )
        }
        const List = group.kind === 'bullet' ? 'ul' : 'ol'
        return (
          <List key={index} className={`pl-5 ${group.kind === 'bullet' ? 'list-disc' : 'list-decimal'}`}>
            {group.lines.map((line, at) => (
              <li key={at}>
                <InlineParts parts={line.parts} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}

/**
 * The stretches of one line, bold as `strong` and italic as `em`, both where both are set.
 *
 * @param parts the stretches, from `lib/markdownLite`
 */
export function InlineParts({ parts }: { parts: InlinePart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        const text = part.italic ? <em>{part.text}</em> : part.text
        return part.bold ? (
          <strong key={index} className="font-semibold">
            {text}
          </strong>
        ) : (
          <Fragment key={index}>{text}</Fragment>
        )
      })}
    </>
  )
}

function groupsOf(lines: LiteLine[]): Group[] {
  const groups: Group[] = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last && last.kind === line.kind) last.lines.push(line)
    else groups.push({ kind: line.kind, lines: [line] })
  }
  return groups
}
