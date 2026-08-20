import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
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
import type { Product, ProductType, VatCategory, VatRates } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { ProductGroupPrices } from './product/ProductGroupPrices'
import {
  activeChanged,
  emptyProduct,
  firstComplaint,
  toForm,
  toPayload,
  type ProductForm,
} from './product/productForm'

/** Where a product mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/produkte', label: 'Produkte' }

type Register = 'hauptdaten' | 'preise' | 'buchhaltung'

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'hauptdaten', label: 'Hauptdaten' },
  { id: 'preise', label: 'Preise' },
  { id: 'buchhaltung', label: 'Buchhaltung' },
]

/** One article of the catalogue, with the prices of every price group. */
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
  const [tab, setTab] = useState<Register>('hauptdaten')
  const [complaint, setComplaint] = useState<string | null>(null)

  const set = <K extends keyof ProductForm>(field: K, value: ProductForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const vatRates = useQuery({
    queryKey: ['vat-rates', tenantId],
    queryFn: () => api.get<VatRates>(`/api/tenants/${tenantId}/vat-rates`),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['products', tenantId] })
  }

  const base = `/api/tenants/${tenantId}/products`

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form)
      const saved = product
        ? await api.put<Product>(`${base}/${product.id}`, payload)
        : await api.post<Product>(base, payload)
      // Whether the article is still offered has its own endpoint, so it travels in its own
      // request — and only when the checkbox really differs from what is stored.
      if (activeChanged(form, product)) {
        return api.put<Product>(`${base}/${saved.id}/active`, { active: form.active })
      }
      return saved
    },
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // The entry is replaced instead of pushed: a mask that has been saved is not a place to
    // return to with the back button. Prices per price group are agreed on the stored record,
    // which is reached again from the list.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const submit = () => {
    const problem = firstComplaint(form)
    setComplaint(problem)
    if (!problem) save.mutate()
  }

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
          <Button onClick={submit} busy={save.isPending}>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Tabs tabs={REGISTERS} active={tab} onChange={setTab} label="Register" />

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
                onChange={(code) => set('productType', code as ProductType)}
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
          <div className="grid gap-6">
            <Panel title="Grundpreis">
              <TextField
                label="Grundpreis"
                value={form.basePrice}
                onChange={(event) => set('basePrice', event.target.value)}
                disabled={!mayWrite}
                inputMode="decimal"
                numeric
                hint="Gilt, wenn weder Kundenpreis noch Preisgruppe etwas anderes sagt."
                className="sm:max-w-[240px]"
              />
            </Panel>

            {product ? (
              <ProductGroupPrices tenantId={tenantId} product={product} mayWrite={mayWrite} />
            ) : (
              <Panel title="Preise je Gruppe">
                <p className="text-[13px] text-text-secondary">
                  Gruppenpreise lassen sich vereinbaren, sobald das Produkt gespeichert ist.
                </p>
              </Panel>
            )}
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
