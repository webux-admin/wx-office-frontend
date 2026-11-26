import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { matchParts } from '../lib/highlight'
import { nextIndex } from '../lib/keyboardList'
import { Spinner } from './Spinner'
import { TextField } from './TextField'
import { useDebouncedValue } from './useDebouncedValue'
import { useFloatingList } from './useFloatingList'

/** How long the field has to stand still before the search goes out. */
const DEBOUNCE = 200


/**
 * A field that searches as it is typed into and takes one hit over: a combobox in the sense of
 * ARIA, with the hits on the server.
 *
 * <p>The arrow keys move the mark without the focus leaving the field, Enter takes what is
 * marked, a click does the same, and Escape shuts an open list — marked as handled, so the
 * mask around does not read the same press as «cancel».
 *
 * <p><b>An empty field marks nothing.</b> Its list opens with the first hits for browsing, and
 * Enter there goes on to the form: in a field that may stay empty, Enter means «done», not
 * «take the first hit». A typed term marks its first hit, so a word and Enter take it.
 *
 * <p>Typing gives a chosen hit up — the caller decides what that means, through `onTerm`. A
 * chosen value is selected when the field takes the focus, so typing replaces it.
 *
 * <p><b>The list floats above the page</b>, under the field or above it where there is more room,
 * and follows it when something scrolls. Inside the box that holds the field it would be cut off
 * by a dialog, whose body scrolls, after a few rows (#134).
 */
export function LookupField<T>({
  label,
  term,
  onTerm,
  chosen,
  onChoose,
  queryKey,
  load,
  keyOf,
  renderHit,
  listLabel,
  emptyText,
  failureText,
  placeholder,
  tooltip,
  error,
  disabled = false,
  inputRef,
  maxLength = 200,
}: {
  label: string
  /** What stands in the field, held by the caller. */
  term: string
  /** Called on every keystroke. */
  onTerm: (term: string) => void
  /** True while the field names a hit that was taken over, so the list stays shut. */
  chosen: boolean
  onChoose: (hit: T) => void
  /** Cache key the settled term is appended to. */
  queryKey: readonly unknown[]
  /** Asks for the hits of one term. */
  load: (term: string) => Promise<T[]>
  /** Tells the hits apart; the same key must not stand twice in one answer. */
  keyOf: (hit: T) => string | number
  /** One row of the list; gets the settled term so the row can mark what it matched. */
  renderHit: (hit: T, term: string) => ReactNode
  /** What the list is announced as, for example «Leistungen». */
  listLabel: string
  /** What the list says when there is nothing at all to offer for an empty field. */
  emptyText: string
  /** What the list says when the hits could not be read. */
  failureText: string
  placeholder?: string
  /** See {@link TextField}. */
  tooltip?: ReactNode
  /** The message for this field, drawn under it. */
  error?: string
  disabled?: boolean
  /** Lets the caller put the focus here. */
  inputRef?: Ref<HTMLInputElement>
  /** As wide as the columns searched over; nothing longer can match. */
  maxLength?: number
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [marked, setMarked] = useState(-1)
  const [wasChosen, setWasChosen] = useState(chosen)
  // Adjusted while rendering rather than in an effect: the hit is decided outside, and taking
  // one shuts the list. Giving one up from outside — a line that is emptied — opens nothing.
  if (wasChosen !== chosen) {
    setWasChosen(chosen)
    if (chosen) setOpen(false)
  }
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const settled = useDebouncedValue(term.trim(), DEBOUNCE)
  const hits = useQuery({
    queryKey: [...queryKey, settled],
    queryFn: () => load(settled),
    enabled: open && !disabled,
    // What was found last stays on screen while the next answer is on its way. Emptying the
    // list on every keystroke would make it flicker exactly while it is being read.
    placeholderData: keepPreviousData,
  })

  // A failed refetch keeps the rows of the last answer in the cache; they must not be offered.
  const found = hits.isError ? [] : (hits.data ?? [])
  // The list can grow shorter between two answers while the mark stays where it was.
  const active = marked < 0 ? -1 : Math.min(marked, found.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  // True only while the rows on screen answer what is in the field. Otherwise Enter would take
  // a hit of the term before.
  const answersTheTerm = settled === term.trim() && !hits.isFetching && !hits.isError
  const showsList = open && !disabled && !hits.isPending && !hits.isError && found.length > 0

  // The marked hit has to be visible; with twenty of them the list scrolls.
  useEffect(() => {
    if (!showsList || active < 0) return
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [showsList, active])

  const placeAtField = useFloatingList(box)

  const take = (hit: T) => {
    setOpen(false)
    setMarked(-1)
    onChoose(hit)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // While a hit is taken over the field carries its name, not a search term. Typing is the
      // way back into the list.
      if (chosen) return
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setMarked(nextIndex(active, event.key === 'ArrowDown' ? 1 : -1, found.length))
      return
    }
    if (event.key !== 'Enter' || !open || !answersTheTerm || active < 0) return
    const hit = found[active]
    if (hit === undefined) return
    // Held back from the form: while a hit is marked, Enter belongs to the list.
    event.preventDefault()
    event.stopPropagation()
    take(hit)
  }

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <TextField
        ref={inputRef}
        label={label}
        value={term}
        onChange={(event) => {
          onTerm(event.target.value)
          setMarked(event.target.value.trim() === '' ? -1 : 0)
          setOpen(true)
        }}
        onFocus={(event) => {
          if (chosen) event.currentTarget.select()
          setOpen(!chosen && !disabled)
        }}
        disabled={disabled}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        icon={<Search size={15} />}
        action={hits.isFetching && open ? <Spinner size={14} label="Wird gesucht" /> : undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={showsList}
        aria-controls={showsList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showsList && active >= 0 ? optionId(active) : undefined}
        tooltip={tooltip}
        error={error}
      />

      {open &&
        !disabled &&
        // Into the body, over every layer — a dialog is z-50 — like the bubble of a tooltip.
        createPortal(
          <div
            ref={placeAtField}
            data-lookup-list
            className="fixed z-[60] flex max-h-[var(--lookup-room,17.5rem)] min-w-[16rem] flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card"
          >
            {/* Mounted for as long as the box is open, with changing text. A region that is
                inserted together with its text is not a change a screen reader announces. */}
            <p aria-live="polite" className="sr-only">
              {hits.isPending || hits.isError
                ? ''
                : found.length === 0
                  ? 'Kein Treffer'
                  : `${found.length} Treffer`}
            </p>

            {hits.isPending ? (
              <p className="flex items-center gap-2 px-3 py-3 text-body text-text-secondary">
                <Spinner size={14} label="Wird gesucht" />
                Wird gesucht ...
              </p>
            ) : hits.isError ? (
              <p role="alert" className="px-3 py-3 text-body text-danger">
                {failureText}
              </p>
            ) : found.length === 0 ? (
              <p className="px-3 py-3 text-body text-text-secondary">
                {settled === '' ? emptyText : `Für «${settled}» gibt es keinen Treffer.`}
              </p>
            ) : (
              <ul
                ref={list}
                role="listbox"
                id={listId}
                aria-label={listLabel}
                // Eight hits and half of the ninth, so the list shows it goes on before it scrolls;
                // less where the screen ends sooner.
                className="max-h-[16.5rem] min-h-0 overflow-y-auto py-1"
              >
                {found.map((hit, index) => (
                  <li
                    key={keyOf(hit)}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    // Keeps the focus in the field, so the click is not swallowed by the blur.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => take(hit)}
                    className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${
                      index === active ? 'bg-sunken' : ''
                    }`}
                  >
                    {renderHit(hit, settled)}
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


/** A text with the part the search term matched set off from the rest. */
export function MarkedText({ text, term }: { text: string; term: string }) {
  return (
    <>
      {matchParts(text, term).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-[0.125rem] bg-highlight text-text-primary">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
