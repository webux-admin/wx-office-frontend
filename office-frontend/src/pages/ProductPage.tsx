import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatPercent, parseDecimal } from '../lib/format'
import { originOf, type Origin } from '../lib/origin'
import type { GroupPrice, PriceGroup, Product, ProductType, VatCategory, VatRates } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'

/** Where a product mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/produkte', label: 'Produkte' }

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

type ProductForm = {
  productNumber: string
  productType: ProductType
  name: string
  description: string
  unit: string
  revenueAccount: string
  vatCategory: VatCategory
  basePrice: string
}

function ProductMask({ tenantId, product }: { tenantId: number; product: Product | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('PRODUCT_WRITE')

  const [form, setForm] = useState<ProductForm>({
    productNumber: product?.productNumber ?? '',
    productType: product?.productType ?? 'GOODS',
    name: product?.name ?? '',
    description: product?.description ?? '',
    // Empty, not a code: the dropdown fills it with what this tenant marked as its default.
    unit: product?.unit ?? '',
    revenueAccount: product?.revenueAccount ?? '',
    vatCategory: product?.vatCategory ?? 'STANDARD',
    basePrice: product?.basePrice?.toString() ?? '',
  })
  const [complaint, setComplaint] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState(false)

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

  const payload = (): Partial<Product> => ({
    // An emptied field clears the stored number: it is left out of the payload, and the update
    // applies what the payload says instead of keeping what is stored. That is wanted here —
    // the number belongs to the operator, and no range hands out a new one.
    productNumber: form.productNumber.trim() || undefined,
    productType: form.productType,
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    unit: form.unit,
    revenueAccount: form.revenueAccount.trim() || undefined,
    vatCategory: form.vatCategory,
    basePrice: parseDecimal(form.basePrice) ?? undefined,
  })

  const save = useMutation({
    mutationFn: () =>
      product
        ? api.put<Product>(`/api/tenants/${tenantId}/products/${product.id}`, payload())
        : api.post<Product>(`/api/tenants/${tenantId}/products`, payload()),
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // The entry is replaced instead of pushed: a mask that has been saved is not a place to
    // return to with the back button. Prices per price group are agreed on the stored record,
    // which is reached again from the list.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const deactivate = useMutation({
    mutationFn: () => api.delete<Product>(`/api/tenants/${tenantId}/products/${product?.id}`),
    onSuccess: () => {
      refresh()
      setDeactivating(false)
    },
  })

  const submit = () => {
    const problem =
      form.name.trim() === ''
        ? 'Ohne Bezeichnung lässt sich nichts speichern.'
        : form.unit === ''
          ? 'Ein Produkt braucht eine Einheit.'
          : null
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
        {product && mayWrite && product.active !== false && can('PRODUCT_DEACTIVATE') && (
          <Button variant="secondary" onClick={() => setDeactivating(true)}>
            Deaktivieren
          </Button>
        )}
        {mayWrite && (
          <Button onClick={submit} busy={save.isPending}>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12 lg:grid-cols-2">
        {(complaint || save.error) && (
          <div className="lg:col-span-2">
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          </div>
        )}

        <Panel title="Stammdaten">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Artikelnummer"
              value={form.productNumber}
              onChange={(event) => set('productNumber', event.target.value)}
              disabled={!mayWrite}
              maxLength={20}
              hint="Muss im Mandanten eindeutig sein. Leer lassen ist erlaubt, vergeben wird keine."
              className="sm:col-span-2"
            />

            <CatalogueSelect
              label="Art"
              tenantId={tenantId}
              catalogue="product-type"
              value={form.productType}
              onChange={(code) => set('productType', code as ProductType)}
              disabled={!mayWrite}
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
              label="Bezeichnung"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              disabled={!mayWrite}
              required
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
          </div>
        </Panel>

        <Panel title="Preis und Steuer">
          <div className="grid gap-4">
            <TextField
              label="Grundpreis"
              value={form.basePrice}
              onChange={(event) => set('basePrice', event.target.value)}
              disabled={!mayWrite}
              inputMode="decimal"
              numeric
              hint="Gilt, wenn weder Kundenpreis noch Preisgruppe etwas anderes sagt."
            />

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

        {product && (
          <div className="lg:col-span-2">
            <GroupPrices tenantId={tenantId} product={product} mayWrite={mayWrite} />
          </div>
        )}
      </div>

      <Dialog
        open={deactivating}
        onClose={() => setDeactivating(false)}
        title="Produkt deaktivieren"
        description="Bestehende Belegzeilen bleiben, das Produkt verschwindet nur aus der Auswahl."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivating(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => deactivate.mutate()} busy={deactivate.isPending}>
              Deaktivieren
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Gelöscht wird nichts. Der Vorgang ist idempotent und lässt sich wiederholen.
        </p>
        {deactivate.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={deactivate.error} />
          </div>
        )}
      </Dialog>
    </>
  )
}

/** What each price group pays for this product; an empty group falls back to the base price. */
function GroupPrices({
  tenantId,
  product,
  mayWrite,
}: {
  tenantId: number
  product: Product
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState('')
  const [price, setPrice] = useState('')

  const groups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['product', tenantId] })

  const setGroupPrice = useMutation({
    mutationFn: (entry: GroupPrice) =>
      api.put<Product>(
        `/api/tenants/${tenantId}/products/${product.id}/prices/${entry.priceGroupId}`,
        entry,
      ),
    onSuccess: () => {
      refresh()
      setPrice('')
    },
  })

  const removeGroupPrice = useMutation({
    mutationFn: (priceGroupId: number) =>
      api.delete<Product>(`/api/tenants/${tenantId}/products/${product.id}/prices/${priceGroupId}`),
    onSuccess: refresh,
  })

  const nameOf = (priceGroupId: number) => {
    const group = groups.data?.find((entry) => entry.id === priceGroupId)
    return group ? `${group.code} · ${group.name}` : `Gruppe ${priceGroupId}`
  }

  const columns: Column<GroupPrice>[] = [
    { key: 'group', header: 'Preisgruppe', render: (entry) => nameOf(entry.priceGroupId) },
    {
      key: 'price',
      header: 'Preis',
      align: 'right',
      width: 'w-[140px]',
      render: (entry) => formatAmount(entry.price),
    },
    {
      key: 'remove',
      header: '',
      width: 'w-[60px]',
      render: (entry) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => removeGroupPrice.mutate(entry.priceGroupId)}
            aria-label={`Preis für ${nameOf(entry.priceGroupId)} entfernen`}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-danger/12 hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        ) : null,
    },
  ]

  const amount = parseDecimal(price)

  return (
    <Panel title="Preise je Gruppe" padded={false}>
      <DataTable
        columns={columns}
        rows={product.groupPrices ?? []}
        keyOf={(entry) => entry.priceGroupId}
        error={removeGroupPrice.error}
        empty={
          <EmptyState
            title="Keine Gruppenpreise"
            description="Jede Preisgruppe zahlt derzeit den Grundpreis."
          />
        }
      />

      {mayWrite && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (selected === '' || amount === null) return
            setGroupPrice.mutate({ priceGroupId: Number(selected), price: amount })
          }}
          className="flex flex-wrap items-end gap-3 border-t border-line-subtle px-5 py-4"
        >
          <SelectField
            label="Preisgruppe"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={groups.isPending}
            className="min-w-[220px] flex-1"
          >
            <option value="">Bitte wählen</option>
            {(groups.data ?? []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.code} · {group.name}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Preis"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
            numeric
            className="w-[150px]"
          />

          <Button
            type="submit"
            busy={setGroupPrice.isPending}
            disabled={selected === '' || amount === null}
          >
            Übernehmen
          </Button>

          {setGroupPrice.error !== null && (
            <div className="w-full">
              <ErrorNotice error={setGroupPrice.error} />
            </div>
          )}
        </form>
      )}
    </Panel>
  )
}
