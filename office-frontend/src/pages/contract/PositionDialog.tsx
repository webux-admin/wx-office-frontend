import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { SelectField } from '../../components/SelectField'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { useFieldErrors } from '../../components/useFieldErrors'
import { api } from '../../lib/api'
import {
  BILLING_INTERVAL_LABELS,
  POSITION_DESCRIPTION_MAX_LENGTH,
  POSITION_PRODUCT_NUMBER_MAX_LENGTH,
  POSITION_TITLE_MAX_LENGTH,
  emptyPositionForm,
  isBillingInterval,
  positionComplaints,
  resolvedPriceUrl,
  type PositionForm,
} from '../../lib/contract'
import { parseDecimal } from '../../lib/format'
import type { Product, ResolvedPrice } from '../../lib/types'
import { CatalogueSelect } from '../../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { ProductQuickSearch } from '../document/ProductQuickSearch'
import { useVatText } from '../document/productInfo'

/**
 * Adds a position to a contract, or changes one it already has.
 *
 * <p>Nothing is sent from here: the position goes into the form of the contract and is saved
 * with it. A product taken from the catalogue only fills the fields — what is stored are the
 * values, and every one of them stays free to change (backend ADR-0144).
 */
export function PositionDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  position,
  currency,
  partnerId,
  dateOfSupply,
  mayReadProducts,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (position: PositionForm) => void
  /** The position being changed; absent while a new one is added. */
  position?: PositionForm
  /** The currency the other positions are in, empty while there are none. */
  currency: string
  /** The customer of the contract, empty while none is chosen. */
  partnerId: string
  /** The first day of the contract, which decides the price period; empty for today. */
  dateOfSupply: string
  /** Whether the catalogue may be read; without the right the position is free text only. */
  mayReadProducts: boolean
}) {
  const [form, setForm] = useState(() => position ?? emptyPositionForm(currency))
  const [wasOpen, setWasOpen] = useState(open)
  const { errors, check, reset } = useFieldErrors(() => positionComplaints(form), null)

  // It stays mounted, so it has to forget what was typed the last time it was open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(position ?? emptyPositionForm(currency))
      reset()
    }
  }

  const set = <K extends keyof PositionForm>(field: K, value: PositionForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = () => {
    if (check()) onSubmit(form)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={position ? 'Position bearbeiten' : 'Position hinzufügen'}
      onSubmit={submit}
      wide
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} shortcut>
            {position ? 'Übernehmen' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {mayReadProducts && open && (
          <CatalogueChoice
            tenantId={tenantId}
            partnerId={partnerId}
            dateOfSupply={dateOfSupply}
            quantity={parseDecimal(form.quantity) ?? 1}
            onTake={(taken) => setForm((current) => ({ ...current, ...taken }))}
          />
        )}

        <TextField
          label="Bezeichnung"
          value={form.title}
          onChange={(event) => set('title', event.target.value)}
          maxLength={POSITION_TITLE_MAX_LENGTH}
          required
          error={errors.title}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Produktnummer"
            value={form.productNumber}
            onChange={(event) => set('productNumber', event.target.value)}
            maxLength={POSITION_PRODUCT_NUMBER_MAX_LENGTH}
            error={errors.productNumber}
            tooltip="Ein Wert, kein Verweis: der Vertrag bleibt, wie er ist, wenn das Produkt sich ändert."
          />
          <SelectField
            label="Intervall"
            value={form.interval}
            onChange={(event) => {
              const value = event.target.value
              set('interval', isBillingInterval(value) ? value : '')
            }}
            required
            error={errors.interval}
          >
            {Object.entries(BILLING_INTERVAL_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField
          label="Text"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          maxLength={POSITION_DESCRIPTION_MAX_LENGTH}
          rows={3}
          error={errors.description}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Menge"
            value={form.quantity}
            onChange={(event) => set('quantity', event.target.value)}
            inputMode="decimal"
            numeric
            required
            error={errors.quantity}
            tooltip="Je Intervall."
          />
          <TextField
            label="Einzelpreis"
            value={form.unitPrice}
            onChange={(event) => set('unitPrice', event.target.value)}
            inputMode="decimal"
            numeric
            required
            error={errors.unitPrice}
            tooltip="0.00 ist eine Gratisleistung. Ein Rabatt ist ein tieferer Preis, kein negativer."
          />
          <MasterDataSelect
            label="Währung"
            tenantId={tenantId}
            list="currencies"
            value={form.currency}
            onChange={(code) => set('currency', code)}
            required
            error={errors.currency}
            tooltip="Alle Positionen eines Vertrags lauten auf dieselbe Währung. Ein Preis aus dem Katalog lautet auf die Währung des Mandanten."
          />
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <CatalogueSelect
            label="MwSt-Kategorie"
            tenantId={tenantId}
            catalogue="vat-category"
            value={form.vatCategory}
            onChange={(code) => set('vatCategory', code)}
            required
            error={errors.vatCategory}
            tooltip="Den Satz bestimmt die Rechnung, nach dem Leistungsdatum."
          />
          <CheckboxField
            label="Preis inkl. MWST"
            checked={form.priceIncludesVat}
            onChange={(event) => set('priceIncludesVat', event.target.checked)}
          />
        </div>
      </div>
    </Dialog>
  )
}

/**
 * The catalogue as a source of suggestions: taking a product fills name, number, VAT category
 * and the price this customer pays, and nothing else.
 *
 * <p>The price is the one the product module resolves for the customer — customer price,
 * price group, base price — on the first day of the contract. Without a customer there is no
 * price to resolve, so the field waits for one.
 */
function CatalogueChoice({
  tenantId,
  partnerId,
  dateOfSupply,
  quantity,
  onTake,
}: {
  tenantId: number
  partnerId: string
  dateOfSupply: string
  quantity: number
  onTake: (taken: Partial<PositionForm>) => void
}) {
  const location = useLocation()
  const [term, setTerm] = useState('')
  const [taken, setTaken] = useState(false)
  const [priceMissing, setPriceMissing] = useState(false)
  const { vatOf } = useVatText(tenantId, dateOfSupply)

  if (partnerId === '') {
    return (
      <TextField
        label="Produkt"
        value=""
        onChange={() => {}}
        disabled
        hint="Zuerst den Kunden wählen: sein Preis wird vorgeschlagen."
      />
    )
  }

  const take = async (product: Product) => {
    setTerm(product.productNumber ? `${product.productNumber} · ${product.name}` : product.name)
    setTaken(true)
    setPriceMissing(false)
    onTake({
      title: product.name,
      productNumber: product.productNumber ?? '',
      vatCategory: product.vatCategory ?? 'STANDARD',
    })
    try {
      const price = await api.get<ResolvedPrice>(
        resolvedPriceUrl(tenantId, Number(partnerId), product.id, quantity, dateOfSupply),
      )
      onTake({ unitPrice: String(price.price), priceIncludesVat: price.includesVat })
    } catch {
      setPriceMissing(true)
    }
  }

  return (
    <div className="grid gap-1">
      <ProductQuickSearch
        tenantId={tenantId}
        term={term}
        onTerm={(typed) => {
          setTerm(typed)
          setTaken(false)
        }}
        chosen={taken}
        onChoose={(product) => void take(product)}
        vatOf={vatOf}
        back={{ origin: { from: location.pathname, label: 'Vertrag' } }}
      />
      {priceMissing && (
        <p role="status" className="text-small text-warning">
          Für diesen Kunden ist kein Preis hinterlegt. Den Einzelpreis bitte selbst eintragen.
        </p>
      )}
    </div>
  )
}
