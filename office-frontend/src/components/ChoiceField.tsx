import { Check, Search } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { choicesMatching, type Choice } from '../lib/choices'
import { nextIndex } from '../lib/keyboardList'
import { MarkedText } from './LookupField'
import { TextField } from './TextField'
import { useFloatingList } from './useFloatingList'

/**
 * A field that searches a list the browser already holds and takes one choice: a combobox in the
 * sense of ARIA, for lists of a few hundred values where a select would have to be scrolled.
 *
 * <p>The field shows the chosen choice. Focused, it opens the whole list with the chosen one
 * marked; typing narrows it to the choices whose label or detail holds the term, with the match
 * set off. The arrow keys move the mark without the focus leaving the field, Enter and a click
 * take a choice, and Escape shuts the list without a change — marked as handled, so a dialog or
 * mask around does not read it as «cancel». Leaving the field gives the typing up.
 *
 * <p>Without `value` the field is a way to add: it stays empty, and every choice is handed over,
 * for a list of several chosen values shown beside it, such as people as chips.
 *
 * <p>The list floats over the page like the one of `LookupField`, so a dialog that scrolls its
 * body does not cut it off (frontend ADR-0088).
 *
 * @param value the value of the chosen choice; absent for a field that adds
 * @param placeholder what the empty field says, for example «Alle Projekte»
 * @param emptyText what the list says when it holds nothing at all
 */
export function ChoiceField({
  label,
  choices,
  value,
  onChoose,
  placeholder,
  emptyText = 'Keine Auswahl vorhanden.',
  tooltip,
  disabled = false,
  className,
}: {
  label: string
  choices: readonly Choice[]
  value?: string
  onChoose: (value: string) => void
  placeholder?: string
  emptyText?: string
  tooltip?: string
  disabled?: boolean
  className?: string
}) {
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  // What was typed since the field took the focus; null while nothing was.
  const [term, setTerm] = useState<string | null>(null)
  const [marked, setMarked] = useState(-1)

  const chosen = value === undefined ? undefined : choices.find((choice) => choice.value === value)
  const shown = term === null ? choices : choicesMatching(choices, term)
  const active = shown.length === 0 ? -1 : Math.min(Math.max(marked, -1), shown.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  const close = () => {
    setOpen(false)
    setTerm(null)
    setMarked(-1)
  }

  const take = (choice: Choice) => {
    close()
    onChoose(choice.value)
  }

  const openAt = () => {
    setOpen(true)
    setMarked(chosen === undefined ? -1 : choices.indexOf(chosen))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openAt()
        return
      }
      setMarked(nextIndex(active, event.key === 'ArrowDown' ? 1 : -1, shown.length))
      return
    }
    if (event.key !== 'Enter' || !open || active < 0) return
    const choice = shown[active]
    if (choice === undefined) return
    // Held back from the form: while a choice is marked, Enter belongs to the list.
    event.preventDefault()
    event.stopPropagation()
    take(choice)
  }

  const placeAtField = useFloatingList(box)

  // The marked choice has to be visible in a long list.
  const showMarked = (index: number) => {
    list.current?.children[index]?.scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <div
      ref={box}
      className={`relative ${className ?? ''}`}
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget)) close()
      }}
    >
      <TextField
        label={label}
        value={term ?? chosen?.label ?? ''}
        onChange={(event) => {
          setTerm(event.target.value)
          setMarked(event.target.value.trim() === '' ? -1 : 0)
          setOpen(true)
        }}
        onFocus={(event) => {
          event.currentTarget.select()
          openAt()
        }}
        onClick={() => {
          if (!open) openAt()
        }}
        onKeyDown={(event) => {
          onKeyDown(event)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') showMarked(active)
        }}
        placeholder={placeholder}
        disabled={disabled}
        tooltip={tooltip}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        icon={<Search size={15} />}
      />

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={placeAtField}
            data-choice-list
            className="fixed z-[60] flex max-h-[var(--lookup-room,17.5rem)] min-w-[16rem] flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card"
          >
            <p aria-live="polite" className="sr-only">
              {shown.length === 0 ? 'Kein Treffer' : `${shown.length} Treffer`}
            </p>
            {shown.length === 0 ? (
              <p className="px-3 py-3 text-body text-text-secondary">
                {term === null || term.trim() === ''
                  ? emptyText
                  : `Für «${term.trim()}» gibt es keinen Treffer.`}
              </p>
            ) : (
              <ul
                ref={list}
                role="listbox"
                id={listId}
                aria-label={label}
                className="max-h-[16.5rem] min-h-0 overflow-y-auto py-1"
              >
                {shown.map((choice, index) => (
                  <li
                    key={choice.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    // Keeps the focus in the field, so the click is not swallowed by the blur.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => take(choice)}
                    className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-body ${
                      index === active ? 'bg-sunken' : ''
                    } ${choice.quiet ? 'text-text-secondary' : 'text-text-primary'}`}
                  >
                    <span className="min-w-0 flex-1 truncate" title={choice.label}>
                      <MarkedText text={choice.label} term={term ?? ''} />
                    </span>
                    {choice.detail && (
                      <span className="shrink-0 text-small text-text-tertiary">
                        <MarkedText text={choice.detail} term={term ?? ''} />
                      </span>
                    )}
                    {choice.value === value && (
                      <Check size={14} aria-hidden className="shrink-0 self-center text-accent-text" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
