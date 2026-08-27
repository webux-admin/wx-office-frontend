import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { Spinner } from '../../components/Spinner'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { api } from '../../lib/api'
import {
  showsLocationChoice,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
  stocktakesUrl,
} from '../../lib/inventory'
import { nextIndex } from '../../lib/keyboardList'
import { listQuery } from '../../lib/paging'
import type { Page, Product, StockLocation, Stocktake, StocktakeScope } from '../../lib/types'

/** Hits shown at a time. This list is read, not scrolled. */
const HITS = 20

/** How long the product field has to stand still before the search goes out. */
const DEBOUNCE = 200

/**
 * Sets a count list up.
 *
 * <p>A dialog on the list and not a mask of its own: there are six fields, and a count is not
 * written but started. The lines are built when it is opened for counting, and the number is
 * drawn when it is booked (backend ADR-0070).
 *
 * <p>Two scopes. <b>Ganzer Lagerort</b> counts every stock row of the location and is the
 * everyday case. <b>Produktauswahl</b> counts the chosen articles only — the opening stock of a
 * new tenant, or a sample between two full counts. Several selections may stand open at one
 * location as long as their articles do not overlap; where they do, the backend names the list
 * that is in the way, and this dialog shows what it said rather than a sentence of its own.
 *
 * @param tenantId the tenant
 * @param open whether the dialog is on screen
 * @param onClose closes it without creating anything
 * @param onCreated called with the new list, so the caller can open it
 */
export function NewStocktakeDialog({
  tenantId,
  open,
  onClose,
  onCreated,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onCreated: (stocktake: Stocktake) => void
}) {
  const queryClient = useQueryClient()
  const [locationId, setLocationId] = useState('')
  const [scope, setScope] = useState<StocktakeScope>('ALL')
  const [picked, setPicked] = useState<Product[]>([])
  const [blindCount, setBlindCount] = useState(false)
  const [countingDate, setCountingDate] = useState(today())
  const [note, setNote] = useState('')

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
    enabled: open,
  })
  const active = locations.data ?? []
  // The rule of Frontend-ADR-0014: the field appears from two active locations on. With one
  // there is nothing to choose, and it is used silently.
  const showsLocations = showsLocationChoice(active)
  const chosen = locationId === '' ? active[0]?.id : Number(locationId)
  const selection = scope === 'SELECTION'

  const create = useMutation({
    mutationFn: () =>
      api.post<Stocktake>(stocktakesUrl(tenantId), {
        locationId: chosen,
        scope,
        // Left out for the whole location rather than sent empty: the backend ignores it
        // there, and an empty list next to `ALL` reads like a selection of nothing.
        productIds: selection ? picked.map((product) => product.id) : undefined,
        blindCount,
        countingDate,
        note: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: (stocktake) => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes', tenantId] })
      onCreated(stocktake)
    },
  })

  return (
    <Dialog
      open={open}
      title="Neue Inventur"
      description="Zählt einen Lagerort. Gebucht wird erst, wenn die Differenzen geprüft sind."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            busy={create.isPending}
            // A selection without an article is nothing to count. The backend refuses it as
            // well; this only spares the user the refusal.
            disabled={chosen === undefined || (selection && picked.length === 0)}
          >
            Anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {showsLocations && (
          <SelectField
            label="Lagerort"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            hint="Wer zwei Lager zählt, legt zwei Zähllisten an."
          >
            {active.map((location) => (
              <option key={location.id} value={`${location.id}`}>
                {stockLocationLabel(location)}
              </option>
            ))}
          </SelectField>
        )}

        <SelectField
          label="Umfang"
          value={scope}
          onChange={(event) => setScope(event.target.value as StocktakeScope)}
          hint="Eine Auswahl zählt nur die gewählten Produkte — für den Anfangsbestand oder eine Stichprobe."
        >
          <option value="ALL">Ganzer Lagerort</option>
          <option value="SELECTION">Produktauswahl</option>
        </SelectField>

        {selection && (
          <StocktakeProductPicker
            tenantId={tenantId}
            picked={picked}
            onPick={(product) => setPicked((current) => [...current, product])}
            onDrop={(productId) =>
              setPicked((current) => current.filter((product) => product.id !== productId))
            }
          />
        )}

        <TextField
          label="Zähldatum"
          type="date"
          value={countingDate}
          onChange={(event) => setCountingDate(event.target.value)}
          hint="Bestimmt das Geschäftsjahr der Buchung. Nicht in der Zukunft."
        />

        <CheckboxField
          label="Sollmenge verbergen"
          checked={blindCount}
          onChange={(event) => setBlindCount(event.target.checked)}
          hint="Bei einer Blindzählung sieht niemand beim Zählen, was erwartet wird."
        />

        <TextField
          label="Bemerkung"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Steht später im Protokoll."
        />

        {create.error !== null && <ErrorNotice error={create.error} />}
      </div>
    </Dialog>
  )
}

/**
 * The articles a count with the scope «Produktauswahl» covers: a type-ahead that takes one
 * after the other, and a chip for each of them.
 *
 * <p>Searching happens on the server, over number, name and bar code at once, and only over
 * stock managed articles — a service has no stock to count, and being refused afterwards would
 * be the same answer one click later. It is deliberately <b>not</b> narrowed to what lies at
 * the location: an article with nothing there is the case the scope exists for, and it becomes
 * a line with an expected quantity of zero (backend ADR-0070). The hint under the field says
 * so, so that picking one reads as meant rather than as a mistake.
 *
 * <p>The field is a combobox in the sense of ARIA, like the two type-aheads of the document and
 * the booking mask: the arrow keys move the mark without the focus ever leaving the field,
 * Enter takes what is marked, and Escape is left alone so it keeps closing the dialog. Taking an
 * article empties the field and keeps the focus, because the next one follows right after.
 *
 * @param tenantId the tenant
 * @param picked what was chosen so far, in the order it was chosen
 * @param onPick adds one article
 * @param onDrop takes one article out again
 */
function StocktakeProductPicker({
  tenantId,
  picked,
  onPick,
  onDrop,
}: {
  tenantId: number
  picked: readonly Product[]
  onPick: (product: Product) => void
  onDrop: (productId: number) => void
}) {
  const listId = useId()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [marked, setMarked] = useState(0)
  const box = useRef<HTMLDivElement>(null)

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
    enabled: open,
    // What was found last stays on screen while the next answer is on its way; emptying the
    // list on every keystroke would make it flicker exactly while it is being read.
    placeholderData: keepPreviousData,
  })

  // A failed refetch keeps the rows of the last answer in the cache; they must not be offered
  // any more. What is already picked is left out as well — it stands in a chip below.
  const taken = new Set(picked.map((product) => product.id))
  const found = (hits.isError ? [] : (hits.data?.content ?? [])).filter(
    (product) => !taken.has(product.id),
  )
  // The list can grow shorter between two answers while the mark stays where it was.
  const active = Math.min(marked, found.length - 1)
  const optionId = (index: number) => `${listId}-${index}`
  const showsList = open && !hits.isPending && !hits.isError && found.length > 0
  // True only while the rows on screen answer what is in the field. Anything else means Enter
  // would take an article that belongs to the term before.
  const answersTheTerm = settled === term.trim() && !hits.isFetching && !hits.isError

  const take = (product: Product) => {
    onPick(product)
    setTerm('')
    setMarked(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
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
    // the button that creates the count list.
    event.preventDefault()
    event.stopPropagation()
    take(hit)
  }

  return (
    <div
      ref={box}
      className="grid gap-2"
      onBlur={(event) => {
        // Only where the focus leaves the whole block: the hits sit inside it and would
        // otherwise be gone before they were clicked.
        if (!box.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <div className="relative">
        <TextField
          label="Produkte"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setMarked(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Nummer, Bezeichnung oder Strichcode"
          // The column searched over is 140 characters wide, so nothing longer can ever match.
          maxLength={140}
          icon={<Search size={15} />}
          action={hits.isFetching ? <Spinner size={14} label="Wird gesucht" /> : undefined}
          autoComplete="off"
          role="combobox"
          aria-expanded={showsList}
          aria-controls={showsList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showsList && active >= 0 ? optionId(active) : undefined}
          hint="Pfeiltasten wählen, Enter übernimmt. Mehrere Produkte nacheinander — auch solche ohne Bestand an diesem Lagerort, sie erhalten eine Zeile mit Soll 0."
        />

        {open && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-card">
            {/* Mounted for as long as the box is open, with changing text: a region inserted
                together with its text is no change a screen reader announces. */}
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
                      {product.productNumber ?? '-'}
                    </span>
                    <span className="truncate text-[13px] text-text-primary">
                      {product.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((product) => (
            <li
              key={product.id}
              className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-surface py-0.5 pl-2.5 pr-1 text-[12px] text-text-primary"
            >
              <span className="font-mono text-text-tertiary">
                {product.productNumber ?? '-'}
              </span>
              <span>{product.name}</span>
              <button
                type="button"
                onClick={() => onDrop(product.id)}
                aria-label={`${product.name} entfernen`}
                className="grid h-6 w-6 place-items-center rounded-[var(--radius-full)] text-text-tertiary transition-colors hover:text-danger"
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Today as `yyyy-MM-dd`, the shape a date field takes. */
function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
