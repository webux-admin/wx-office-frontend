import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { api } from '../../lib/api'
import { parseDecimal } from '../../lib/format'
import { booksStock, tracksLots } from '../../lib/inventory'
import type { OriginState } from '../../lib/origin'
import type {
  DocumentLine,
  LotAllocation,
  MovementDirection,
  Product,
  StockEffect,
} from '../../lib/types'
import { DiscountPair, MoreDetails, ServiceDateFields } from './LineDialogParts'
import { ProductFacts } from './ProductFacts'
import { ProductQuickSearch } from './ProductQuickSearch'
import { LotAllocationField } from '../inventory/LotAllocationField'
import {
  carriedLots,
  discountFieldsOf,
  discountPayload,
  dropsDiscount,
  hasProblem,
  lineProblems,
  lotHeadline,
  lotProblems,
  moreDetailsSummary,
  NO_DISCOUNT,
  signedLots,
  type PickedLots,
  type ProductLine,
} from './lineForm'
import { useVatText } from './productInfo'

/**
 * Adds a line from the catalogue, or edits one that is already on the document.
 *
 * <p>Built for the keyboard, because this is the mask a document is written in: the search
 * field has the focus when it opens, the arrow keys and Enter pick a product, the focus then
 * lands on the quantity with the figure selected, and Enter adds the line. "Hinzufügen und
 * weiter" (Strg+Enter) keeps the dialog open for the next position, so ten of them are
 * written without reaching for the mouse.
 *
 * <p>No price is asked for: which one applies to this customer is decided by the backend from
 * the customer price, the price group and the base price, in that order. What that resolution
 * answers is shown, so the user sees it before the line goes out.
 *
 * <p>The mask keeps its fields in `useState` and is therefore mounted afresh per line; the
 * caller does that with a `key`, so the values below are read once and are the stored ones.
 */
export function ProductLineDialog({
  tenantId,
  partnerId,
  documentDate,
  currency,
  back,
  open,
  onClose,
  onSubmit,
  line,
  busy,
  error,
  stockLocationId,
  stockEffect,
}: {
  tenantId: number
  /** The customer of the document, whose price list decides what a product costs. */
  partnerId: number
  /** The date of the document, which stands in wherever no day of supply is given. */
  documentDate: string
  /** The currency the price list is kept in, for the resolved price. */
  currency?: string
  /** Where the way into the product mask returns from. */
  back: OriginState
  open: boolean
  onClose: () => void
  /**
   * Sends the line and answers when the backend has taken it. A refusal keeps the dialog
   * open with everything still in it — the dialog is the only place the typed values exist.
   */
  onSubmit: (line: ProductLine) => Promise<unknown>
  /** The line being edited; left out the dialog adds a new one. */
  line?: DocumentLine
  busy: boolean
  /** Why the last attempt was refused; the dialog stays open until one goes through. */
  error?: unknown
  /**
   * The store the document delivers from, as the server worked it out. Every free quantity in
   * this dialog is the one of that store — a Lieferschein out of the outside store must not
   * report what lies in the main one (ADR-0067 of the backend).
   */
  stockLocationId?: number
  /**
   * What issuing this document does to the stock. The block for batches and serial numbers
   * appears only where it books them out — an Offerte moves nothing and asks for none
   * (backend ADR-0069).
   */
  stockEffect?: StockEffect
}) {
  const [picked, setPicked] = useState<Product | undefined>(undefined)
  // True while the field names a product rather than a search term. A line being edited opens
  // that way; typing over the name gives the product up until another one is picked.
  const [taken, setTaken] = useState(line?.productId !== undefined)
  const [term, setTerm] = useState(storedLabel(line))
  const [quantity, setQuantity] = useState(line?.quantity === undefined ? '1' : String(line.quantity))
  const [discount, setDiscount] = useState(discountFieldsOf(line))
  const [from, setFrom] = useState(line?.serviceDateFrom ?? '')
  const [to, setTo] = useState(line?.serviceDateTo ?? '')
  // The numbers this position moves, counted in pieces, and the product they were picked for.
  // Held here because the field that collects them is the inventory's and knows nothing about
  // a document line. The sign is put on when they are read — a position can still turn from an
  // issue into a return after the pick was made.
  const [lots, setLots] = useState<PickedLots>({
    productId: line?.productId,
    entries: (line?.lots ?? []).map((lot) => ({
      lotNumber: lot.lotNumber,
      quantity: Math.abs(lot.quantity),
    })),
  })
  // Which way the numbers are picked, kept so an empty quantity field does not turn the block
  // over for a keystroke. Adjusted below, where the typed quantity has been read.
  const [signedAs, setSignedAs] = useState<MovementDirection>(
    (line?.quantity ?? 0) < 0 ? 'IN' : 'OUT',
  )
  const search = useRef<HTMLInputElement>(null)
  const count = useRef<HTMLInputElement>(null)
  /**
   * True once this dialog has sent a position and is not staying open for the next one.
   *
   * <p>A ref and not `useState`: the two clicks of a double click can land in the same tick,
   * and a state value read in the second one would still be the old one.
   */
  const sent = useRef(false)

  const productId = picked?.id ?? (taken ? line?.productId : undefined)
  // The day of supply decides the VAT rate and the price period; without one the document
  // date does, which is what the backend falls back to as well.
  const dateOfSupply = from === '' ? documentDate : from
  const { vatOf, vatFailed } = useVatText(tenantId, dateOfSupply)

  // The line being edited names its product but carries none of its details. They are read
  // once, so unit, revenue account, VAT rate and price stand next to the fields either way.
  const stored = useQuery({
    queryKey: ['product', tenantId, line?.productId],
    queryFn: () => api.get<Product>(`/api/tenants/${tenantId}/products/${line?.productId}`),
    enabled: picked === undefined && line?.productId !== undefined,
    retry: false,
  })
  const product = picked ?? (taken ? stored.data : undefined)
  // True while the position names a product whose details have not arrived yet. Nothing here
  // can then tell a followed product from a plain one — and a position saved in that window
  // used to go out without a single number and wipe what the line carried. Only asked where
  // the document books at all: anywhere else the answer changes nothing about the numbers,
  // and making an Offerte wait for it would be a lock for no reason.
  const unknownProduct =
    booksStock(stockEffect)
    && picked === undefined
    && line?.productId !== undefined
    && stored.data === undefined
    && !stored.isError

  const amount = parseDecimal(quantity)
  // Only where the kind of document books stock out and the product is followed. Anywhere
  // else the dialog looks exactly as it did.
  const showsLots = booksStock(stockEffect) && tracksLots(product)
  // What may travel with this position: numbers picked for another product, for one nobody
  // follows, or on a document that books nothing are none of its business. Signed here and
  // not when they were picked, so the header below counts the same pieces as the field does.
  const carried = signedLots(carriedLots(lots, productId, product, stockEffect), amount)
  // The numbers are checked together with the rest, so the existing lock on «Übernehmen»
  // covers them without a second mechanism (backend ADR-0069). Only where the block is drawn:
  // a lock over a field nobody can see is a dialog that refuses without a word.
  const problems = { ...lineProblems({ quantity, discount }),
    lots: showsLots ? lotProblems(amount, product?.tracking, carried) : undefined }
  // The catalogue decides whether a line may be discounted at all. The backend refuses the
  // line either way; hiding the field here only spares the user a rejected dialog.
  const discountable = product === undefined || product.discountable !== false
  // A line written before the product lost its discount keeps the figure in the field. It is
  // not sent any more, so the amount of the line rises — and that has to be said out loud.
  const dropping = dropsDiscount(discountable, discount)
  const ready = productId !== undefined && !unknownProduct && !hasProblem(problems)
  // Read from the sign of the quantity, and the one before it while the field is empty: a
  // quantity that is selected and retyped is empty for a keystroke, and a block that flipped
  // to «Zugang» in that moment would throw the picked numbers away.
  const direction: MovementDirection = amount === null ? signedAs : amount < 0 ? 'IN' : 'OUT'
  if (direction !== signedAs) setSignedAs(direction)

  // Held back for as long as the field is being typed in, so the price is asked for once per
  // quantity and not once per keystroke. A quantity of zero is refused anyway; the price is
  // then the one of a single item rather than none at all.
  const settledQuantity = parseDecimal(useDebouncedValue(quantity)) ?? 1
  const askedQuantity = settledQuantity > 0 ? settledQuantity : 1

  /**
   * Sends the position and either closes the dialog or clears it for the next one.
   *
   * <p>What is kept for the next position is the period of supply: it belongs to the delivery
   * and not to the single line. The discount does not — a percentage carried over silently
   * would end up on a position nobody meant to discount.
   */
  const send = (again: boolean, taking?: Product) => {
    // The buttons are locked while a line is on its way; the keyboard was not. Three presses
    // of Enter in the quantity — key repeat is enough — put the same position on the document
    // three times, and on a document an amount is a statement.
    //
    // And one step further: `busy` is false again the moment the backend answers, while the
    // box is still on screen and still takes a click for the length of its fade. The second
    // click of a double click lands in there. `sent` closes that window, and closes it
    // whatever the fade is timed at.
    //
    // It is also the only lock the tests reach: jsdom acts on neither `inert` nor a hit test,
    // so the lock the dialog puts on the fading box is pinned as an attribute and no more.
    if (busy || sent.current) return
    const id = taking?.id ?? productId
    // Held back while the product is unknown as well: the keyboard reaches this without ever
    // touching the button that is dark for the same reason.
    if (id === undefined || unknownProduct || hasProblem(problems)) return
    // Taken from the product being picked where there is one: the state of this render still
    // says what was chosen before it — and the numbers belong to the product they were picked
    // for, which on this way in is the one being handed over.
    const allowsDiscount = taking === undefined ? discountable : taking.discountable !== false
    const numbers = signedLots(
      carriedLots(lots, taking?.id ?? id, taking ?? product, stockEffect),
      amount,
    )
    const payload: ProductLine = {
      productId: id,
      quantity: amount ?? 1,
      ...(allowsDiscount ? discountPayload(discount) : {}),
      serviceDateFrom: from || undefined,
      serviceDateTo: to || undefined,
      // Left out rather than sent empty: the server refuses any entry on a product nobody
      // follows, and an empty array would be one.
      ...(numbers.length === 0 ? {} : { lots: numbers }),
    }
    // Set before the line goes out, not in the answer: the second click is there long before
    // the backend is.
    sent.current = true
    void onSubmit(payload).then(
      () => {
        if (!again) {
          onClose()
          return
        }
        // "Hinzufügen und weiter" promises the next position, so the way has to be open for
        // it. The dialog stays where it is and takes them one after the other.
        sent.current = false
        setPicked(undefined)
        setTaken(false)
        setTerm('')
        setQuantity('1')
        setDiscount(NO_DISCOUNT)
        // The numbers go with the product they were picked for. Nothing else clears them: the
        // field that collects them is unmounted by this very reset and reports no more, so
        // whatever it last said would still be in here — and Strg+Enter on the same product
        // sends in the same tick, before the field is back. The piece would go out on two
        // positions and be refused as a 409 at «Ausstellen», over a number nobody picked.
        setLots(NOTHING_PICKED)
        search.current?.focus()
      },
      () => {
        // Refused, so the dialog stays open with everything in it — and the corrected
        // position has to be able to go out.
        sent.current = false
      },
    )
  }

  const take = (chosen: Product, andAdd = false) => {
    setPicked(chosen)
    setTaken(true)
    setTerm(labelOf(chosen))
    // Strg+Enter promises to add and keep the dialog open. Pressed in the search field that
    // means taking the hit and adding it in one go, with the quantity that stands — the
    // product has to be handed over, because this render still knows none.
    if (andAdd && line === undefined) {
      send(true, chosen)
      return
    }
    // Straight on to the only field that still has to be typed, with the figure selected so
    // the next keystroke replaces it.
    count.current?.focus()
    count.current?.select()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || line !== undefined) return
    event.preventDefault()
    // A held down key repeats; a position is added once per press.
    if (event.repeat) return
    send(true)
  }

  // Also where the product may not be discounted: a figure that is in the field but is not
  // sent any more is exactly what must not disappear behind a fold. It is not called a
  // discount there, though — folded away, the warning next to the field is out of sight, and
  // a chip saying "Rabatt 10 %" would claim a discount that is not sent.
  const summary = dropping
    ? ['Rabatt entfällt', moreDetailsSummary(NO_DISCOUNT, from, to)]
        .filter((entry) => entry !== undefined)
        .join(' · ')
    : moreDetailsSummary(discount, from, to)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={line ? 'Position bearbeiten' : 'Position aus dem Katalog'}
      description="Der Preis kommt aus der Preisfindung des Backends."
      wide
      // Editing a stored line starts in the quantity: the search field carries the name of
      // the product, and the first keystroke there would give the product up.
      initialFocus={line ? count : search}
      onSubmit={!ready || busy ? undefined : () => send(false)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          {line === undefined && (
            <Button
              variant="secondary"
              disabled={!ready || busy}
              onClick={() => send(true)}
              title="Strg+Enter"
            >
              Hinzufügen und weiter
            </Button>
          )}
          <Button busy={busy} disabled={!ready || busy} onClick={() => send(false)} shortcut>
            {line ? 'Übernehmen' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        {error !== null && error !== undefined && (
          <div className="mb-4">
            <ErrorNotice error={error} />
          </div>
        )}

        <div className="grid gap-4">
          <ProductQuickSearch
            tenantId={tenantId}
            term={term}
            onTerm={(typed) => {
              setTerm(typed)
              // What was chosen is no longer what the field says, so nothing is chosen.
              setPicked(undefined)
              setTaken(false)
            }}
            chosen={taken}
            onChoose={take}
            vatOf={vatOf}
            back={back}
            inputRef={search}
            stockLocationId={stockLocationId}
          />

          <ProductFacts
            tenantId={tenantId}
            partnerId={partnerId}
            product={product}
            quantity={askedQuantity}
            perUnitOnly={settledQuantity <= 0}
            currency={currency}
            vatOf={vatOf}
            vatFailed={vatFailed}
            stockLocationId={stockLocationId}
          />

          <TextField
            ref={count}
            label="Menge"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return
              event.preventDefault()
              // A held down key repeats; a position is added once per press.
              if (event.repeat) return
              send(false)
            }}
            inputMode="decimal"
            numeric
            invalid={problems.quantity !== undefined}
            hint={problems.quantity}
            className="sm:max-w-[200px]"
          />

          {/* Right under the quantity and not in «Weitere Angaben»: on a tracked product the
              number is compulsory and no aside, and it has to add up against the quantity
              standing next to it (backend ADR-0069). */}
          {showsLots && product !== undefined && (
            <div className="grid gap-2 sm:col-span-2">
              {/* The same sentence the field draws under it, from the same numbers: two
                  counters three lines apart that disagree leave the reader no way of telling
                  which one is lying. */}
              <p aria-live="polite" className="text-[12px] text-text-secondary">
                {lotHeadline(amount, carried)}
              </p>
              <LotAllocationField
                // Another product is another field: what the position carried says nothing
                // about the one that was just picked instead.
                key={product.id}
                tenantId={tenantId}
                product={product}
                locationId={stockLocationId === undefined ? '' : String(stockLocationId)}
                // What the position already carries, so opening it again shows its numbers
                // instead of quietly replacing them with a fresh pick. Only where it is still
                // the stored product — the numbers belong to that one and to no other.
                saved={product.id === line?.productId ? savedAllocation(line) : undefined}
                // A return is a receipt: it names numbers that come back rather than ones
                // that leave, and the field offers accordingly. It gives up a pick made for
                // the other direction when this turns over — a number lying in the store is
                // one that may go out, never one that comes back.
                direction={direction}
                // And a negative line on a document is always a return: goods coming back
                // from a customer, never a delivery from a supplier. So the field offers the
                // numbers that last went out and warns about one that never did — it does
                // not block, the choice on a return is free (backend ADR-0069).
                returning
                quantity={amount === null ? null : Math.abs(amount)}
                // The stock without a number cannot travel on a document line: the line
                // freezes a number, and that stock has none.
                allowWithoutNumber={false}
                onChange={(allocations) =>
                  setLots({
                    // Noted with the product they were picked for: on another one they name
                    // nothing, and the endpoint refuses them.
                    productId: product.id,
                    entries: allocations
                      .filter((allocation) => allocation.lotNumber !== null)
                      .map((allocation) => ({
                        lotNumber: allocation.lotNumber as string,
                        // Pieces, as the field counts them. The sign of the line is put on
                        // when they are read: this quantity can still turn negative.
                        quantity: allocation.quantity,
                      })),
                  })
                }
              />
              {problems.lots !== undefined && (
                <p className="text-[12px] text-warning">{problems.lots}</p>
              )}
            </div>
          )}
        </div>

        <MoreDetails defaultOpen={summary !== undefined} summary={summary}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DiscountPair
              fields={discount}
              onChange={setDiscount}
              disabled={!discountable}
              disabledHint={
                dropping
                  ? 'Dieses Produkt ist nicht rabattfähig. Der gespeicherte Rabatt entfällt beim Übernehmen, der Betrag der Zeile steigt.'
                  : 'Dieses Produkt ist nicht rabattfähig.'
              }
              percentProblem={problems.percent}
              amountProblem={problems.amount}
            />
          </div>

          <div className="mt-4">
            <ServiceDateFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
          </div>
        </MoreDetails>

        <p className="mt-4 text-[11px] text-text-tertiary">
          Pfeiltasten wählen einen Treffer, Enter übernimmt ihn.{' '}
          {line
            ? 'Enter in der Menge übernimmt die Position.'
            : 'Enter in der Menge fügt die Position hinzu, Strg+Enter fügt hinzu und lässt den Dialog für die nächste offen.'}
        </p>
      </div>
    </Dialog>
  )
}

/**
 * What a position carries before anything is picked for it.
 *
 * <p>Named rather than written out twice: this is what "no numbers" is, and the reset for the
 * next position has to answer it exactly as the empty dialog does.
 */
const NOTHING_PICKED: PickedLots = { productId: undefined, entries: [] }

/**
 * How a product is named in the search field once it is chosen.
 *
 * @param product the chosen product
 */
function labelOf(product: Product): string {
  return [product.productNumber, product.name].filter(Boolean).join(' · ')
}

/**
 * How the line being edited names its product.
 *
 * <p>Taken from the line and not from the catalogue: what is on the document is what was
 * agreed, even where the product has been renamed or withdrawn since.
 *
 * @param line the line being edited, undefined for a new one
 */
function storedLabel(line: DocumentLine | undefined): string {
  if (!line) return ''
  return [line.productNumber, line.description].filter(Boolean).join(' · ')
}

/**
 * The numbers a stored position already carries, for the field that collects them.
 *
 * <p>Unsigned: the line signs them and the field counts pieces, so a return of two pieces goes
 * in as two. Read when the field opens and never after — what the user does from there on is
 * the field's business (backend ADR-0069).
 *
 * @param line the line being edited, undefined for a new one
 * @returns one entry per number, empty on a position that carries none
 */
function savedAllocation(line: DocumentLine | undefined): LotAllocation[] {
  return (line?.lots ?? []).map((lot) => ({
    lotNumber: lot.lotNumber,
    quantity: Math.abs(lot.quantity),
  }))
}
