import { Bold, Italic, List, ListOrdered } from 'lucide-react'
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  newLine,
  toggleEmphasis,
  toggleList,
  type Edited,
} from '../lib/markdownLite'
import { Field } from './Field'
import { describedBy } from './fieldDescription'

/** The rows the field grows to before it scrolls. */
const MAX_ROWS = 6

/**
 * A text field for a short text with a little formatting: bold, italic, a list and a numbered
 * list, kept as the small Markdown of `lib/markdownLite` — the characters stay visible while
 * typing, and screens show the text formatted.
 *
 * <p>One line high at rest, so it sits in a row of single line fields; it grows with every line
 * up to six. While it has the focus, a bar under the text offers the four formats and counts the
 * characters. Ctrl+B and Ctrl+I set bold and italic, Shift+Enter starts a new line — and goes on
 * with the list where the line is an entry of one. **Enter is left to the form**, so a quick line
 * saves from here as from every other field (frontend ADR-0082, ADR-0090).
 *
 * @param maxLength the most characters the text may have, the markers included
 */
export function RichTextField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  error,
  tooltip,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  maxLength: number
  placeholder?: string
  error?: string
  tooltip?: ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const tooltipId = `${id}-tooltip`
  const area = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // Where the selection goes once the changed text has been drawn.
  const pending = useRef<{ start: number; end: number } | null>(null)
  const [focused, setFocused] = useState(false)

  useLayoutEffect(() => {
    const selection = pending.current
    if (selection === null || area.current === null) return
    pending.current = null
    area.current.setSelectionRange(selection.start, selection.end)
  }, [value])

  const apply = (edited: Edited) => {
    if (edited.value.length > maxLength) return
    pending.current = { start: edited.selectionStart, end: edited.selectionEnd }
    onChange(edited.value)
  }

  const selection = () => {
    const element = area.current
    return element === null
      ? { start: value.length, end: value.length }
      : { start: element.selectionStart, end: element.selectionEnd }
  }

  const emphasis = (marker: string) => {
    const { start, end } = selection()
    apply(toggleEmphasis(value, start, end, marker))
  }

  const list = (kind: 'bullet' | 'number') => {
    const { start, end } = selection()
    apply(toggleList(value, start, end, kind))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const command = event.ctrlKey || event.metaKey
    if (command && !event.shiftKey && !event.altKey && (event.key === 'b' || event.key === 'i')) {
      event.preventDefault()
      emphasis(event.key === 'b' ? '**' : '*')
      return
    }
    if (event.key === 'Enter' && event.shiftKey && !command && !event.altKey) {
      event.preventDefault()
      const { start, end } = selection()
      // A selection is replaced by the new line, as typing would replace it.
      const cut = value.slice(0, start) + value.slice(end)
      apply(newLine(cut, start))
    }
  }

  const rows = Math.min(MAX_ROWS, Math.max(1, value.split('\n').length))

  return (
    <Field
      label={label}
      htmlFor={id}
      hintId={hintId}
      tooltipId={tooltipId}
      focused={focused}
      error={error}
      tooltip={tooltip}
    >
      <div
        ref={box}
        className="flex w-full flex-col"
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!box.current?.contains(event.relatedTarget)) setFocused(false)
        }}
      >
        <textarea
          ref={area}
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={describedBy(hintId, tooltipId, { error, tooltip })}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          className="w-full resize-none bg-transparent px-3 py-2 text-control leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
        />
        {focused && (
          <div
            role="toolbar"
            aria-label={`${label} formatieren`}
            className="flex items-center gap-0.5 border-t border-line-subtle px-1.5 py-1"
          >
            <FormatButton label="Fett (Strg+B)" onClick={() => emphasis('**')}>
              <Bold size={14} aria-hidden />
            </FormatButton>
            <FormatButton label="Kursiv (Strg+I)" onClick={() => emphasis('*')}>
              <Italic size={14} aria-hidden />
            </FormatButton>
            <FormatButton label="Aufzählung" onClick={() => list('bullet')}>
              <List size={14} aria-hidden />
            </FormatButton>
            <FormatButton label="Nummerierte Liste" onClick={() => list('number')}>
              <ListOrdered size={14} aria-hidden />
            </FormatButton>
            <span className="ml-auto pr-1 text-caption tabular-nums text-text-tertiary">
              {value.length} / {maxLength}
            </span>
          </div>
        )}
      </div>
    </Field>
  )
}

/** A button of the bar; it keeps the selection in the text, which a click would otherwise drop. */
function FormatButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="grid size-icon-button place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
    >
      {children}
    </button>
  )
}
