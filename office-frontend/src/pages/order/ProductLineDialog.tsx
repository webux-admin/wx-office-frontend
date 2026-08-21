import { useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { parseDecimal } from '../../lib/format'
import type { DocumentLine, Product } from '../../lib/types'
import { DiscountPair, MoreDetails, ServiceDateFields } from './LineDialogParts'
import {
  discountFieldsOf,
  discountPayload,
  dropsDiscount,
  hasProblem,
  lineProblems,
  type ProductLine,
} from './lineForm'

/**
 * Adds a line from the catalogue, or edits one that is already on the document.
 *
 * <p>No price is asked for: which one applies to this customer is decided by the backend from
 * the customer price, the price group and the base price, in that order.
 *
 * <p>The mask keeps its fields in `useState` and is therefore mounted afresh per line; the
 * caller does that with a `key`, so the values below are read once and are the stored ones.
 */
export function ProductLineDialog({
  open,
  onClose,
  onSubmit,
  products,
  productsLoading = false,
  productsError,
  line,
  busy,
  error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (line: ProductLine) => void
  products: Product[]
  /** True while the catalogue is still on its way; the dropdown says so. */
  productsLoading?: boolean
  /** Set when the catalogue could not be read at all. */
  productsError?: unknown
  /** The line being edited; left out the dialog adds a new one. */
  line?: DocumentLine
  busy: boolean
  /** Why the last attempt was refused; the dialog stays open until one goes through. */
  error?: unknown
}) {
  const [productId, setProductId] = useState(line?.productId ? String(line.productId) : '')
  const [quantity, setQuantity] = useState(line?.quantity === undefined ? '1' : String(line.quantity))
  const [discount, setDiscount] = useState(discountFieldsOf(line))
  const [from, setFrom] = useState(line?.serviceDateFrom ?? '')
  const [to, setTo] = useState(line?.serviceDateTo ?? '')

  const amount = parseDecimal(quantity)
  const problems = lineProblems({ quantity, discount })
  // The catalogue decides whether a line may be discounted at all. The backend refuses the
  // line either way; hiding the field here only spares the user a rejected dialog.
  const chosen = products.find((product) => product.id === Number(productId))
  const discountable = chosen === undefined || chosen.discountable !== false
  // A line written before the product lost its discount keeps the figure in the field. It is
  // not sent any more, so the amount of the line rises — and that has to be said out loud.
  const dropping = dropsDiscount(discountable, discount)

  // A product that is no longer offered stays selectable while its line is edited. Dropping
  // it would show the next best product and quietly sell something else on saving.
  const stored =
    line?.productId !== undefined && !products.some((product) => product.id === line.productId)
      ? { id: line.productId, label: [line.productNumber, line.description].filter(Boolean).join(' · ') }
      : undefined

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={line ? 'Position bearbeiten' : 'Position aus dem Katalog'}
      description="Der Preis kommt aus der Preisfindung des Backends."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            busy={busy}
            disabled={productId === '' || hasProblem(problems)}
            onClick={() =>
              onSubmit({
                productId: Number(productId),
                quantity: amount ?? 1,
                ...(discountable ? discountPayload(discount) : {}),
                serviceDateFrom: from || undefined,
                serviceDateTo: to || undefined,
              })
            }
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
        <SelectField
          label="Produkt"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          invalid={Boolean(productsError)}
          hint={
            productsError
              ? 'Der Produktkatalog konnte nicht geladen werden.'
              : productsLoading
                ? 'Der Katalog wird geladen ...'
                : undefined
          }
          className="sm:col-span-2"
        >
          <option value="">Bitte wählen</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.productNumber ? `${product.productNumber} · ` : ''}
              {product.name}
            </option>
          ))}
          {stored && (
            <option key={stored.id} value={stored.id}>
              {stored.label}
            </option>
          )}
        </SelectField>

        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          numeric
          invalid={problems.quantity !== undefined}
          hint={problems.quantity}
        />

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
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
      </div>

      <MoreDetails defaultOpen={from !== '' || to !== ''}>
        <ServiceDateFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </MoreDetails>
    </Dialog>
  )
}
