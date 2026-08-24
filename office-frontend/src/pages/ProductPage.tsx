import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { CheckboxField } from '../components/CheckboxField'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatPercent } from '../lib/format'
import { originOf, type Origin } from '../lib/origin'
import type {
  Product,
  ProductFreeFieldDefinition,
  ProductTracking,
  ProductType,
  VatCategory,
  VatRates,
} from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { ProductFreeFields } from './product/ProductFreeFields'
import { ProductPrices } from './product/ProductPrices'
import { ProductStock } from './product/ProductStock'
import {
  firstPriceComplaint,
  pricesChanged,
  toPricePayload,
  toPriceRowForm,
  type PriceRowForm,
} from './product/priceRows'
import {
  activeChanged,
  emptyProduct,
  firstComplaint,
  toForm,
  toPayload,
  applyProductType,
  applyStockManaged,
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

function ProductMask({ tenantId, product }: { tenantId: number; product: Product | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('PRODUCT_WRITE')
  // Taking an article out of the catalogue is its own right, so the checkbox needs both.
  const mayChangeActive = mayWrite && can('PRODUCT_DEACTIVATE')

  const [form, setForm] = useState<ProductForm>(product ? toForm(product) : emptyProduct())
  // The price rows live next to the mask rather than inside it: they travel in their own
  // request, and the master data payload must not be able to carry them.
  const [prices, setPrices] = useState<PriceRowForm[]>(toPriceRowForm(product))
  // Saving a new article is two requests. If the second one fails the article already exists,
  // so a second attempt must correct it instead of creating it again — the number would be
  // taken by the article the first attempt left behind.
  const createdId = useRef<number | null>(null)
  const [tab, setTab] = useState<Register>('hauptdaten')
  const [complaint, setComplaint] = useState<string | null>(null)

  const set = <K extends keyof ProductForm>(field: K, value: ProductForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const vatRates = useQuery({
    queryKey: ['vat-rates', tenantId],
    queryFn: () => api.get<VatRates>(`/api/tenants/${tenantId}/vat-rates`),
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

  // Two registers appear only where there is something in them: the stock, which a session
  // without INVENTORY_READ has no business seeing, and the free fields of a tenant that
  // defined none.
  const registers = [
    ...REGISTERS,
    ...(can('INVENTORY_READ') ? [{ id: 'lager' as const, label: 'Lager' }] : []),
    ...(freeFields.length === 0 ? [] : [{ id: 'freifelder' as const, label: 'Freifelder' }]),
  ]

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['products', tenantId] })
  }

  const base = `/api/tenants/${tenantId}/products`

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form, freeFields)
      const known = product?.id ?? createdId.current
      let saved =
        known === null
          ? await api.post<Product>(base, payload)
          : await api.put<Product>(`${base}/${known}`, payload)
      createdId.current = saved.id
      // The prices replace the stored list in one request of their own, so that a mask which
      // never opened the register cannot drop them and two rows of one period can be checked
      // against each other. Sent only when the table really differs from what is stored.
      if (pricesChanged(prices, product)) {
        saved = await api.put<Product>(`${base}/${saved.id}/prices`, {
          prices: toPricePayload(prices),
        })
      }
      // Whether the article is still offered has its own endpoint, so it travels in its own
      // request — and only when the checkbox really differs from what is stored.
      if (activeChanged(form, product)) {
        return api.put<Product>(`${base}/${saved.id}/active`, { active: form.active })
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

  const submit = () => {
    const problem = firstComplaint(form) ?? firstPriceComplaint(prices)
    setComplaint(problem)
    if (!problem) save.mutate()
  }

  // Ctrl+S and Ctrl+Enter do what the primary button does, so a mask can be
  // filled in and finished without reaching for the mouse.
  useSubmitShortcut(mayWrite && !save.isPending ? submit : undefined)

  const rate = vatRates.data?.[form.vatCategory]

  return (
    <>
      <PageHeader
        title={product ? product.name : 'Neues Produkt'}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          product ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px]">{product.productNumber ?? 'ohne Nummer'}</span>
              {product.active === false && <Badge tone="muted">Deaktiviert</Badge>}
            </span>
          ) : (
            'Die Artikelnummer wird hier vergeben; das Backend erzeugt keine.'
          )
        }
      >
        {mayWrite && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Tabs tabs={registers} active={tab} onChange={setTab} label="Register" />

        {(complaint !== null || save.error !== null) && (
          <div className="mb-6">
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          </div>
        )}

        {tab === 'hauptdaten' && (
          <Panel title="Stammdaten">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Artikelnummer"
                value={form.productNumber}
                onChange={(event) => set('productNumber', event.target.value)}
                disabled={!mayWrite}
                maxLength={20}
                hint="Muss im Mandanten eindeutig sein. Leer lassen ist erlaubt, vergeben wird keine."
              />

              <CatalogueSelect
                label="Art"
                tenantId={tenantId}
                catalogue="product-type"
                value={form.productType}
                // Through applyProductType, because a service carries no stock: the mask
                // must not hold a state the server refuses afterwards.
                onChange={(code) => setForm((current) =>
                  applyProductType(current, code as ProductType))}
                disabled={!mayWrite}
              />

              <TextField
                label="Bezeichnung"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                disabled={!mayWrite}
                required
                maxLength={140}
                className="sm:col-span-2"
              />

              <TextField
                label="Untertitel"
                value={form.subtitle}
                onChange={(event) => set('subtitle', event.target.value)}
                disabled={!mayWrite}
                maxLength={140}
                hint="Zweite Zeile unter der Bezeichnung. Wird gedruckt."
                className="sm:col-span-2"
              />

              <TextAreaField
                label="Beschreibung"
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                disabled={!mayWrite}
                className="sm:col-span-2"
                placeholder="Erscheint als Text der Belegzeile."
              />

              <TextAreaField
                label="Kommentar"
                value={form.internalComment}
                onChange={(event) => set('internalComment', event.target.value)}
                disabled={!mayWrite}
                className="sm:col-span-2"
                hint="Nur für den internen Gebrauch. Erscheint auf keinem Beleg."
              />

              <MasterDataSelect
                label="Einheit"
                tenantId={tenantId}
                list="units"
                value={form.unit}
                storedLabel={product?.unitLabel}
                onChange={(code) => set('unit', code)}
                disabled={!mayWrite}
              />

              <TextField
                label="EAN-Code"
                value={form.eanCode}
                onChange={(event) => set('eanCode', event.target.value)}
                disabled={!mayWrite}
                inputMode="numeric"
                maxLength={20}
                hint="8, 12, 13 oder 14 Ziffern. Die Prüfziffer wird beim Speichern geprüft."
              />

              <CheckboxField
                label="Rabattfähig"
                checked={form.discountable}
                onChange={(event) => set('discountable', event.target.checked)}
                disabled={!mayWrite}
                hint="Aus heisst: eine Belegzeile mit diesem Produkt nimmt keinen Rabatt an."
              />

              <CheckboxField
                label="Aktiv"
                checked={form.active}
                onChange={(event) => set('active', event.target.checked)}
                disabled={!mayChangeActive}
                hint={
                  mayChangeActive
                    ? 'Aus heisst: nicht mehr zur Auswahl. Bestehende Belegzeilen bleiben, gelöscht wird nichts.'
                    : 'Dafür fehlt das Recht, ein Produkt zu deaktivieren.'
                }
              />
            </div>
          </Panel>
        )}

        {tab === 'preise' && (
          <ProductPrices
            tenantId={tenantId}
            rows={prices}
            onChange={setPrices}
            mayWrite={mayWrite}
          />
        )}

        {tab === 'freifelder' && (
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

        {tab === 'lager' && (
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
                hint={
                  form.productType === 'SERVICE'
                    ? 'Dienstleistungen werden nicht im Lager geführt.'
                    : 'Ohne Haken entsteht für dieses Produkt keine Bewegung und kein Bestand.'
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
                  onChange={(code) => set('tracking', code as ProductTracking)}
                  disabled={!mayWrite}
                  hint="Chargen führen Lose, Seriennummern eine Zeile je Stück."
                />
              )}

              {form.stockManaged && (
                <TextField
                  label="Mindestbestand"
                  value={form.minimumQuantity}
                  onChange={(event) => set('minimumQuantity', event.target.value)}
                  disabled={!mayWrite}
                  inputMode="decimal"
                  numeric
                  hint="Leer heisst: keine Überwachung."
                />
              )}
            </div>
          </Panel>
        )}

        {/* Only for an article that is saved and followed: a new one has no stock, and one
            without the flag has none by definition. */}
        {tab === 'lager' && product !== null && form.stockManaged && (
          <div className="mt-6">
            <ProductStock tenantId={tenantId} product={product} />
          </div>
        )}

        {tab === 'buchhaltung' && (
          <Panel title="Steuer und Konto">
            <div className="grid gap-4 sm:grid-cols-2">
              <CatalogueSelect
                label="MwSt-Behandlung"
                tenantId={tenantId}
                catalogue="vat-category"
                value={form.vatCategory}
                onChange={(code) => set('vatCategory', code as VatCategory)}
                disabled={!mayWrite}
                hint={
                  rate === undefined
                    ? 'Den Satz zum Leistungsdatum bestimmt das Backend.'
                    : `Aktueller Satz: ${formatPercent(rate)}`
                }
              />

              <MasterDataSelect
                label="Ertragskonto"
                tenantId={tenantId}
                list="revenue-accounts"
                value={form.revenueAccount}
                storedLabel={product?.revenueAccountLabel}
                onChange={(code) => set('revenueAccount', code)}
                disabled={!mayWrite}
                emptyLabel="Konto des Mandanten"
                hint="Leer heisst: das Konto aus den Mandanteneinstellungen gilt."
              />
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
