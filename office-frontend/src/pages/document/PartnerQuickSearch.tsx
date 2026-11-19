import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Spinner } from '../../components/Spinner'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { matchParts } from '../../lib/highlight'
import { nextIndex } from '../../lib/keyboardList'
import { hitCountText, type CustomerHit, type CustomerSource } from './partnerSearch'

/** How long the field has to stand still before the search goes out. */
const DEBOUNCE = 200

/**
 * The type-ahead that picks the customer a document is written for.
 *
 * <p>Searching happens on the server, over number and name at once, and only after the field
 * has stood still. The dropdown it replaces loaded the first two hundred customers on opening
 * the mask: with fifty thousand of them that is both slow and wrong, because the customer
 * being looked for is probably not among the first two hundred by name.
 *
 * <p>The field is a combobox in the sense of ARIA: the arrow keys move the mark through the
 * list without the focus ever leaving the field, and Enter takes what is marked.
 *
 * <p>Where the hits come from is the caller's choice: a document asks the partner module
 * (`partnerCustomerSource`), a project asks the project module, so maintaining projects needs
 * no partner right (backend ADR-0130).
 *
 * @param source where the hits come from
 * @param term what is in the field, held by the mask
 * @param onTerm called on every keystroke
 * @param chosen true while the field names a customer that was taken over, so the list stays
 *               shut
 * @param onChoose takes a hit over
 * @param inputRef lets the mask put the focus here when it opens
 * @param chosenHint what the field says under a customer that was taken over
 * @param emptyHint what the list says when the tenant has no active customer at all
 * @param disabled shows the field without letting anyone change it
 */
export function PartnerQuickSearch<T extends CustomerHit>({
  source,
  term,
  onTerm,
  chosen,
  onChoose,
  inputRef,
  chosenHint = 'Belegart, Sprache, Währung und Zahlungskondition kommen von diesem Kunden. Tippen sucht einen anderen.',
  emptyHint = 'Es gibt noch keinen aktiven Kunden. Der Beleg braucht einen.',
  disabled = false,
}: {
  source: CustomerSource<T>
  term: string
  onTerm: (term: string) => void
  chosen: boolean
  onChoose: (partner: T) => void
  inputRef?: Ref<HTMLInputElement>
  chosenHint?: string
  emptyHint?: string
  disabled?: boolean
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [marked, setMarked] = useState(0)
  const [wasChosen, setWasChosen] = useState(chosen)
  // Adjusted while rendering rather than in an effect: the list follows the customer, and the
  // customer is decided outside. Taking one shuts the list.
  if (wasChosen !== chosen) {
    setWasChosen(chosen)
    setOpen(!chosen)
  }
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const settled = useDebouncedValue(term.trim(), DEBOUNCE)
  const hits = useQuery({
    queryKey: [...source.key, settled],
    queryFn: () => source.load(settled),
    enabled: open && !disabled,
    // What was found last stays on screen while the next answer is on its way. Emptying the
    // list on every keystroke would make it flicker exactly while it is being read.
    placeholderData: keepPreviousData,
  })

  // A failed refetch keeps the rows of the last answer in the cache. They must not be offered
  // any more: the box then shows an error, and a hit taken out of it belongs to nothing.
  const found = hits.isError ? [] : (hits.data ?? [])
  // The list can grow shorter between two answers while the mark stays where it was.
  const active = Math.min(marked, found.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  // True only while the rows on screen are the answer to what is in the field. Everything
  // else means the list shows the hits of the previous term, and Enter would put the wrong
  // customer on the document.
  const answersTheTerm = settled === term.trim() && !hits.isFetching && !hits.isError
  const showsList = open && !hits.isPending && !hits.isError && found.length > 0

  // The marked hit has to be visible; with twenty of them the list scrolls.
  useEffect(() => {
    if (!showsList || active < 0) return
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [showsList, active])

  const take = (partner: T) => {
    setOpen(false)
    onChoose(partner)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // While a customer is taken over the field carries their name, not a search term.
      // Typing is the way back into the list, as the hint says.
      if (chosen) return
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setMarked(nextIndex(active, event.key === 'ArrowDown' ? 1 : -1, found.length))
      return
    }
    if (event.key !== 'Enter' || !open || !answersTheTerm) return
    const hit = found[active]
    if (!hit) return
    // Held back from the mask: while the list is open, Enter belongs to the list and not to a
    // draft that has no customer yet.
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
        label="Kunde"
        value={term}
        onChange={(event) => {
          onTerm(event.target.value)
          setMarked(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(!chosen && !disabled)}
        disabled={disabled}
        onKeyDown={onKeyDown}
        placeholder="Nummer oder Name"
        // The column searched over is 200 characters wide, so nothing longer can ever match.
        maxLength={200}
        icon={<Search size={15} />}
        action={hits.isFetching ? <Spinner size={14} label="Wird gesucht" /> : undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={showsList}
        aria-controls={showsList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showsList && active >= 0 ? optionId(active) : undefined}
        hint={disabled ? undefined : chosen ? chosenHint : 'Pfeiltasten wählen, Enter übernimmt.'}
      />

      {open && !disabled && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card">
          {/* Mounted for as long as the box is open, with changing text. A region that is
              inserted together with its text is not a change a screen reader announces. */}
          <p aria-live="polite" className="sr-only">
            {hitCountText(hits.isPending, hits.isError, found.length)}
          </p>

          {hits.isPending ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-text-secondary">
              <Spinner size={14} label="Kunden werden durchsucht" />
              Kunden werden durchsucht ...
            </p>
          ) : hits.isError ? (
            <p role="alert" className="px-3 py-3 text-[13px] text-danger">
              Die Kunden konnten nicht gelesen werden.
            </p>
          ) : found.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-text-secondary">
              {settled === '' ? emptyHint : `Für «${settled}» gibt es keinen Treffer.`}
            </p>
          ) : (
            <ul
              ref={list}
              role="listbox"
              id={listId}
              aria-label="Kunden"
              className="max-h-[240px] overflow-y-auto py-1"
            >
              {found.map((partner, index) => (
                <li
                  key={partner.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  // Keeps the focus in the field, so the click is not swallowed by the blur.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => take(partner)}
                  className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${
                    index === active ? 'bg-sunken' : ''
                  }`}
                >
                  <span className="w-[86px] shrink-0 truncate font-mono text-[12px] text-text-tertiary">
                    <Marked text={partner.partnerNumber ?? '-'} term={settled} />
                  </span>
                  <span className="truncate text-[13px] text-text-primary">
                    <Marked text={partner.name} term={settled} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}



/** A text with the part the search term matched set off from the rest. */
function Marked({ text, term }: { text: string; term: string }) {
  return (
    <>
      {matchParts(text, term).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-[2px] bg-highlight text-text-primary">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
