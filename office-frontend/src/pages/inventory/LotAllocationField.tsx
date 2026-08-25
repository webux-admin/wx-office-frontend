import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { WarningNotice } from '../../components/Notice'
import { api } from '../../lib/api'
import { formatQuantity, parseDecimal } from '../../lib/format'
import {
  expiryLabel,
  lotKindLabelPlural,
  lotKindOf,
  lotProposalKey,
  lotProposalUrl,
  productLotsKey,
  productLotsUrl,
  serialNumberProposalUrl,
} from '../../lib/inventory'
import { listQuery } from '../../lib/paging'
import type {
  LotAllocation,
  LotProposal,
  MovementDirection,
  Page,
  Product,
  Lot,
  SerialNumbers,
} from '../../lib/types'
import {
  addSerialNumber,
  addSerialNumbers,
  allocationAnnouncement,
  allocationSummary,
  emptyRow,
  LOT_NUMBER_MAX,
  lotComplaint,
  SERIAL_PROPOSAL_MAX,
  nextKey,
  openOf,
  proposalRows,
  receiptRows,
  toAllocations,
  uncoveredWarning,
  withNumber,
  withoutRow,
  withQuantity,
  type LotRow,
} from './lotAllocation'

/** How long a repeated number stays lit up before the list looks normal again. */
const HIGHLIGHT = 1500

/** Numbers offered when somebody picks serial numbers out of the stock. */
const PICKER_SIZE = 20

/**
 * Which numbers a booked quantity is made of.
 *
 * <p>The same field for both kinds, because a serial number is a lot of exactly one piece: a
 * batch is a line with a quantity, a serial number a chip that counts one. What differs is the
 * way in — a batch is typed, a serial number is scanned, generated or picked out of the stock.
 *
 * <p>The header carries the one invariant of the whole field: «Menge 5 · zugeordnet 3 ·
 * offen 2». While anything is open the caller keeps its save button disabled, and the reason
 * stands next to it before the click rather than as a complaint after it.
 *
 * <p>Nothing here decides whether a booking is allowed. The server owns the rules — that a
 * blocked lot cannot be given out, that a lot balance never goes below zero, that a serial
 * number already in stock cannot come in again — and answers them in German. This field only
 * keeps the obvious mistakes from travelling.
 */
export function LotAllocationField({
  tenantId,
  product,
  locationId,
  direction,
  quantity,
  onChange,
  allowWithoutNumber = true,
}: {
  tenantId: number
  /** The product being booked. Drawn only where it is tracked at all. */
  product: Product
  /** The location booked against, as the field holds it; the source of a transfer. */
  locationId: string
  /** Whether the goods come in or go out. A transfer asks with `OUT`, for its source. */
  direction: MovementDirection
  /** What is being booked, absent while the quantity field is empty. */
  quantity: number | null
  /** Called whenever the split changes, with what the booking should send. */
  onChange: (allocations: LotAllocation[]) => void
  /**
   * False where the caller cannot carry the stock without a number — a document position
   * freezes a number, and that stock has none. The row is then left out of the proposal
   * rather than offered and refused later (backend ADR-0069).
   */
  allowWithoutNumber?: boolean
}) {
  const kind = lotKindOf(product.tracking)
  const issuing = direction === 'OUT'

  const [rows, setRows] = useState<LotRow[]>([])
  const [scanned, setScanned] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [lit, setLit] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [picking, setPicking] = useState(false)
  const scanField = useRef<HTMLInputElement>(null)

  // What the rows were built for. A new answer for another quantity or another location
  // replaces them; typing in them does not.
  const [seeded, setSeeded] = useState('')

  const proposalQuery = useQuery({
    queryKey: lotProposalKey(tenantId, product.id, locationId, quantity ?? 0),
    queryFn: () =>
      api.get<LotProposal>(
        `${lotProposalUrl(tenantId, product.id)}?${listQuery({
          locationId,
          quantity: quantity ?? 0,
        })}`,
      ),
    enabled: issuing && locationId !== '' && quantity !== null && quantity > 0,
  })

  const signature = `${direction}|${product.id}|${locationId}|${quantity ?? ''}`

  // Adjusted while rendering rather than in an effect: an effect would draw the empty field
  // for one frame, and the summary line would say «offen 5» about a split that is already
  // filled in. The same pattern the booking dialog uses for its own reset.
  if (issuing && proposalQuery.data !== undefined && seeded !== signature) {
    setSeeded(signature)
    setRows(proposalRows(proposalQuery.data, allowWithoutNumber))
  }
  if (!issuing && kind === 'LOT' && seeded !== signature) {
    setSeeded(signature)
    // One delivery under one number is the normal case, so the single row carries the whole
    // quantity. A second row means somebody is splitting on purpose, and then nothing is
    // filled in for them any more.
    setRows((current) =>
      current.length > 1
        ? current
        : receiptRows(quantity).map((row) => ({
            ...row,
            lotNumber: current[0]?.lotNumber ?? '',
          })),
    )
  }
  if (!issuing && kind === 'SERIAL' && seeded !== signature) {
    setSeeded(signature)
  }

  // Reported through a ref rather than as a dependency: the caller builds its handler inline,
  // so a plain dependency would fire on every keystroke in the dialog above.
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  }, [onChange])
  const reported = useRef('')
  useEffect(() => {
    const allocations = toAllocations(rows)
    const written = JSON.stringify(allocations)
    if (written === reported.current) return
    reported.current = written
    report.current(allocations)
  }, [rows])

  useEffect(() => {
    if (lit === null) return
    const timer = window.setTimeout(() => setLit(null), HIGHLIGHT)
    return () => window.clearTimeout(timer)
  }, [lit])

  if (kind === undefined) return null

  const open = openOf(quantity, rows)
  const complaint = lotComplaint(quantity, rows, kind)
  const uncovered = issuing ? uncoveredWarning(proposalQuery.data) : null

  const take = (input: string) => {
    const added = addSerialNumber(rows, input)
    setRows(added.rows)
    setScanned('')
    if (added.duplicate !== null) {
      setLit(added.duplicate)
      setAnnouncement(`${input.trim()} ist bereits erfasst`)
      return
    }
    setAnnouncement(allocationAnnouncement(input.trim(), quantity, added.rows))
  }

  const onScanKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Held back from the dialog: Enter in this field takes a number, it does not book.
      event.preventDefault()
      event.stopPropagation()
      take(scanned)
      return
    }
    if (event.key === 'Escape' && scanned !== '') {
      // A filled field is emptied first; only a second Escape closes the dialog behind.
      event.stopPropagation()
      setScanned('')
      return
    }
    if (event.key === 'Backspace' && scanned === '' && rows.length > 0) {
      event.preventDefault()
      setRows(rows.slice(0, -1))
    }
  }

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
          {lotKindLabelPlural(kind)}
        </p>
        <p
          className={`font-mono text-[12px] tabular-nums ${
            open === 0 ? 'text-text-secondary' : 'text-warning'
          }`}
        >
          {allocationSummary(quantity, rows)}
        </p>
      </div>

      {/* Spoken rather than only drawn: whoever scans looks at the label in their hand. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {kind === 'SERIAL' ? (
        <SerialNumberChips
          rows={rows}
          lit={lit}
          scanned={scanned}
          scanField={scanField}
          onScanned={setScanned}
          onKeyDown={onScanKeyDown}
          onTake={take}
          onRemove={(key) => setRows(withoutRow(rows, key))}
        />
      ) : (
        <BatchRows
          tenantId={tenantId}
          product={product}
          rows={rows}
          issuing={issuing}
          onQuantity={(key, value) => setRows(withQuantity(rows, key, value))}
          onNumber={(key, value) => setRows(withNumber(rows, key, value))}
          onRemove={(key) => setRows(withoutRow(rows, key))}
          onAdd={() => setRows([...rows, emptyRow(nextKey(rows))])}
        />
      )}

      {kind === 'SERIAL' && !issuing && (
        <SerialGenerator
          tenantId={tenantId}
          product={product}
          open={generating}
          onOpen={setGenerating}
          missing={open > 0 ? open : 0}
          onNumbers={(numbers) => {
            const added = addSerialNumbers(rows, numbers)
            setRows(added.rows)
            setLit(added.duplicate)
            setAnnouncement(
              `${numbers.length} Nummern übernommen, ${formatQuantity(
                added.rows.length,
              )} von ${quantity === null ? '—' : formatQuantity(quantity)} zugeordnet`,
            )
          }}
        />
      )}

      {kind === 'SERIAL' && issuing && (
        <SerialPicker
          tenantId={tenantId}
          product={product}
          locationId={locationId}
          open={picking}
          onOpen={setPicking}
          onTake={take}
        />
      )}

      {issuing && kind === 'SERIAL' && (
        <LotFreeRow rows={rows} onQuantity={(key, value) => setRows(withQuantity(rows, key, value))} />
      )}

      {complaint !== null && (
        <p className="text-[12px] text-warning">{complaint}</p>
      )}

      {uncovered !== null && <WarningNotice>{uncovered}</WarningNotice>}

      {issuing && proposalQuery.isError && (
        <p role="alert" className="text-[12px] text-danger">
          {proposalQuery.error instanceof Error
            ? proposalQuery.error.message
            : `Die ${lotKindLabelPlural(kind)} konnten nicht gelesen werden.`}
        </p>
      )}
    </div>
  )
}

/**
 * The batch lines: one number, one quantity.
 *
 * <p>On the way out the numbers are read only — they are what lies at the location, and typing
 * one that is not there would only earn a refusal. On the way in they are typed, with the
 * numbers of the same product offered as a list: batch numbers come off the supplier's label
 * and are not ours to invent (backend ADR-0068).
 */
function BatchRows({
  tenantId,
  product,
  rows,
  issuing,
  onQuantity,
  onNumber,
  onRemove,
  onAdd,
}: {
  tenantId: number
  product: Product
  rows: LotRow[]
  issuing: boolean
  onQuantity: (key: string, value: string) => void
  onNumber: (key: string, value: string) => void
  onRemove: (key: string) => void
  onAdd: () => void
}) {
  const known = useKnownNumbers(tenantId, product, !issuing)

  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-text-secondary">
        {issuing
          ? 'Für diese Menge gibt es an diesem Lagerort keine Charge.'
          : 'Erfassen Sie die Chargennummer der Lieferung.'}
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
          {row.lotNumber === null ? (
            <p className="flex-1 basis-full text-[13px] text-text-secondary sm:basis-auto">
              Bestand ohne Chargennummer
              <span className="ml-2 font-mono text-[12px] text-text-tertiary">
                {formatQuantity(row.available ?? 0)}
              </span>
            </p>
          ) : issuing ? (
            <p className="flex-1 basis-full sm:basis-auto">
              <span
                className={`font-mono text-[13px] ${
                  row.expired ? 'text-text-tertiary' : 'text-text-primary'
                }`}
              >
                {row.lotNumber}
              </span>
              <span className="ml-2 text-[12px] text-text-tertiary">
                verfügbar {formatQuantity(row.available ?? 0)}
              </span>
              {expiryLabel(row) !== '' && (
                <span
                  className={`ml-2 text-[12px] ${row.expired ? 'text-danger' : 'text-text-tertiary'}`}
                >
                  {expiryLabel(row)}
                </span>
              )}
            </p>
          ) : (
            <TextField
              label="Chargennummer"
              value={row.lotNumber}
              onChange={(event) => onNumber(row.key, event.target.value)}
              maxLength={LOT_NUMBER_MAX}
              list={known.listId}
              autoComplete="off"
              className="basis-full sm:flex-1 sm:basis-auto"
            />
          )}

          <TextField
            label="Menge"
            value={row.quantity}
            onChange={(event) => onQuantity(row.key, event.target.value)}
            inputMode="decimal"
            numeric
            className="basis-full sm:w-[120px] sm:basis-auto"
          />

          {!issuing && rows.length > 1 && (
            <button
              type="button"
              onClick={() => onRemove(row.key)}
              aria-label={`Zeile ${row.lotNumber === '' ? 'ohne Nummer' : row.lotNumber} entfernen`}
              className="mb-px grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-line text-text-tertiary transition-colors hover:text-danger"
            >
              <X size={15} aria-hidden />
            </button>
          )}
        </div>
      ))}

      {known.list}

      {!issuing && (
        <div>
          <Button variant="secondary" onClick={onAdd}>
            <Plus size={15} aria-hidden />
            Weitere Charge
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The serial numbers as chips, in front of them the field the scanner types into.
 *
 * <p>The field keeps the focus through every scan: a hand scanner sends the number and an
 * Enter, and the next piece has to land without anyone touching the mouse. The same number
 * twice lights the chip that is already there up instead of counting a second piece.
 */
function SerialNumberChips({
  rows,
  lit,
  scanned,
  scanField,
  onScanned,
  onKeyDown,
  onTake,
  onRemove,
}: {
  rows: LotRow[]
  /** The chip a repeated number is already in; lit up for a moment. */
  lit: string | null
  scanned: string
  scanField: RefObject<HTMLInputElement | null>
  onScanned: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onTake: (code: string) => void
  onRemove: (key: string) => void
}) {
  // A chip is one piece. A proposal line the server offered but did not pick — an expired lot,
  // or one of the twenty it listed beyond what was asked for — counts nothing and would be a
  // chip that lies about the quantity.
  const picked = rows.filter(
    (row) => row.lotNumber !== null && (parseDecimal(row.quantity) ?? 0) > 0,
  )

  return (
    <div className="grid gap-2">
      {/* Kept at the top of the block on purpose: on a phone the on-screen keyboard pushes
          everything below it out of sight, and this is the field that has to stay. */}
      <div className="flex items-end gap-2">
        <TextField
          ref={scanField}
          label="Seriennummer"
          value={scanned}
          onChange={(event) => onScanned(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={LOT_NUMBER_MAX}
          autoComplete="off"
          placeholder="Scannen oder tippen, Enter übernimmt"
          hint="Rücktaste im leeren Feld entfernt die letzte Nummer."
          className="flex-1"
        />
        <div className="pb-[22px]">
          <BarcodeScanner
            label="Seriennummern mit der Kamera scannen"
            continuous
            onScan={onTake}
            onClose={() => scanField.current?.focus()}
          />
        </div>
      </div>

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((row) => (
              <li
                key={row.key}
                data-lit={row.key === lit ? 'true' : undefined}
                className={`inline-flex items-center gap-1 rounded-[var(--radius-full)] py-0.5 pl-2.5 pr-1 text-[12px] transition-colors ${
                  row.key === lit
                    ? 'bg-warning/20 text-text-primary'
                    : 'bg-surface text-text-primary'
                }`}
              >
                <span className="font-mono">{row.lotNumber}</span>
                <button
                  type="button"
                  onClick={() => onRemove(row.key)}
                  aria-label={`${row.lotNumber} entfernen`}
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

/**
 * «Nummern erzeugen»: prefix, first number, how many.
 *
 * <p>A row inside the field rather than a second dialog: two focus traps inside each other do
 * not behave, and this is a step in filling one field in, not an errand of its own.
 *
 * <p>The server computes the numbers and saves nothing. Whoever changes their mind leaves
 * nothing behind — the lots come into being when the booking is saved.
 */
function SerialGenerator({
  tenantId,
  product,
  open,
  onOpen,
  missing,
  onNumbers,
}: {
  tenantId: number
  product: Product
  open: boolean
  onOpen: (open: boolean) => void
  /** How many are still unnumbered; the count starts there. */
  missing: number
  onNumbers: (numbers: string[]) => void
}) {
  const [prefix, setPrefix] = useState('')
  const [start, setStart] = useState('1')
  const [count, setCount] = useState('')
  const [padding, setPadding] = useState('4')

  const wanted = Number(parseDecimal(count === '' ? `${missing}` : count) ?? 0)
  const tooMany = wanted > SERIAL_PROPOSAL_MAX

  const generate = useMutation({
    mutationFn: () =>
      api.post<SerialNumbers>(serialNumberProposalUrl(tenantId, product.id), {
        prefix: prefix.trim() === '' ? undefined : prefix.trim(),
        start: Number(parseDecimal(start) ?? 1),
        count: wanted,
        padding: padding.trim() === '' ? undefined : Number(parseDecimal(padding) ?? 0),
      }),
    onSuccess: (answer) => {
      onNumbers(answer.numbers)
      onOpen(false)
    },
  })

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => onOpen(true)}>
          Nummern erzeugen
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <TextField label="Präfix" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={40} />
        <TextField
          label="Startnummer"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          inputMode="numeric"
          numeric
        />
        <TextField
          label="Anzahl"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          inputMode="numeric"
          numeric
          placeholder={`${missing}`}
          invalid={tooMany}
          hint={tooMany ? `Höchstens ${SERIAL_PROPOSAL_MAX} auf einmal.` : undefined}
        />
        <TextField
          label="Stellen"
          value={padding}
          onChange={(event) => setPadding(event.target.value)}
          inputMode="numeric"
          numeric
        />
      </div>
      {generate.error instanceof Error && (
        <p role="alert" className="text-[12px] text-danger">
          {generate.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          onClick={() => generate.mutate()}
          busy={generate.isPending}
          disabled={tooMany || wanted <= 0}
        >
          Übernehmen
        </Button>
        <Button variant="secondary" onClick={() => onOpen(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}

/**
 * «Aus Bestand wählen»: the serial numbers lying at this location.
 *
 * <p>The way in for goods that are not in front of anyone to scan — a return from the shelf, a
 * correction the morning after. Blocked numbers are not offered: they are exactly the ones
 * that must not go out.
 */
function SerialPicker({
  tenantId,
  product,
  locationId,
  open,
  onOpen,
  onTake,
}: {
  tenantId: number
  product: Product
  locationId: string
  open: boolean
  onOpen: (open: boolean) => void
  onTake: (lotNumber: string) => void
}) {
  const [term, setTerm] = useState('')

  const query = listQuery({
    locationId: locationId === '' ? undefined : locationId,
    withStockOnly: true,
    includeBlocked: false,
    search: term,
    size: PICKER_SIZE,
    sort: 'lotNumber,asc',
  })
  const lots = useQuery({
    queryKey: productLotsKey(tenantId, product.id, query),
    queryFn: () => api.get<Page<Lot>>(`${productLotsUrl(tenantId, product.id)}?${query}`),
    enabled: open,
  })

  if (!open) {
    return (
      <div>
        <Button variant="secondary" onClick={() => onOpen(true)}>
          Aus Bestand wählen
        </Button>
      </div>
    )
  }

  const found = lots.data?.content ?? []

  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-3 py-3">
      <TextField
        label="Suchen"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        maxLength={LOT_NUMBER_MAX}
        placeholder="Seriennummer"
        autoComplete="off"
      />
      {lots.isError ? (
        <p role="alert" className="text-[12px] text-danger">
          {lots.error instanceof Error ? lots.error.message : 'Der Bestand konnte nicht gelesen werden.'}
        </p>
      ) : found.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          {lots.isPending ? 'Wird gelesen ...' : 'An diesem Lagerort liegt keine solche Nummer.'}
        </p>
      ) : (
        <ul className="max-h-[180px] overflow-y-auto">
          {found.map((lot) => (
            <li key={lot.id}>
              <button
                type="button"
                onClick={() => onTake(lot.lotNumber)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-[13px] hover:bg-sunken"
              >
                <span className="font-mono">{lot.lotNumber}</span>
                {expiryLabel(lot) !== '' && (
                  <span className={`text-[12px] ${lot.expired ? 'text-danger' : 'text-text-tertiary'}`}>
                    {expiryLabel(lot)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="secondary" onClick={() => onOpen(false)}>
          Fertig
        </Button>
      </div>
    </div>
  )
}

/**
 * The stock that was there before the product was tracked, as its own line.
 *
 * <p>It can be used up and never added to. Without a line of its own it would be invisible,
 * and the field would ask for numbers that nobody can give it (backend ADR-0068).
 */
function LotFreeRow({
  rows,
  onQuantity,
}: {
  rows: LotRow[]
  onQuantity: (key: string, value: string) => void
}) {
  const free = rows.find((row) => row.lotNumber === null)
  if (free === undefined) return null

  return (
    <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
      <p className="flex-1 basis-full text-[13px] text-text-secondary sm:basis-auto">
        Bestand ohne Chargennummer
        <span className="ml-2 font-mono text-[12px] text-text-tertiary">
          {formatQuantity(free.available ?? 0)}
        </span>
      </p>
      <TextField
        label="Menge"
        value={free.quantity}
        onChange={(event) => onQuantity(free.key, event.target.value)}
        inputMode="decimal"
        numeric
        className="basis-full sm:w-[120px] sm:basis-auto"
      />
    </div>
  )
}

/**
 * The batch numbers this product already carries, as a suggestion list.
 *
 * <p>Typed rather than chosen: a batch number comes off the supplier's label. The list only
 * saves the second delivery of the same batch from being typed twice, with two spellings.
 *
 * @param tenantId the tenant
 * @param product the product being booked
 * @param enabled false where nothing is typed, so no request goes out
 * @returns the id to bind the field to, and the list itself
 */
function useKnownNumbers(
  tenantId: number,
  product: Product,
  enabled: boolean,
): { listId: string; list: ReactNode } {
  const listId = `lots-${product.id}`
  const query = listQuery({ size: PICKER_SIZE, sort: 'lotNumber,asc' })
  const lots = useQuery({
    queryKey: productLotsKey(tenantId, product.id, query),
    queryFn: () => api.get<Page<Lot>>(`${productLotsUrl(tenantId, product.id)}?${query}`),
    enabled,
  })

  return {
    listId,
    list: (
      <datalist id={listId}>
        {(lots.data?.content ?? []).map((lot) => (
          <option key={lot.id} value={lot.lotNumber} />
        ))}
      </datalist>
    ),
  }
}
