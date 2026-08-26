import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import { EmptyState, WarningNotice } from '../../components/Notice'
import { api } from '../../lib/api'
import { formatQuantity, parseDecimal } from '../../lib/format'
import {
  expiryLabel,
  issuedLotsKey,
  issuedLotsUrl,
  lotKindLabel,
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
  IssuedLot,
  LotAllocation,
  LotKind,
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
  issuedLabel,
  listsEveryNumber,
  LOT_NUMBER_MAX,
  lotComplaint,
  neverIssuedWarning,
  SERIAL_PROPOSAL_MAX,
  nextKey,
  openOf,
  proposalRows,
  receiptRows,
  toAllocations,
  uncoveredWarning,
  withIssuedNumber,
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
  returning = false,
  saved,
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
  /**
   * True where the goods are coming back from a customer, not in from a supplier.
   *
   * <p>Both are `IN`, and they want opposite things: a receipt writes numbers off the
   * supplier's label, a return names numbers that already left this house. Where this is set
   * the field offers the ones that last went out and warns about one that is not among them —
   * it never refuses, the choice on a return is free (backend ADR-0069).
   */
  returning?: boolean
  /**
   * The split the caller already holds, read once when the field opens.
   *
   * <p>A stored position brings its numbers back rather than being handed a fresh pick: what
   * was saved is what is on the document, and opening it again must move nothing. Later
   * changes are ignored — the caller mounts the field afresh with a `key`, the way the
   * position dialog does.
   *
   * <p>Unsigned, like everything else here: the field counts pieces and the caller makes the
   * sign, so a return line hands its two pieces over as two.
   */
  saved?: readonly LotAllocation[]
}) {
  const kind = lotKindOf(product.tracking)
  const issuing = direction === 'OUT'
  // What the rows were built for. A new answer for another quantity or another location
  // replaces them; typing in them does not.
  const signature = `${direction}|${product.id}|${locationId}|${quantity ?? ''}`

  // What the caller handed in, as rows. Read once; from here on the field owns them.
  const [initial] = useState<LotRow[]>(() => savedRows(saved))
  const [rows, setRows] = useState<LotRow[]>(initial)
  // True while the handed in rows still wait for the proposal to say what lies behind their
  // numbers. Cleared the moment they are drawn against it, or given up for another pick.
  const [awaitingProposal, setAwaitingProposal] = useState(initial.length > 0)
  // True while the split in the field is somebody's decision rather than the last proposal:
  // the rows the caller handed in, and everything scanned, typed or taken back since. Every
  // later answer is then drawn against those rows instead of replacing them — a proposal
  // suggests, and it arrives a good while after the hand does.
  //
  // Once set it stays set for as long as the split does, and that is the whole point. A
  // decision does not stop being one because a proposal was drawn against it: cleared after the
  // first merge, a stored Lieferschein position would be handed today's FEFO pick on the next
  // keystroke in the quantity — printed serial numbers the customer never got, frozen on the
  // document for ten years. What a changed quantity does instead is ask: the counter says «1 zu
  // viel», the save button stays dark, and the user takes one off (decision of the Product
  // Owner in issue #21). It also makes the field answer the same way twice: without it a
  // hand-made pick survived one quantity change and was wiped by the second.
  //
  // The one thing that does take it back is the turn from an issue into a return below, which
  // empties the field: there is then no split left to be anybody's decision.
  const [ownSplit, setOwnSplit] = useState(initial.length > 0)
  // Which way the rows in the field were picked, so a turn from an issue into a return can be
  // told apart from any other change.
  const [pickedFor, setPickedFor] = useState<MovementDirection>(direction)
  const [scanned, setScanned] = useState('')
  const [announcement, setAnnouncement] = useState('')
  // Why the last number was not taken in, together with the pick it was refused against. Drawn
  // as well as spoken: whoever scans has to see that the piece did not arrive.
  const [lastRefusal, setLastRefusal] = useState<{ of: string; message: string } | null>(null)
  // True while the camera overlay is delivering. The overlay is drawn over the whole screen,
  // so the refusal has to be lifted over it — under it, it is a message nobody ever sees.
  const [scanning, setScanning] = useState(false)
  // The batch line being typed in. What stands in it half-finished is not yet a number, and
  // warning about it would re-word the sentence on every keystroke.
  const [typing, setTyping] = useState<string | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [picking, setPicking] = useState(false)
  const scanField = useRef<HTMLInputElement>(null)

  // A field that opens on a stored split counts as seeded for what it opened with, so the
  // proposal is drawn against those rows instead of replacing them.
  const [seeded, setSeeded] = useState(initial.length === 0 ? '' : signature)

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

  // What last went out, for a return. Neither location nor quantity is asked with: what left
  // the house left it, wherever it is being put back and however much comes back.
  const issuedQuery = useQuery({
    queryKey: issuedLotsKey(tenantId, product.id),
    queryFn: () => api.get<IssuedLot[]>(issuedLotsUrl(tenantId, product.id)),
    enabled: !issuing && returning,
  })
  // Offered on the way in and only on a return: a supplier delivery writes its numbers off the
  // label, and the numbers this house delivered say nothing about it.
  const offering = !issuing && returning
  const issued = offering ? issuedQuery.data : undefined

  // Adjusted while rendering rather than in an effect: an effect would draw the empty field
  // for one frame, and the summary line would say «offen 5» about a split that is already
  // filled in. The same pattern the booking dialog uses for its own reset.
  //
  // One chain and not four ifs: the turn of the direction has to empty the field before
  // anything is seeded into it, and the branches below read `rows` and `seeded` as this pass
  // still shows them. React runs the component again with the reset state, and that pass
  // seeds.
  const flipped = pickedFor !== direction
  if (flipped) {
    // A pick made for the other direction says nothing here: a number lying at the location is
    // one that may go out, never one that comes back, and what a customer returns is what left
    // the house. Kept across the turn, it would also leave the caller counting the same pieces
    // with the opposite sign — «offen 2» over a field that reports nothing open.
    setPickedFor(direction)
    setRows([])
    setSeeded('')
    setAwaitingProposal(false)
    setOwnSplit(false)
    setScanned('')
    setLit(null)
  } else if (
    issuing
    && proposalQuery.data !== undefined
    // Two ways an answer becomes the one this field is drawn against: it is the first for
    // another quantity or another location, or it is the one the rows handed in were waiting
    // for. Both do the same thing with it, so they are one branch.
    && (seeded !== signature || awaitingProposal)
  ) {
    setSeeded(signature)
    setAwaitingProposal(false)
    // Wholesale only where nobody has picked anything: the proposed quantities are the whole
    // point of FEFO, and drawing an empty hand against them would answer «offen 5» on a line
    // that should have been one glance. Where somebody has picked — the numbers the caller
    // handed in, or a number scanned while this very answer was still on its way — the answer
    // brings the facts and the pick stays, for this quantity and for every one after it.
    setRows(
      ownSplit
        ? mergedRows(proposalQuery.data, rows, allowWithoutNumber)
        : proposalRows(proposalQuery.data, allowWithoutNumber),
    )
  } else if (!issuing && kind === 'LOT' && seeded !== signature) {
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
  } else if (!issuing && kind === 'SERIAL' && seeded !== signature) {
    setSeeded(signature)
  }

  // Reported through a ref rather than as a dependency: the caller builds its handler inline,
  // so a plain dependency would fire on every keystroke in the dialog above.
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  }, [onChange])
  // Starts at what the caller handed in, so opening the field reports nothing. An empty first
  // report would take the numbers off the very position that is being edited — and on a
  // return line, where no proposal fills them back in, it would take them off for good.
  const reported = useRef(JSON.stringify(toAllocations(initial)))
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

  // Only while it is still about this pick. The refusal answered one scan against the quantity
  // and the location as they then stood, and both are part of the signature — a change to
  // either answers it back, and a red line that outlives its reason is a mask complaining
  // about something that is gone. Derived rather than cleared in an effect, which would draw
  // the stale sentence for one frame.
  const refused = lastRefusal !== null && lastRefusal.of === signature ? lastRefusal.message : null

  const open = openOf(quantity, rows)
  const complaint = lotComplaint(quantity, rows, kind)
  const uncovered = issuing ? uncoveredWarning(proposalQuery.data) : null
  const withoutNumber = issuing ? withoutNumberHint(proposalQuery.data, allowWithoutNumber) : null
  // A number nobody was ever delivered is warned about and taken all the same: whoever holds
  // the goods in their hand knows more about them than the journal does. The line being typed
  // in is left out of it: on a return the line already carries the whole quantity, so the
  // sentence would appear on the first keystroke of a number and re-word until it is finished.
  const neverIssued = offering
    ? neverIssuedWarning(rows.filter((row) => row.key !== typing), issued)
    : null

  // Only where the answer is known to name every number at the location. While it is on its
  // way, or where it came back full, the field takes what it is given: refusing a number it
  // merely did not hear about would be worse than staying quiet.
  const onlyListed = issuing && listsEveryNumber(proposalQuery.data)

  /**
   * Takes a change somebody made to the split.
   *
   * <p>Two things hang on it. Every later proposal is drawn against these rows instead of
   * replacing them — a number scanned while the answer is still on its way is a decision, and
   * the answer arrives a good while after the hand does. The field never picks for the user
   * again after this, not on the next quantity and not on the one after: it asks. And the
   * refusal of the last number goes: this is the user answering it, and a red line that
   * outlives its reason is a mask complaining about something that is no longer there.
   *
   * @param next the rows as they now stand
   */
  const changeRows = (next: LotRow[]) => {
    setRows(next)
    setOwnSplit(true)
    setLastRefusal(null)
  }

  const take = (input: string) => {
    const lotNumber = input.trim()
    setScanned('')
    if (lotNumber === '') return
    const added = addSerialNumber(rows, input, onlyListed)
    if (added.unlisted) {
      // Never taken in silently: it would count the open quantity down and be refused on
      // issuing, long after whoever scanned it has moved on. The reason stays open on purpose
      // — the proposal leaves out what is blocked as well as what is not there, so naming one
      // of the two would be a wrong reason for a right refusal.
      const refusal = `${lotNumber} ist an diesem Lagerort nicht verfügbar: kein Bestand oder gesperrt.`
      setLastRefusal({ of: signature, message: refusal })
      setAnnouncement(refusal)
      return
    }
    changeRows(added.rows)
    if (added.duplicate !== null) {
      setLit(added.duplicate)
      setAnnouncement(`${lotNumber} ist bereits erfasst`)
      return
    }
    setAnnouncement(allocationAnnouncement(lotNumber, quantity, added.rows))
  }

  /**
   * Takes over a number that once went out.
   *
   * <p>A serial number becomes a chip like a scanned one, so a number picked twice lights the
   * chip that is already there instead of counting a second piece. A batch number goes into
   * the line that is still without one, which on the everyday return — one line, the whole
   * quantity — completes the split in a single click.
   *
   * @param lotNumber the number that was picked out of the list
   */
  const takeIssued = (lotNumber: string) => {
    if (kind === 'SERIAL') {
      take(lotNumber)
      return
    }
    const next = withIssuedNumber(rows, lotNumber)
    changeRows(next)
    setAnnouncement(allocationAnnouncement(lotNumber, quantity, next))
  }

  /**
   * Gives one number up again.
   *
   * <p>On the way out the row stays and only loses its quantity: the piece still lies at the
   * location, and whoever changes their mind has to be able to pick that very number again.
   * On the way in there is no list to stay in, so a typed number that is taken back is gone.
   *
   * @param current the rows
   * @param key the row whose number is given up
   * @returns the rows without that piece
   */
  const released = (current: LotRow[], key: string) =>
    issuing ? withQuantity(current, key, '') : withoutRow(current, key)

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
      // The last number that carries a piece, not the last row: on the way out the list holds
      // the numbers nobody picked as well, and dropping one of those would look to whoever
      // pressed the key like nothing happened at all.
      const last = [...rows].reverse().find((row) => (parseDecimal(row.quantity) ?? 0) > 0)
      if (last !== undefined) changeRows(released(rows, last.key))
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
          onScanning={setScanning}
          onRemove={(key) => changeRows(released(rows, key))}
        />
      ) : (
        <BatchRows
          tenantId={tenantId}
          product={product}
          rows={rows}
          issuing={issuing}
          issued={offering ? (issued ?? []) : undefined}
          onQuantity={(key, value) => changeRows(withQuantity(rows, key, value))}
          onNumber={(key, value) => {
            setTyping(key)
            changeRows(withNumber(rows, key, value))
          }}
          onTyping={setTyping}
          onRemove={(key) => changeRows(withoutRow(rows, key))}
          onAdd={() => changeRows([...rows, emptyRow(nextKey(rows))])}
        />
      )}

      {refused !== null && <p className="text-[12px] text-danger">{refused}</p>}

      {/* Lifted over the camera overlay, which is drawn `fixed inset-0` and would leave the
          line above it out of sight. Whoever scans has to learn that the piece did not arrive
          while the camera is still running, not after they put it down (issue #21, Nachtrag).
          Not a live region: the announcement above already speaks it. */}
      {scanning && refused !== null && (
        <p className="fixed inset-x-4 top-4 z-[70] rounded-[var(--radius-sm)] bg-danger-surface px-3 py-2 text-center text-[13px] text-on-accent">
          {refused}
        </p>
      )}

      {offering && (
        <IssuedLots
          issued={issued}
          kind={kind}
          failed={issuedQuery.isError}
          onTake={takeIssued}
        />
      )}

      {kind === 'SERIAL' && !issuing && !returning && (
        <SerialGenerator
          tenantId={tenantId}
          product={product}
          open={generating}
          onOpen={setGenerating}
          missing={open > 0 ? open : 0}
          onNumbers={(numbers) => {
            const added = addSerialNumbers(rows, numbers)
            changeRows(added.rows)
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
        <LotFreeRow
          rows={rows}
          onQuantity={(key, value) => changeRows(withQuantity(rows, key, value))}
        />
      )}

      {complaint !== null && (
        <p className="text-[12px] text-warning">{complaint}</p>
      )}

      {uncovered !== null && <WarningNotice>{uncovered}</WarningNotice>}

      {withoutNumber !== null && <WarningNotice>{withoutNumber}</WarningNotice>}

      {neverIssued !== null && <WarningNotice>{neverIssued}</WarningNotice>}

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
 * «Zuletzt ausgeliefert»: the numbers that went out, with the document each left on.
 *
 * <p>Open on the screen and not behind a button: on a return this is the list the work is
 * done from, and a customer who sends a piece back sends back one of these. The document
 * stands next to every number, because that is what the delivery note in the hand says.
 *
 * <p>It only offers. A number that is not in it is typed or scanned like any other and comes
 * with a warning next to it, never with a refusal (backend ADR-0069).
 */
function IssuedLots({
  issued,
  kind,
  failed,
  onTake,
}: {
  /** What last went out, absent while the answer is on its way. */
  issued: readonly IssuedLot[] | undefined
  kind: LotKind
  failed: boolean
  onTake: (lotNumber: string) => void
}) {
  if (failed) {
    return (
      <p role="alert" className="text-[12px] text-danger">
        Die zuletzt ausgelieferten Nummern konnten nicht gelesen werden.
      </p>
    )
  }
  if (issued === undefined) return null

  return (
    <div className="grid gap-1.5">
      <p className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
        Zuletzt ausgeliefert
      </p>
      {issued.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          {`Über einen Beleg ist noch keine ${lotKindLabel(kind)} dieses Produkts abgegangen.`}
        </p>
      ) : (
        <ul className="max-h-[180px] overflow-y-auto">
          {issued.map((one) => (
            <li key={one.lotNumber}>
              <button
                type="button"
                onClick={() => onTake(one.lotNumber)}
                aria-label={`${one.lotNumber} übernehmen`}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-1 text-left text-[13px] hover:bg-surface"
              >
                <span className="font-mono">
                  {one.lotNumber}
                  {kind === 'LOT' && (
                    <span className="ml-2 text-[12px] text-text-tertiary">
                      {formatQuantity(one.quantity)}
                    </span>
                  )}
                </span>
                <span className="text-[12px] text-text-tertiary">{issuedLabel(one)}</span>
              </button>
            </li>
          ))}
        </ul>
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
  issued,
  onQuantity,
  onNumber,
  onTyping,
  onRemove,
  onAdd,
}: {
  tenantId: number
  product: Product
  rows: LotRow[]
  issuing: boolean
  /**
   * What last went out, on a return. Then those are the numbers offered while typing — the
   * ones the product happens to carry say nothing about what a customer sends back.
   */
  issued: readonly IssuedLot[] | undefined
  onQuantity: (key: string, value: string) => void
  onNumber: (key: string, value: string) => void
  /**
   * Says which line is being typed in, and `null` again when it is left. What stands there
   * half-finished is not yet a number and must not be judged as one.
   */
  onTyping: (key: string | null) => void
  onRemove: (key: string) => void
  onAdd: () => void
}) {
  const known = useKnownNumbers(tenantId, product, !issuing, issued)

  if (rows.length === 0) {
    if (!issuing) {
      return (
        <p className="text-[12px] text-text-secondary">
          Erfassen Sie die Chargennummer der Lieferung.
        </p>
      )
    }
    return (
      <EmptyState
        title="Keine Charge mit Bestand"
        description="Für dieses Produkt liegt an diesem Lagerort keine Charge mit Bestand. Buchen Sie zuerst einen Zugang im Lager."
      />
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
              onFocus={() => onTyping(row.key)}
              onBlur={() => onTyping(null)}
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
  onScanning,
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
  /**
   * True while the camera overlay is delivering numbers, false again when it closes. The
   * overlay covers the whole screen, so a refusal has to be drawn over it rather than under.
   */
  onScanning: (scanning: boolean) => void
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
            onScan={(code) => {
              // Noted on the first number rather than on the click: the scanner reports no
              // opening, and one delivered number is proof enough that the overlay is up.
              onScanning(true)
              onTake(code)
            }}
            onClose={() => {
              onScanning(false)
              scanField.current?.focus()
            }}
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
 * The batch numbers offered while one is typed.
 *
 * <p>On a delivery from a supplier those are the numbers this product already carries: the
 * number comes off the label, and the list only saves the second delivery of the same batch
 * from being typed twice, with two spellings.
 *
 * <p>On a return they are the numbers that last went out, and nothing else — what a customer
 * sends back is what was delivered, and the batches on the shelf say nothing about it. The
 * caller has read them already, so this asks for nothing.
 *
 * @param tenantId the tenant
 * @param product the product being booked
 * @param enabled false where nothing is typed, so no request goes out
 * @param issued the numbers that last went out on a return, absent on a supplier delivery
 * @returns the id to bind the field to, and the list itself
 */
function useKnownNumbers(
  tenantId: number,
  product: Product,
  enabled: boolean,
  issued: readonly IssuedLot[] | undefined,
): { listId: string; list: ReactNode } {
  const listId = `lots-${product.id}`
  const query = listQuery({ size: PICKER_SIZE, sort: 'lotNumber,asc' })
  const lots = useQuery({
    queryKey: productLotsKey(tenantId, product.id, query),
    queryFn: () => api.get<Page<Lot>>(`${productLotsUrl(tenantId, product.id)}?${query}`),
    enabled: enabled && issued === undefined,
  })
  const numbers = issued === undefined
    ? (lots.data?.content ?? []).map((lot) => lot.lotNumber)
    : issued.map((one) => one.lotNumber)

  return {
    listId,
    list: (
      <datalist id={listId}>
        {numbers.map((lotNumber) => (
          <option key={lotNumber} value={lotNumber} />
        ))}
      </datalist>
    ),
  }
}

/**
 * The split a caller already holds, as rows.
 *
 * <p>Kept unsigned: the field counts pieces and the caller makes the sign, so a return of two
 * pieces arrives here as two. An entry without a number never comes back this way — a document
 * line freezes a number, and the stock without one has none to freeze (backend ADR-0069).
 *
 * @param saved what the caller holds, absent where it holds nothing
 * @returns one row per number, in the order they were handed in
 */
function savedRows(saved: readonly LotAllocation[] | undefined): LotRow[] {
  return (saved ?? [])
    .filter((allocation) => allocation.lotNumber !== null && allocation.quantity !== 0)
    .map((allocation, index) => ({
      key: `saved-${index + 1}`,
      lotId: null,
      lotNumber: allocation.lotNumber,
      expired: false,
      quantity: `${Math.abs(allocation.quantity)}`,
    }))
}

/**
 * The split as it stands, drawn against what the location holds today.
 *
 * <p>The proposal brings the facts — what lies there, when it expires — and the rows in hand
 * bring the quantities. Nothing moves: a position opened again shows the whole pick list with
 * exactly the split it was saved with, and the user can shift a piece to another batch without
 * first losing the one they had.
 *
 * <p>A number the location no longer holds keeps a row of its own. It is on the document
 * either way, and dropping it here would silently empty a position.
 *
 * @param proposal what the server suggests taking
 * @param held the rows as they stand — what the caller handed in, plus whatever was done while
 *             the proposal was still on its way
 * @param allowWithoutNumber whether the stock without a number may be allocated at all
 * @returns the offered rows carrying the held quantities, then the held numbers that are no
 *          longer offered
 */
function mergedRows(
  proposal: LotProposal,
  held: readonly LotRow[],
  allowWithoutNumber: boolean,
): LotRow[] {
  const offered = proposalRows(proposal, allowWithoutNumber).map((row) => ({
    ...row,
    quantity: held.find((one) => sameLot(one, row))?.quantity ?? '',
  }))
  const gone = held.filter((one) => !offered.some((row) => sameLot(one, row)))
  return [...offered, ...gone]
}

/**
 * Whether two rows name the same lot.
 *
 * <p>Case is ignored, as the unique index in the database ignores it: `ch-a` and `CH-A` are one
 * batch, and a stored number must find its row whichever way it was written.
 *
 * @param one the row handed in
 * @param other the row offered
 * @returns true where they name the same lot, or both name the stock without a number
 */
function sameLot(one: LotRow, other: LotRow): boolean {
  if (one.lotNumber === null || other.lotNumber === null) return one.lotNumber === other.lotNumber
  return (
    one.lotNumber.trim().toLocaleLowerCase('de-CH') ===
    other.lotNumber.trim().toLocaleLowerCase('de-CH')
  )
}

/**
 * What to say about stock that carries no number where none of it may be taken.
 *
 * <p>The changeover case: goods that lay there before the product was tracked. They are real
 * and they are countable, and they still cannot go on a document line, because the line freezes
 * a number and this stock has none. Explained rather than offered — without the sentence the
 * user reads «offen 2» next to a shelf they know is full and has no way to learn why
 * (backend ADR-0069).
 *
 * @param proposal what the server suggests taking, absent while it is on its way
 * @param allowWithoutNumber whether the caller may take that stock; where it may, the stock has
 *                           a row of its own and needs no sentence
 * @returns the German sentence, or `null` where there is nothing to explain
 */
function withoutNumberHint(
  proposal: LotProposal | undefined,
  allowWithoutNumber: boolean,
): string | null {
  if (allowWithoutNumber) return null
  const available = proposal?.withoutNumber?.available ?? 0
  if (available <= 0) return null
  return `Bestand ohne Chargennummer: ${formatQuantity(available)}. Über eine Inventur zuordnen.`
}
