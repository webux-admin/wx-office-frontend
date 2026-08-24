import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { SelectField } from '../../components/SelectField'
import { useCatalogue } from '../../masterdata/useMasterData'
import { api } from '../../lib/api'
import { toIsoDate } from '../../lib/format'
import { labelForCode } from '../../lib/masterData'
import {
  manualReasonsFor,
  stockBalanceKey,
  stockBalancesUrl,
  stockMovementsUrl,
  stockTransfersUrl,
} from '../../lib/inventory'
import { listQuery } from '../../lib/paging'
import type {
  MovementReason,
  Page,
  Product,
  StockBalance,
  StockBooking,
  StockLocation,
} from '../../lib/types'
import {
  applyKind,
  acceptQuantity,
  canSubmit,
  emptyBookStockForm,
  firstBookingComplaint,
  previewLines,
  productLabel,
  shortfallWarning,
  showsLocationFields,
  toBookPayload,
  toTransferPayload,
  unknownBarcodeMessage,
  type BookingKind,
  type BookStockForm,
} from './bookStockForm'
import { StockProductSearch } from './StockProductSearch'

/** What the three buttons at the top of the dialog say. */
const KINDS: { id: BookingKind; label: string }[] = [
  { id: 'IN', label: 'Zugang' },
  { id: 'OUT', label: 'Abgang' },
  { id: 'TRANSFER', label: 'Umlagerung' },
]

/**
 * «Bestand buchen»: a receipt, an issue or a move between two locations.
 *
 * <p>Until there is a purchase module this is the only way goods get into the stock, so it is
 * built as an everyday tool: the focus lands in the product field, a number or a scanned code
 * is enough, and Enter takes the hit.
 *
 * <p>The quantity is always positive — a typed minus is not accepted at all. What the booking
 * does to the stock stands under the fields as «Hauptlager: 12 → 20», which is the one chance
 * to see a mistake before it becomes unchangeable.
 */
export function BookStockDialog({
  open,
  onClose,
  tenantId,
  locations,
  product,
  currency = 'CHF',
}: {
  open: boolean
  onClose: () => void
  tenantId: number
  /** The active locations of the tenant. One of them is preselected. */
  locations: StockLocation[]
  /** Filled in when the dialog is opened from a product; the field then starts taken over. */
  product?: Product
  /** The tenant's currency, used as the default for a cost. */
  currency?: string
}) {
  const queryClient = useQueryClient()
  const productField = useRef<HTMLInputElement>(null)
  // A double click must not book twice: the second press finds the ref already set and is
  // dropped, the same guard the document lines use.
  const sent = useRef(false)

  const [typed, setForm] = useState<BookStockForm>(() => start(locations, product, currency))
  const [complaint, setComplaint] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [confirmedShortfall, setConfirmedShortfall] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)

  // Adjusted while rendering rather than in an effect: an effect would draw the old values
  // for one frame, and the preview line would then say something about the booking before.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(start(locations, product, currency))
      setComplaint(null)
      setScanMessage(null)
      setConfirmedShortfall(false)
    }
  }

  // The guard against a double click is released when the box opens, not while it renders.
  useEffect(() => {
    if (open) sent.current = false
  }, [open])

  // The location list is a request of its own and may arrive after the dialog opened, so the
  // preselection is derived rather than written into the form. Choosing one fills the field
  // and takes over from here.
  const form: BookStockForm =
    typed.locationId === '' && locations.length > 0
      ? { ...typed, locationId: `${defaultLocationOf(locations)}` }
      : typed

  const balances = useQuery({
    queryKey: stockBalanceKey(tenantId, form.product?.id ?? 0),
    queryFn: () =>
      api.get<StockBalance[]>(
        `${stockBalancesUrl(tenantId)}?${listQuery({ productId: form.product?.id })}`,
      ),
    enabled: open && form.product !== null,
  })

  const rows = balances.data ?? []
  const preview = previewLines(form, rows, locations)
  const warning = shortfallWarning(form, rows, locations)

  const book = useMutation({
    mutationFn: () =>
      form.kind === 'TRANSFER'
        ? api.post<StockBooking>(stockTransfersUrl(tenantId), toTransferPayload(form))
        : api.post<StockBooking>(stockMovementsUrl(tenantId), toBookPayload(form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-movements-latest', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-balances', tenantId] })
      sent.current = false
      onClose()
    },
    onError: () => {
      sent.current = false
    },
  })

  /** Looks a scanned or typed bar code up and takes the article over, or says it found none. */
  const lookUp = useMutation({
    mutationFn: (code: string) =>
      api.get<Page<Product>>(
        `/api/tenants/${tenantId}/products?${listQuery({
          search: code,
          activeOnly: true,
          stockManaged: true,
          size: 2,
        })}`,
      ),
    onSuccess: (page, code) => {
      const hit = page.content[0]
      if (hit === undefined) {
        setScanMessage(unknownBarcodeMessage(code))
        setForm((current) => ({ ...current, product: null, productTerm: code }))
        return
      }
      setScanMessage(null)
      setForm((current) => ({ ...current, product: hit, productTerm: productLabel(hit) }))
    },
  })

  const change = (fields: Partial<BookStockForm>) => setForm((current) => ({ ...current, ...fields }))

  const submit = () => {
    if (sent.current || book.isPending) return
    const found = firstBookingComplaint(form)
    setComplaint(found)
    if (found !== null) return
    if (warning !== null && !confirmedShortfall) {
      setConfirmedShortfall(true)
      return
    }
    sent.current = true
    book.mutate()
  }

  const chooseKind = (kind: BookingKind) => {
    setForm((current) => applyKind(current, kind))
    setConfirmedShortfall(false)
  }

  const withLocations = showsLocationFields(locations) || form.kind === 'TRANSFER'
  const message = complaint ?? (book.error instanceof Error ? book.error.message : null)
  const label = warning !== null && confirmedShortfall ? 'Trotzdem buchen' : 'Buchen'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Bestand buchen"
      description="Bestand entsteht nur aus Bewegungen. Eine gebuchte Zeile lässt sich nicht ändern."
      wide
      initialFocus={productField}
      onSubmit={book.isPending ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={book.isPending} disabled={!canSubmit(form)} shortcut>
            {label}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {message !== null && <ErrorNotice error={new Error(message)} />}

        <div role="group" aria-label="Vorgang" className="flex gap-1 rounded-[var(--radius-md)] bg-sunken p-1">
          {KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              aria-pressed={form.kind === kind.id}
              onClick={() => chooseKind(kind.id)}
              className={`flex-1 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] transition-colors ${
                form.kind === kind.id
                  ? 'bg-surface font-medium text-text-primary shadow-card'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {kind.label}
            </button>
          ))}
        </div>

        {form.kind !== 'TRANSFER' && (
          <ReasonSelect
            tenantId={tenantId}
            direction={form.kind}
            value={form.reason}
            onChange={(reason) => change({ reason })}
          />
        )}

        <StockProductSearch
          tenantId={tenantId}
          term={form.productTerm}
          onTerm={(term) => {
            setScanMessage(null)
            change({ productTerm: term, product: null })
          }}
          chosen={form.product !== null}
          onChoose={(chosen) =>
            change({ product: chosen, productTerm: productLabel(chosen) })
          }
          onScan={(code) => lookUp.mutate(code)}
          inputRef={productField}
        />
        {scanMessage !== null && (
          <p role="status" className="-mt-2 text-[12px] text-warning">
            {scanMessage}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Menge"
            value={form.quantity}
            onChange={(event) => change({ quantity: acceptQuantity(event.target.value) })}
            inputMode="decimal"
            numeric
            hint="Immer positiv. Ob sie zu- oder abgeht, sagt der Vorgang."
          />

          {withLocations && (
            <SelectField
              label={form.kind === 'TRANSFER' ? 'Von' : 'Lagerort'}
              value={form.locationId}
              onChange={(event) => {
                setConfirmedShortfall(false)
                change({ locationId: event.target.value })
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={`${location.id}`}>
                  {location.code} · {location.name}
                </option>
              ))}
            </SelectField>
          )}

          {form.kind === 'TRANSFER' && (
            <SelectField
              label="Nach"
              value={form.toLocationId}
              onChange={(event) => change({ toLocationId: event.target.value })}
              invalid={form.toLocationId !== '' && form.toLocationId === form.locationId}
              hint={
                form.toLocationId !== '' && form.toLocationId === form.locationId
                  ? 'Quelle und Ziel müssen verschieden sein.'
                  : undefined
              }
            >
              <option value="">Ziel wählen</option>
              {locations.map((location) => (
                <option key={location.id} value={`${location.id}`}>
                  {location.code} · {location.name}
                </option>
              ))}
            </SelectField>
          )}

          {form.kind === 'IN' && (
            <>
              <TextField
                label="Einstandspreis"
                value={form.unitCost}
                onChange={(event) => change({ unitCost: event.target.value })}
                inputMode="decimal"
                numeric
                hint="Für das Inventar. Lässt sich später nicht ergänzen."
              />
              <TextField
                label="Währung"
                value={form.unitCostCurrency}
                onChange={(event) =>
                  change({ unitCostCurrency: event.target.value.toUpperCase() })
                }
                maxLength={3}
              />
            </>
          )}

          <TextField
            label="Buchungsdatum"
            type="date"
            value={form.bookedOn}
            max={toIsoDate()}
            onChange={(event) => change({ bookedOn: event.target.value })}
            hint="Rückdatieren ist erlaubt, in die Zukunft buchen nicht."
          />

          <TextField
            label="Bemerkung"
            value={form.note}
            onChange={(event) => change({ note: event.target.value })}
            maxLength={200}
          />
        </div>

        {preview.length > 0 && (
          <div
            aria-live="polite"
            className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">Vorschau</p>
            {preview.map((line) => (
              <p key={line} className="mt-0.5 font-mono text-[13px] text-text-primary">
                {line}
              </p>
            ))}
          </div>
        )}

        {warning !== null && (
          <WarningNotice>
            {warning} Der Lagerort lässt das zu — buchen Sie trotzdem, wenn der Zugang noch
            nachgetragen wird.
          </WarningNotice>
        )}
      </div>
    </Dialog>
  )
}

/**
 * The reason of a hand booking, narrowed to what fits the direction.
 *
 * <p>Not a {@link CatalogueSelect}: that one offers everything the catalogue holds, and four
 * of the eleven reasons belong to an operation of its own. Offering them here would put a
 * refusal one click away — the backend turns them down too.
 */
function ReasonSelect({
  tenantId,
  direction,
  value,
  onChange,
}: {
  tenantId: number
  direction: 'IN' | 'OUT'
  value: MovementReason
  onChange: (reason: MovementReason) => void
}) {
  const entries = useCatalogue(tenantId, 'movement-reason')
  const allowed = manualReasonsFor(direction)

  return (
    <SelectField
      label="Grund"
      value={value}
      onChange={(event) => onChange(event.target.value as MovementReason)}
    >
      {allowed.map((code) => (
        <option key={code} value={code}>
          {labelForCode(entries, code)}
        </option>
      ))}
    </SelectField>
  )
}

/**
 * The dialog as it opens.
 *
 * @param locations the active locations, for the preselected one
 * @param product the product it was opened from, if any
 * @param currency the tenant's currency
 * @returns the form
 */
function start(
  locations: StockLocation[],
  product: Product | undefined,
  currency: string,
): BookStockForm {
  const empty = emptyBookStockForm(toIsoDate(), currency)
  return {
    ...empty,
    locationId: locations.length === 0 ? '' : `${defaultLocationOf(locations)}`,
    product: product ?? null,
    productTerm: productLabel(product ?? null),
  }
}

/**
 * The location a booking falls back to.
 *
 * @param locations the active locations
 * @returns the id of the default one, or of the first where none is marked
 */
function defaultLocationOf(locations: StockLocation[]): number {
  const marked = locations.find((location) => location.defaultLocation === true)
  return (marked ?? locations[0])?.id ?? 0
}
