import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../../components/Spinner'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { api } from '../../lib/api'
import { matchParts } from '../../lib/highlight'
import { nextIndex } from '../../lib/keyboardList'
import type { OriginState } from '../../lib/origin'
import { listQuery } from '../../lib/paging'
import type { Page, Product, VatCategory } from '../../lib/types'
import { productMeta } from './productInfo'

/**
 * Hits shown at a time.
 *
 * <p>Twenty, not the whole catalogue: this list is read, not scrolled. Whoever needs more is
 * better served by another word in the field, and the way into the product mask is one line
 * below the list.
 */
const HITS = 20

/** How long the field has to stand still before the search goes out. */
const DEBOUNCE = 200

/**
 * The type-ahead a position starts with: a field, and the products it matches under it.
 *
 * <p>Searching happens on the server, over number and name at once, and only after the field
 * has stood still — the alternative, holding the whole catalogue in the browser and filtering
 * it, stops working at the size where a catalogue needs a search at all.
 *
 * <p>The field is a combobox in the sense of ARIA: the arrow keys move the mark through the
 * list without the focus ever leaving the field, and Enter takes what is marked. Escape is
 * deliberately not caught here, so it keeps closing the dialog.
 */
export function ProductQuickSearch({
  tenantId,
  term,
  onTerm,
  chosen,
  onChoose,
  vatOf,
  back,
  inputRef,
}: {
  tenantId: number
  /** What is in the field. Held by the dialog, which clears it for the next position. */
  term: string
  /** Called on every keystroke; a keystroke also drops the product chosen so far. */
  onTerm: (term: string) => void
  /** True while the field names a product that was taken over, so the list stays shut. */
  chosen: boolean
  /**
   * Takes a hit over. `andAdd` is true where the user asked for it with Strg+Enter, which
   * promises to add the position and keep the dialog open for the next one.
   */
  onChoose: (product: Product, andAdd: boolean) => void
  /** The VAT rate of a hit on the day of supply, or the treatment it falls under. */
  vatOf: (category: VatCategory | undefined) => string | undefined
  /** Where the way into the product mask returns from, so the document is one click away. */
  back: OriginState
  /** Lets the dialog put the focus back here after a position was added. */
  inputRef?: Ref<HTMLInputElement>
}) {
  const listId = useId()
  const [open, setOpen] = useState(!chosen)
  const [marked, setMarked] = useState(0)
  const [wasChosen, setWasChosen] = useState(chosen)
  // Adjusted while rendering rather than in an effect: the list follows the product, and the
  // product is decided outside. Taking one shuts the list; giving one up — which is what the
  // dialog does after "Hinzufügen und weiter" — opens it again for the next position.
  if (wasChosen !== chosen) {
    setWasChosen(chosen)
    setOpen(!chosen)
  }
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const settled = useDebouncedValue(term.trim(), DEBOUNCE)
  const query = listQuery({ search: settled, activeOnly: true, size: HITS, sort: 'name,asc' })
  const hits = useQuery({
    queryKey: ['products', tenantId, query],
    queryFn: () => api.get<Page<Product>>(`/api/tenants/${tenantId}/products?${query}`),
    enabled: open,
    // What was found last stays on screen while the next answer is on its way. Emptying the
    // list on every keystroke would make it flicker exactly while it is being read.
    placeholderData: keepPreviousData,
  })

  // A failed refetch keeps the rows of the last answer in the cache. They must not be offered
  // any more: the box then shows an error, and a hit taken out of it belongs to nothing.
  const found = hits.isError ? [] : (hits.data?.content ?? [])
  // The list can grow shorter between two answers while the mark stays where it was.
  const active = Math.min(marked, found.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  // True only while the rows on screen are the answer to what is in the field. Everything
  // else — the debounce still running, a request on its way, a refusal — means the list shows
  // the hits of the previous term, and Enter would put the wrong product on the document.
  const answersTheTerm = settled === term.trim() && !hits.isFetching && !hits.isError
  // What the field may claim about itself: an `aria-expanded` of true and an `aria-controls`
  // pointing at a listbox that is not in the DOM tells a screen reader about a list that does
  // not exist.
  const showsList = open && !hits.isPending && !hits.isError && found.length > 0

  // The marked hit has to be visible; with twenty of them the list scrolls.
  useEffect(() => {
    if (!showsList || active < 0) return
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [showsList, active])

  const take = (product: Product, andAdd = false) => {
    setOpen(false)
    onChoose(product, andAdd)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // While a product is taken over the field carries its label, not a search term.
      // Opening the list would search for "P-100 · Wartung" and report no hit for a product
      // that plainly exists. Typing is the way back into the catalogue, as the hint says.
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
    // Held back from the dialog: while the list is open, Enter belongs to the list and not to
    // a position that has no product yet. Strg+Enter is passed on as an intent instead, so
    // the shortcut adds the position rather than doing half of what it promises.
    event.preventDefault()
    event.stopPropagation()
    take(hit, event.ctrlKey || event.metaKey)
  }

  return (
    <div
      ref={box}
      className="relative"
      onBlur={(event) => {
        // Only where the focus leaves the whole block: the way into the product mask sits
        // inside it and would otherwise be gone before it was clicked.
        if (!box.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <TextField
        ref={inputRef}
        label="Produkt"
        value={term}
        onChange={(event) => {
          onTerm(event.target.value)
          setMarked(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(!chosen)}
        onKeyDown={onKeyDown}
        placeholder="Nummer oder Bezeichnung"
        // The column searched over is 140 characters wide, so nothing longer can ever match.
        // A pasted block of text would go out as a query string and come back as a 400, which
        // the box would then report as a broken catalogue.
        maxLength={140}
        icon={<Search size={15} />}
        action={hits.isFetching ? <Spinner size={14} label="Wird gesucht" /> : undefined}
        autoComplete="off"
        role="combobox"
        aria-expanded={showsList}
        aria-controls={showsList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showsList && active >= 0 ? optionId(active) : undefined}
        hint={
          chosen
            ? 'Tippen sucht ein anderes Produkt.'
            : 'Pfeiltasten wählen, Enter übernimmt.'
        }
      />

      {open && (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card">
          {/* Mounted for as long as the box is open, with changing text. A region that is
              inserted together with its text is not a change a screen reader announces —
              and the moment the count matters is exactly the one where it changes. */}
          <p aria-live="polite" className="sr-only">
            {countText(hits.isPending, hits.isError, found.length)}
          </p>

          {hits.isPending ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[13px] text-text-secondary">
              <Spinner size={14} label="Katalog wird durchsucht" />
              Katalog wird durchsucht ...
            </p>
          ) : hits.isError ? (
            <p role="alert" className="px-3 py-3 text-[13px] text-danger">
              Der Produktkatalog konnte nicht gelesen werden.
            </p>
          ) : found.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-text-secondary">
              {settled === ''
                ? 'Kein aktives Produkt im Katalog.'
                : `Für «${settled}» gibt es keinen Treffer.`}
            </p>
          ) : (
            <ul
              ref={list}
              role="listbox"
              id={listId}
              aria-label="Produkte"
              className="max-h-[240px] overflow-y-auto py-1"
            >
              {found.map((product, index) => (
                <li
                  key={product.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  // Keeps the focus in the field, so the click is not swallowed by the blur.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => take(product)}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${
                    index === active ? 'bg-sunken' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-[86px] shrink-0 truncate font-mono text-[12px] text-text-tertiary">
                      <Marked text={product.productNumber ?? '-'} term={settled} />
                    </span>
                    <span className="truncate text-[13px] text-text-primary">
                      <Marked text={product.name} term={settled} />
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-text-tertiary">
                    {productMeta(product, vatOf(product.vatCategory)).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line-subtle px-3 py-2">
            <Link
              to={{ pathname: '/produkte', search: searchOf(term) }}
              state={back}
              className="text-[12px] text-text-secondary underline-offset-2 transition-colors hover:text-accent-text hover:underline"
            >
              In der Produktmaske suchen
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * What the live region says about the open list.
 *
 * <p>The refusal is left out on purpose: it is announced by the `role="alert"` next to it,
 * and saying it twice is worse than saying it once.
 *
 * @param pending true while the first answer is still on its way
 * @param failed true where the catalogue could not be read
 * @param count how many hits are on screen
 * @returns the sentence to announce, empty where there is nothing to say yet
 */
function countText(pending: boolean, failed: boolean, count: number): string {
  if (pending || failed) return ''
  return count === 0 ? 'Kein Treffer' : `${count} Treffer`
}

/**
 * The query string the product list is opened with, so the term is not typed twice.
 *
 * @param term what is in the search field
 * @returns the query string including its question mark, empty for an empty field
 */
function searchOf(term: string): string {
  const trimmed = term.trim()
  return trimmed === '' ? '' : `?suche=${encodeURIComponent(trimmed)}`
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
