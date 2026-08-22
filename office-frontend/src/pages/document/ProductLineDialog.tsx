import { useQuery } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { api } from '../../lib/api'
import { parseDecimal } from '../../lib/format'
import type { OriginState } from '../../lib/origin'
import type { DocumentLine, Product } from '../../lib/types'
import { DiscountPair, MoreDetails, ServiceDateFields } from './LineDialogParts'
import { ProductFacts } from './ProductFacts'
import { ProductQuickSearch } from './ProductQuickSearch'
import {
  discountFieldsOf,
  discountPayload,
  dropsDiscount,
  hasProblem,
  lineProblems,
  moreDetailsSummary,
  NO_DISCOUNT,
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

  const amount = parseDecimal(quantity)
  const problems = lineProblems({ quantity, discount })
  // The catalogue decides whether a line may be discounted at all. The backend refuses the
  // line either way; hiding the field here only spares the user a rejected dialog.
  const discountable = product === undefined || product.discountable !== false
  // A line written before the product lost its discount keeps the figure in the field. It is
  // not sent any more, so the amount of the line rises — and that has to be said out loud.
  const dropping = dropsDiscount(discountable, discount)
  const ready = productId !== undefined && !hasProblem(problems)

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
    if (id === undefined || hasProblem(problems)) return
    // Taken from the product being picked where there is one: the state of this render still
    // says what was chosen before it.
    const allowsDiscount = taking === undefined ? discountable : taking.discountable !== false
    const payload: ProductLine = {
      productId: id,
      quantity: amount ?? 1,
      ...(allowsDiscount ? discountPayload(discount) : {}),
      serviceDateFrom: from || undefined,
      serviceDateTo: to || undefined,
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
          <Button busy={busy} disabled={!ready || busy} onClick={() => send(false)}>
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
