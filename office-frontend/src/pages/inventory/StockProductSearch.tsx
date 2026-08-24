import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import { Spinner } from '../../components/Spinner'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { api } from '../../lib/api'
import { matchParts } from '../../lib/highlight'
import { nextIndex } from '../../lib/keyboardList'
import { listQuery } from '../../lib/paging'
import type { Page, Product } from '../../lib/types'

/** Hits shown at a time. This list is read, not scrolled. */
const HITS = 20

/** How long the field has to stand still before the search goes out. */
const DEBOUNCE = 200

/**
 * The product field of the booking dialog: a type-ahead over the articles that have a stock.
 *
 * <p>Filtered on the server with `stockManaged=true`, so an article nobody keeps a stock of
 * never appears — being refused afterwards would be the same answer, one click later.
 *
 * <p>The field is a combobox in the sense of ARIA: the arrow keys move the mark without the
 * focus leaving the field, Enter takes what is marked, and Escape is left alone so it keeps
 * closing the dialog. Next to it sits the camera, where the browser has one.
 */
export function StockProductSearch({
  tenantId,
  term,
  onTerm,
  chosen,
  onChoose,
  onScan,
  inputRef,
}: {
  tenantId: number
  /** What is in the field: a search term, or the label of the product taken over. */
  term: string
  /** Called on every keystroke; a keystroke also drops the product chosen so far. */
  onTerm: (term: string) => void
  /** True while the field names a product that was taken over, so the list stays shut. */
  chosen: boolean
  onChoose: (product: Product) => void
  /** Called with what the camera read, so the caller can look the code up. */
  onScan: (code: string) => void
  inputRef?: Ref<HTMLInputElement>
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [marked, setMarked] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const field = useRef<HTMLInputElement>(null)

  const settled = useDebouncedValue(term.trim(), DEBOUNCE)
  const query = listQuery({
    search: settled,
    activeOnly: true,
    stockManaged: true,
    size: HITS,
    sort: 'name,asc',
  })
  const hits = useQuery({
    queryKey: ['products', tenantId, query],
    queryFn: () => api.get<Page<Product>>(`/api/tenants/${tenantId}/products?${query}`),
    enabled: open && !chosen,
    placeholderData: keepPreviousData,
  })

  // A failed refetch keeps the rows of the last answer in the cache; they must not be offered.
  const found = hits.isError ? [] : (hits.data?.content ?? [])
  const active = Math.min(marked, found.length - 1)
  const optionId = (index: number) => `${listId}-${index}`
  const showsList = open && !chosen && !hits.isPending && !hits.isError && found.length > 0
  // True only while the rows on screen answer what is in the field. Anything else means Enter
  // would take a product that belongs to the term before.
  const answersTheTerm = settled === term.trim() && !hits.isFetching && !hits.isError

  useEffect(() => {
    if (!showsList || active < 0) return
    list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [showsList, active])

  const take = (product: Product) => {
    setOpen(false)
    onChoose(product)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (chosen) return
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setMarked(nextIndex(active, event.key === 'ArrowDown' ? 1 : -1, found.length))
      return
    }
    if (event.key !== 'Enter' || !open || chosen || !answersTheTerm) return
    const hit = found[active]
    if (!hit) return
    // Held back from the dialog: while the list is open, Enter belongs to the list.
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
      <div className="flex items-end gap-2">
        <TextField
          ref={mergeRefs(inputRef, field)}
          label="Produkt"
          value={term}
          onChange={(event) => {
            onTerm(event.target.value)
            setMarked(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(!chosen)}
          onKeyDown={onKeyDown}
          placeholder="Nummer, Bezeichnung oder Strichcode"
          maxLength={140}
          icon={<Search size={15} />}
          action={hits.isFetching ? <Spinner size={14} label="Wird gesucht" /> : undefined}
          autoComplete="off"
          role="combobox"
          aria-expanded={showsList}
          aria-controls={showsList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showsList && active >= 0 ? optionId(active) : undefined}
          className="flex-1"
          hint={chosen ? 'Tippen sucht ein anderes Produkt.' : 'Pfeiltasten wählen, Enter übernimmt.'}
        />
        <div className="pb-[22px]">
          <BarcodeScanner onScan={onScan} onClose={() => field.current?.focus()} />
        </div>
      </div>

      {open && !chosen && (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card">
          <p aria-live="polite" className="sr-only">
            {hits.isPending || hits.isError
              ? ''
              : found.length === 0
                ? 'Kein Treffer'
                : `${found.length} Treffer`}
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
                ? 'Kein lagergeführtes Produkt im Katalog.'
                : `Für «${settled}» gibt es kein lagergeführtes Produkt.`}
            </p>
          ) : (
            <ul
              ref={list}
              role="listbox"
              id={listId}
              aria-label="Lagergeführte Produkte"
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
                  className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 ${
                    index === active ? 'bg-sunken' : ''
                  }`}
                >
                  <span className="w-[86px] shrink-0 truncate font-mono text-[12px] text-text-tertiary">
                    <Marked text={product.productNumber ?? '-'} term={settled} />
                  </span>
                  <span className="truncate text-[13px] text-text-primary">
                    <Marked text={product.name} term={settled} />
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

/**
 * Lets the field be held by the caller and by this component at the same time.
 *
 * <p>The caller wants the focus after a position was booked; this component wants it back
 * after the camera closed.
 */
function mergeRefs(
  outer: Ref<HTMLInputElement> | undefined,
  inner: React.RefObject<HTMLInputElement | null>,
): Ref<HTMLInputElement> {
  return (element: HTMLInputElement | null) => {
    inner.current = element
    if (typeof outer === 'function') outer(element)
    else if (outer) (outer as React.RefObject<HTMLInputElement | null>).current = element
  }
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
