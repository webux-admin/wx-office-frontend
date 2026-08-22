import { useState } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { parseDecimal } from '../../lib/format'
import type { DocumentLine, VatCategory } from '../../lib/types'
import { CatalogueSelect } from '../../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { DiscountPair, MoreDetails, ServiceDateFields } from './LineDialogParts'
import {
  discountFieldsOf,
  discountPayload,
  EVERYTHING_TOUCHED,
  hasProblem,
  lineProblems,
  moreDetailsSummary,
  NO_DISCOUNT,
  NOTHING_TOUCHED,
  visibleProblems,
  withTouched,
  type FreeLine,
  type LineField,
} from './lineForm'

/**
 * Adds a line that is not in the catalogue, price and VAT treatment included, or edits one.
 *
 * <p>Mounted afresh per line by its caller, so the fields below start on the stored values.
 */
export function FreeLineDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  line,
  defaultPriceIncludesVat = false,
  busy,
  error,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (line: FreeLine) => void
  /** The line being edited; left out the dialog adds a new one. */
  line?: DocumentLine
  /**
   * Which price base a new line starts on: the one the document is priced in, whether or not
   * that document shows VAT. A line written in the other base is a wrong amount, and it drops
   * every subtotal of the document to net, so the default follows the document rather than
   * being net for everybody.
   */
  defaultPriceIncludesVat?: boolean
  busy: boolean
  /** Why the last attempt was refused; the dialog stays open until one goes through. */
  error?: unknown
}) {
  const [description, setDescription] = useState(line?.description ?? '')
  const [subtitle, setSubtitle] = useState(line?.subtitle ?? '')
  const [note, setNote] = useState(line?.note ?? '')
  const [quantity, setQuantity] = useState(line?.quantity === undefined ? '1' : String(line.quantity))
  // Empty, not a code: the dropdown fills it with what this tenant marked as its default.
  const [unit, setUnit] = useState(line?.unit ?? '')
  const [unitPrice, setUnitPrice] = useState(
    line?.unitPrice === undefined ? '' : String(line.unitPrice),
  )
  const [discount, setDiscount] = useState(discountFieldsOf(line))
  const [vatCategory, setVatCategory] = useState<VatCategory>(
    (line?.vatCategory as VatCategory | undefined) ?? 'STANDARD',
  )
  // A stored line keeps what is on it; only a new one takes the base of the document.
  const [priceIncludesVat, setPriceIncludesVat] = useState(
    line?.priceIncludesVat ?? defaultPriceIncludesVat,
  )
  const [from, setFrom] = useState(line?.serviceDateFrom ?? '')
  const [to, setTo] = useState(line?.serviceDateTo ?? '')
  const [touched, setTouched] = useState(NOTHING_TOUCHED)

  const touch = (field: LineField) => setTouched((current) => withTouched(current, field))

  const count = parseDecimal(quantity)
  const price = parseDecimal(unitPrice)
  const problems = lineProblems({ description, quantity, unitPrice, discount })
  // What may be sent is decided on all problems, what is said out loud only on the fields
  // the user has already dealt with: an empty price is not a mistake before it was typed in.
  const shown = visibleProblems(problems, touched)
  // The discount stands outside the fold in this dialog, so only the period of supply can
  // hide in it — and it decides the VAT rate, which is exactly what must not disappear.
  const summary = moreDetailsSummary(NO_DISCOUNT, from, to)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={line ? 'Freie Position bearbeiten' : 'Freie Position'}
      description="Für alles, was nicht im Katalog steht."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          {/* Not locked while something is missing: a dead button next to a dialog that says
              nothing leaves the user with no way of finding out what it wants. The press is
              what uncovers it — every field counts as dealt with from then on. */}
          <Button
            busy={busy}
            onClick={() => {
              setTouched(EVERYTHING_TOUCHED)
              if (hasProblem(problems)) return
              onSubmit({
                description: description.trim(),
                // Left out rather than sent empty: an empty text is no text, and the
                // backend keeps the column null for it.
                subtitle: subtitle.trim() || undefined,
                note: note.trim() || undefined,
                quantity: count ?? 1,
                unit,
                unitPrice: price ?? 0,
                ...discountPayload(discount),
                vatCategory,
                priceIncludesVat,
                serviceDateFrom: from || undefined,
                serviceDateTo: to || undefined,
              })
            }}
          >
            {line ? 'Übernehmen' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      {error !== null && error !== undefined && (
        <div className="mb-4">
          <ErrorNotice error={error} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Bezeichnung"
          value={description}
          onChange={(event) => {
            touch('description')
            setDescription(event.target.value)
          }}
          onBlur={() => touch('description')}
          maxLength={500}
          invalid={shown.description !== undefined}
          hint={shown.description}
          className="sm:col-span-2"
        />
        <TextField
          label="2. Bezeichnung"
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          maxLength={140}
          className="sm:col-span-2"
        />
        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => {
            touch('quantity')
            setQuantity(event.target.value)
          }}
          onBlur={() => touch('quantity')}
          inputMode="decimal"
          numeric
          invalid={shown.quantity !== undefined}
          hint={shown.quantity}
        />
        <MasterDataSelect
          label="Einheit"
          tenantId={tenantId}
          list="units"
          value={unit}
          onChange={setUnit}
        />
        <TextField
          label="Einzelpreis"
          value={unitPrice}
          onChange={(event) => {
            touch('unitPrice')
            setUnitPrice(event.target.value)
          }}
          onBlur={() => touch('unitPrice')}
          inputMode="decimal"
          numeric
          invalid={shown.unitPrice !== undefined}
          hint={shown.unitPrice}
        />

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <DiscountPair
            fields={discount}
            onChange={setDiscount}
            onTouch={touch}
            percentProblem={shown.percent}
            amountProblem={shown.amount}
          />
        </div>

        <CatalogueSelect
          label="MwSt-Behandlung"
          tenantId={tenantId}
          catalogue="vat-category"
          value={vatCategory}
          onChange={(code) => setVatCategory(code as VatCategory)}
          className="sm:col-span-2"
        />
      </div>

      {/* The hint says what breaking the base costs, not what keeping it earns: on a document
          without a VAT statement — a delivery note — a subtotal never stands gross, however
          the lines are priced, and a promise of the sort would be read as one. */}
      <CheckboxField
        label="Preis versteht sich inklusive MwSt"
        hint="Mischt ein Beleg Netto- und Bruttopreise, stehen seine Zwischentotale netto."
        checked={priceIncludesVat}
        onChange={(event) => setPriceIncludesVat(event.target.checked)}
        className="mt-5"
      />

      {/* Belongs to the description and is printed under it, but stands here, after the VAT
          treatment: a box several lines high between "Bezeichnung" and "Menge" would push the
          figures — the fields every line needs — out of sight for a text few lines carry. */}
      <TextAreaField
        label="Kommentar"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={1000}
        rows={3}
        hint="Wird unter der Bezeichnung gedruckt."
        className="mt-5"
      />

      <MoreDetails defaultOpen={summary !== undefined} summary={summary}>
        <ServiceDateFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </MoreDetails>
    </Dialog>
  )
}
