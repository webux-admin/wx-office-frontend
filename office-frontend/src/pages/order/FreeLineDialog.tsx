import { useState } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { parseDecimal } from '../../lib/format'
import type { DocumentLine, VatCategory } from '../../lib/types'
import { CatalogueSelect } from '../../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { DiscountPair, MoreDetails, ServiceDateFields } from './LineDialogParts'
import {
  discountFieldsOf,
  discountPayload,
  hasProblem,
  lineProblems,
  type FreeLine,
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
  busy,
  error,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (line: FreeLine) => void
  /** The line being edited; left out the dialog adds a new one. */
  line?: DocumentLine
  busy: boolean
  /** Why the last attempt was refused; the dialog stays open until one goes through. */
  error?: unknown
}) {
  const [description, setDescription] = useState(line?.description ?? '')
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
  const [priceIncludesVat, setPriceIncludesVat] = useState(line?.priceIncludesVat ?? false)
  const [from, setFrom] = useState(line?.serviceDateFrom ?? '')
  const [to, setTo] = useState(line?.serviceDateTo ?? '')

  const count = parseDecimal(quantity)
  const price = parseDecimal(unitPrice)
  const problems = lineProblems({ quantity, unitPrice, discount })
  const incomplete = description.trim() === '' || hasProblem(problems)

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
          <Button
            busy={busy}
            disabled={incomplete}
            onClick={() =>
              onSubmit({
                description: description.trim(),
                quantity: count ?? 1,
                unit,
                unitPrice: price ?? 0,
                ...discountPayload(discount),
                vatCategory,
                priceIncludesVat,
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
        <TextField
          label="Bezeichnung"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          className="sm:col-span-2"
        />
        <TextField
          label="Menge"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          inputMode="decimal"
          numeric
          invalid={problems.quantity !== undefined}
          hint={problems.quantity}
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
          onChange={(event) => setUnitPrice(event.target.value)}
          inputMode="decimal"
          numeric
          invalid={problems.unitPrice !== undefined}
          hint={problems.unitPrice}
        />

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <DiscountPair
            fields={discount}
            onChange={setDiscount}
            percentProblem={problems.percent}
            amountProblem={problems.amount}
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

      <CheckboxField
        label="Preis versteht sich inklusive MwSt"
        checked={priceIncludesVat}
        onChange={(event) => setPriceIncludesVat(event.target.checked)}
        className="mt-5"
      />

      <MoreDetails defaultOpen={from !== '' || to !== ''}>
        <ServiceDateFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </MoreDetails>
    </Dialog>
  )
}
