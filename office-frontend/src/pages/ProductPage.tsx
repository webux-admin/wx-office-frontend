import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { FactList, type Fact } from '../components/FactList'
import { FormMask } from '../components/FormMask'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { Panel } from '../components/Panel'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useChangeTracker } from '../components/useChangeTracker'
import { useFieldErrors } from '../components/useFieldErrors'
import { useAuth } from '../auth/useAuth'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS } from '../lib/accounting'
import { INVENTORY_MODULE } from '../lib/inventory'
import { useRunsModule } from '../lib/modules'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatPercent } from '../lib/format'
import { isToldByFields } from '../lib/fieldErrors'
import { originOf, type Origin } from '../lib/origin'
import type {
  PriceGroup,
  Product,
  ProductFreeFieldDefinition,
  ProductTracking,
  ProductType,
  VatCategory,
  VatRates,
} from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { AccountSelect } from './accounting/AccountSelect'
import { ProductFreeFields } from './product/ProductFreeFields'
import { ProductPrices } from './product/ProductPrices'
import { ProductStock } from './product/ProductStock'
import {
  pricesChanged,
  priceFieldErrors,
  priceRowsOfAmounts,
  toPricePayload,
  toPriceRowForm,
  type PriceRowForm,
} from './product/priceRows'
import {
  activeChanged,
  applyProductType,
  applyStockManaged,
  emptyProduct,
  productFieldErrors,
  toForm,
  toPayload,
  type ProductForm,
} from './product/productForm'

/** Where a product mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/produkte', label: 'Produkte' }

type Register = 'hauptdaten' | 'preise' | 'buchhaltung' | 'lager' | 'freifelder'

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'hauptdaten', label: 'Hauptdaten' },
  { id: 'preise', label: 'Preise' },
  { id: 'buchhaltung', label: 'Buchhaltung' },
]

/**
 * Every field name the mask draws a message under. A refusal that names only these is shown at
 * its fields; anything else stays in a notice above the form.
 *
 * <p>The stock flag is not here on purpose: its checkbox cannot carry a message, so a refusal
 * about it goes to the notice instead of vanishing.
 */
const SHOWN_FIELDS = [
  'name',
  'unit',
  'productNumber',
  'productType',
  'subtitle',
  'eanCode',
  'vatCategory',
  'tracking',
  'minimumQuantity',
  'prices',
  'prices.price',
  'prices.minQuantity',
  'prices.validTo',
]

/** The price table has one message; a refusal names it under one of these keys. */
const PRICE_TABLE_KEYS = ['prices', 'prices.price', 'prices.minQuantity', 'prices.validTo']

/** One article of the catalogue, with its prices per group, quantity and period. */
export function ProductPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <ProductLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ProductLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()
  const creating = id === 'neu'

  const product = useQuery({
    queryKey: ['product', tenantId, id],
    queryFn: () => api.get<Product>(`/api/tenants/${tenantId}/products/${id}`),
    enabled: !creating,
  })

  if (creating) return <ProductMask tenantId={tenantId} product={null} />
  if (product.isPending) return <LoadingBlock label="Produkt wird geladen" />
  if (product.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={product.error} />
      </div>
    )
  }
  return <ProductMask key={product.data.id} tenantId={tenantId} product={product.data} />
}

/**
 * The mask of one article.
 *
 * <p>A new article shows only what it needs to exist: the master data and one price per price
 * group. Everything else waits for the stored article, which opens with its registers
 * (ADR-0059). The two are saved differently: a new article goes in one request, prices
 * included; a stored one updates its master data, and its price table and active flag each in
 * their own request, only where they changed.
 */
function ProductMask({ tenantId, product }: { tenantId: number; product: Product | null }) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const creating = product === null
  const mayWrite = can('PRODUCT_WRITE')
  // Taking an article out of the catalogue is its own right, so the checkbox needs both.
  const mayChangeActive = mayWrite && can('PRODUCT_DEACTIVATE')

  const [form, setForm] = useState<ProductForm>(product ? toForm(product) : emptyProduct())
  // The price rows live next to the mask rather than inside it: a stored article sends them in
  // their own request, and the master data payload must not be able to carry them.
  const [prices, setPrices] = useState<PriceRowForm[]>(toPriceRowForm(product))
  // A new article takes one amount per price group. The base price has the empty key.
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<Register>('hauptdaten')
  const { changed, track } = useChangeTracker()

  const base = `/api/tenants/${tenantId}/products`

  const vatRates = useQuery({
    queryKey: ['vat-rates', tenantId],
    queryFn: () => api.get<VatRates>(`/api/tenants/${tenantId}/vat-rates`),
  })

  const groups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  // What the free fields of this tenant mean. Read here rather than taken from the product,
  // because a new article carries none yet and its mask has to show them all the same.
  const freeFieldDefinitions = useQuery({
    queryKey: ['product-free-fields', tenantId],
    queryFn: () =>
      api.get<ProductFreeFieldDefinition[]>(`/api/tenants/${tenantId}/product-free-fields`),
  })

  // Only the ones the tenant shows. A field switched off keeps its value but leaves the mask.
  const freeFields = (freeFieldDefinitions.data ?? []).filter((field) => field.active !== false)

  // The price rows of what is being saved: the table of a stored article, or the amounts a new
  // one carries.
  const createRows = priceRowsOfAmounts(amounts)
  const rows = creating ? createRows : prices

  // Two registers appear only where there is something in them: the stock, and the free
  // fields of a tenant that defined none.
  //
  // The stock needs BOTH answers. The right says who may look, the switch says whether this
  // tenant keeps stock at all — and a tenant that does not has no stock to show, however
  // many rights the session holds (backend ADR-0060, ADR-0032).
  const registers = [
    ...REGISTERS,
    ...(runs(INVENTORY_MODULE) && can('INVENTORY_READ')
      ? [{ id: 'lager' as const, label: 'Lager' }]
      : []),
    ...(freeFields.length === 0 ? [] : [{ id: 'freifelder' as const, label: 'Freifelder' }]),
  ]

  // Whether the revenue account is offered at all. Both answers again, and for the same two
  // reasons as the stock: the chart of accounts is read with `ACCOUNTING_READ`, so a clerk
  // holding only the product rights would be shown a dropdown that answers 403 — and a tenant
  // that keeps no books here has no chart to pick from (backend ADR-0119).
  const showsRevenueAccount = runs(ACCOUNTING_MODULE) && can(ACCOUNTING_RIGHTS.read)

  // Which register is actually shown. Derived rather than corrected in an effect: a register
  // can disappear under the mask — the module gets switched off in another tab, the last free
  // field is deactivated — and a chosen tab that is no longer offered would leave the page
  // blank. Falling back never touches the stored product; only what is drawn.
  const shownTab: Register = registers.some((entry) => entry.id === tab) ? tab : 'hauptdaten'

  const rate = vatRates.data?.[form.vatCategory]

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['products', tenantId] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form, freeFields)
      if (product === null) {
        return api.post<Product>(base, { ...payload, prices: toPricePayload(createRows) })
      }
      let saved = await api.put<Product>(`${base}/${product.id}`, payload)
      if (pricesChanged(prices, product)) {
        saved = await api.put<Product>(`${base}/${product.id}/prices`, {
          prices: toPricePayload(prices),
        })
      }
      // Whether the article is still offered has its own endpoint, so it travels in its own
      // request — and only when the checkbox really differs from what is stored.
      if (activeChanged(form, product)) {
        return api.put<Product>(`${base}/${product.id}/active`, { active: form.active })
      }
      return saved
    },
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // The entry is replaced instead of pushed: a mask that has been saved is not a place to
    // return to with the back button.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const fields = useFieldErrors(
    () => ({ ...productFieldErrors(form), ...priceFieldErrors(rows) }),
    save.error,
  )

  const submit = () => {
    if (fields.check()) save.mutate()
  }

  const priceError = PRICE_TABLE_KEYS.map((key) => fields.errors[key]).find(
    (message) => message !== undefined,
  )

  const told = save.error !== null && isToldByFields(save.error, SHOWN_FIELDS)

  const facts: Fact[] = product
    ? [
        { label: 'Artikelnummer', value: product.productNumber ?? null },
        {
          label: 'Grundpreis',
          value: product.basePrice === undefined ? null : formatAmount(product.basePrice),
        },
        { label: 'Einheit', value: product.unitLabel ?? product.unit },
        { label: 'MwSt-Satz', value: rate === undefined ? null : formatPercent(rate) },
      ]
    : []

  return (
    <FormMask
      title={product ? product.name : 'Neues Produkt'}
      back={{ to: origin.from, label: origin.label }}
      subtitle={
        product ? (
          <span className="flex items-center gap-2">
            <span className="font-mono text-small">{product.productNumber ?? 'ohne Nummer'}</span>
            {product.active === false && <Badge tone="muted">Deaktiviert</Badge>}
          </span>
        ) : (
          'Die Artikelnummer wird hier vergeben; das Backend erzeugt keine.'
        )
      }
      actions={
        mayWrite && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )
      }
      summary={product ? <FactList facts={facts} /> : undefined}
      tabs={product ? { items: registers, active: shownTab, onChange: setTab } : undefined}
      dirty={changed}
      onSubmit={mayWrite && !save.isPending ? submit : undefined}
    >
      <div {...track} className="grid gap-6">
        {save.error !== null && !told && <ErrorNotice error={save.error} />}

        {creating && (
          <>
            <Panel title="Stammdaten">
              <div className="grid gap-4 sm:grid-cols-2">
                <MainDataFields
                  tenantId={tenantId}
                  form={form}
                  setForm={setForm}
                  mayWrite={mayWrite}
                  errors={fields.errors}
                />
                <VatField
                  tenantId={tenantId}
                  form={form}
                  setForm={setForm}
                  mayWrite={mayWrite}
                  error={fields.errors.vatCategory}
                  rate={rate}
                />
              </div>
            </Panel>

            <Panel
              title="Preise"
              description="Ein Preis je Preisgruppe. Staffeln und Zeiträume erfassen Sie nach dem Speichern im Register Preise."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <AmountField
                  label="Grundpreis"
                  amountKey=""
                  amounts={amounts}
                  setAmounts={setAmounts}
                  disabled={!mayWrite}
                  error={priceError}
                  tooltip="Gilt für alle Kunden ohne Preisgruppe."
                />
                {(groups.data ?? [])
                  .filter((group) => group.active !== false)
                  .map((group) => (
                    <AmountField
                      key={group.id}
                      label={`${group.code} · ${group.name}`}
                      amountKey={String(group.id)}
                      amounts={amounts}
                      setAmounts={setAmounts}
                      disabled={!mayWrite}
                      tooltip={group.description}
                    />
                  ))}
              </div>
            </Panel>
          </>
        )}

        {!creating && shownTab === 'hauptdaten' && (
          <Panel title="Stammdaten">
            <div className="grid gap-4 sm:grid-cols-2">
              <MainDataFields
                tenantId={tenantId}
                form={form}
                setForm={setForm}
                mayWrite={mayWrite}
                errors={fields.errors}
                storedUnitLabel={product?.unitLabel}
              />

              <TextField
                label="Untertitel"
                value={form.subtitle}
                onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
                disabled={!mayWrite}
                maxLength={140}
                error={fields.errors.subtitle}
                tooltip="Steht auf dem Beleg unter der Bezeichnung."
                className="sm:col-span-2"
              />

              <TextAreaField
                label="Beschreibung"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                disabled={!mayWrite}
                className="sm:col-span-2"
                placeholder="Erscheint als Text der Belegzeile."
              />

              <TextAreaField
                label="Kommentar"
                value={form.internalComment}
                onChange={(event) =>
                  setForm((current) => ({ ...current, internalComment: event.target.value }))}
                disabled={!mayWrite}
                className="sm:col-span-2"
                tooltip="Nur intern. Erscheint auf keinem Beleg."
              />

              <TextField
                label="EAN-Code"
                value={form.eanCode}
                onChange={(event) => setForm((current) => ({ ...current, eanCode: event.target.value }))}
                disabled={!mayWrite}
                inputMode="numeric"
                maxLength={20}
                error={fields.errors.eanCode}
                tooltip="8, 12, 13 oder 14 Ziffern. Die Prüfziffer wird beim Speichern geprüft."
              />

              <CheckboxField
                label="Rabattfähig"
                checked={form.discountable}
                onChange={(event) =>
                  setForm((current) => ({ ...current, discountable: event.target.checked }))}
                disabled={!mayWrite}
                tooltip="Aus: Belegzeilen mit diesem Produkt bekommen keinen Rabatt."
              />

              <CheckboxField
                label="Aktiv"
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({ ...current, active: event.target.checked }))}
                disabled={!mayChangeActive}
                tooltip={
                  mayChangeActive
                    ? 'Aus: nicht mehr zur Auswahl. Bestehende Belegzeilen bleiben.'
                    : 'Dafür fehlt das Recht, ein Produkt zu deaktivieren.'
                }
              />
            </div>
          </Panel>
        )}

        {!creating && shownTab === 'preise' && (
          <ProductPrices
            tenantId={tenantId}
            rows={prices}
            onChange={setPrices}
            mayWrite={mayWrite}
            error={priceError}
          />
        )}

        {!creating && shownTab === 'freifelder' && (
          <ProductFreeFields
            fields={freeFields}
            values={form.freeFields}
            onChange={(code, value) =>
              setForm((current) => ({
                ...current,
                freeFields: { ...current.freeFields, [code]: value },
              }))
            }
            disabled={!mayWrite}
          />
        )}

        {!creating && shownTab === 'lager' && (
          <Panel
            title="Einrichtung"
            description="Ob und wie genau der Bestand dieses Produkts geführt wird."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField
                label="Im Lager führen"
                checked={form.stockManaged}
                onChange={(event) =>
                  setForm((current) => applyStockManaged(current, event.target.checked))}
                disabled={!mayWrite || form.productType === 'SERVICE'}
                tooltip={
                  form.productType === 'SERVICE'
                    ? 'Dienstleistungen werden nicht im Lager geführt.'
                    : 'Ohne Haken entsteht für dieses Produkt kein Bestand.'
                }
                className="items-center"
              />

              {/* Both only once the flag is set: they mean nothing without it, and an empty
                  field that does nothing is worse than a field that is not there. */}
              {form.stockManaged && (
                <CatalogueSelect
                  label="Nachverfolgung"
                  tenantId={tenantId}
                  catalogue="product-tracking"
                  value={form.tracking}
                  onChange={(code) => setForm((current) => ({ ...current, tracking: code as ProductTracking }))}
                  disabled={!mayWrite}
                  error={fields.errors.tracking}
                  tooltip="Chargen führen Lose, Seriennummern eine Zeile je Stück."
                />
              )}

              {form.stockManaged && (
                <TextField
                  label="Mindestbestand"
                  value={form.minimumQuantity}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, minimumQuantity: event.target.value }))}
                  disabled={!mayWrite}
                  inputMode="decimal"
                  numeric
                  error={fields.errors.minimumQuantity}
                  tooltip="Leer: keine Überwachung."
                />
              )}
            </div>
          </Panel>
        )}

        {/* Only for an article that is saved and followed: a new one has no stock, and one
            without the flag has none by definition. */}
        {!creating && shownTab === 'lager' && product !== null && form.stockManaged && (
          <ProductStock tenantId={tenantId} product={product} />
        )}

        {!creating && shownTab === 'buchhaltung' && (
          <Panel title="Steuer und Konto">
            <div className="grid gap-4 sm:grid-cols-2">
              <VatField
                tenantId={tenantId}
                form={form}
                setForm={setForm}
                mayWrite={mayWrite}
                error={fields.errors.vatCategory}
                rate={rate}
              />

              {/* Hidden, never emptied: `form.revenueAccount` still carries what the product
                  stored, and `toPayload` sends it back untouched. A payload without
                  `revenueAccount` clears the stored account, so a clerk without a bookkeeping
                  right would otherwise wipe it off every article they correct. */}
              {showsRevenueAccount && (
                <AccountSelect
                  label="Ertragskonto"
                  tenantId={tenantId}
                  value={form.revenueAccount}
                  onChange={(code) => setForm((current) => ({ ...current, revenueAccount: code }))}
                  disabled={!mayWrite}
                  emptyLabel="Konto des Mandanten"
                  tooltip="Leer: das Konto aus den Mandanteneinstellungen gilt."
                />
              )}
            </div>
          </Panel>
        )}
      </div>
    </FormMask>
  )
}

/** What the mask needs from its form to draw and change the shared fields. */
type FormFieldsProps = {
  tenantId: number
  form: ProductForm
  setForm: Dispatch<SetStateAction<ProductForm>>
  mayWrite: boolean
}

/**
 * The fields every article has: its kind, number, name and unit.
 *
 * <p>Drawn by both the mask of a new article and the stored one, so they stay the same
 * wherever they appear.
 */
function MainDataFields({
  tenantId,
  form,
  setForm,
  mayWrite,
  errors,
  storedUnitLabel,
}: FormFieldsProps & { errors: Readonly<Record<string, string>>; storedUnitLabel?: string | null }) {
  return (
    <>
      <CatalogueSelect
        label="Art"
        tenantId={tenantId}
        catalogue="product-type"
        value={form.productType}
        // Through applyProductType, because a service carries no stock: the mask must not hold
        // a state the server refuses afterwards.
        onChange={(code) => setForm((current) => applyProductType(current, code as ProductType))}
        disabled={!mayWrite}
        required
        error={errors.productType}
      />

      <TextField
        label="Artikelnummer"
        value={form.productNumber}
        onChange={(event) => setForm((current) => ({ ...current, productNumber: event.target.value }))}
        disabled={!mayWrite}
        maxLength={20}
        error={errors.productNumber}
        tooltip="Eindeutig im Mandanten. Leer lassen heisst: keine Nummer."
      />

      <TextField
        label="Bezeichnung"
        value={form.name}
        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        disabled={!mayWrite}
        required
        maxLength={140}
        error={errors.name}
        className="sm:col-span-2"
      />

      <MasterDataSelect
        label="Einheit"
        tenantId={tenantId}
        list="units"
        value={form.unit}
        storedLabel={storedUnitLabel}
        onChange={(code) => setForm((current) => ({ ...current, unit: code }))}
        disabled={!mayWrite}
        required
        error={errors.unit}
      />
    </>
  )
}

/**
 * The tax treatment of the article, with the rate the date of supply gives it today.
 *
 * <p>The rate is shown, not chosen: the backend takes the rate of the date of supply, and the
 * mask only says which one that is at the moment.
 */
function VatField({
  tenantId,
  form,
  setForm,
  mayWrite,
  error,
  rate,
}: FormFieldsProps & { error?: string; rate: number | undefined }) {
  return (
    <CatalogueSelect
      label="MwSt-Behandlung"
      tenantId={tenantId}
      catalogue="vat-category"
      value={form.vatCategory}
      onChange={(code) => setForm((current) => ({ ...current, vatCategory: code as VatCategory }))}
      disabled={!mayWrite}
      error={error}
      hint={
        rate === undefined
          ? 'Den Satz zum Leistungsdatum bestimmt das Backend.'
          : `Aktueller Satz: ${formatPercent(rate)}`
      }
    />
  )
}

/**
 * One amount of the price panel of a new article, keyed by its price group.
 *
 * <p>The key is the group id, or the empty string for the base price, the same key
 * {@link priceRowsOfAmounts} reads.
 */
function AmountField({
  label,
  amountKey,
  amounts,
  setAmounts,
  disabled,
  error,
  tooltip,
}: {
  label: string
  amountKey: string
  amounts: Readonly<Record<string, string>>
  setAmounts: Dispatch<SetStateAction<Record<string, string>>>
  disabled: boolean
  error?: string
  tooltip?: string
}) {
  return (
    <TextField
      label={label}
      value={amounts[amountKey] ?? ''}
      onChange={(event) =>
        setAmounts((current) => ({ ...current, [amountKey]: event.target.value }))}
      disabled={disabled}
      inputMode="decimal"
      numeric
      error={error}
      tooltip={tooltip}
    />
  )
}
