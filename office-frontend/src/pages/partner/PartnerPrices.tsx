import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import { formatAmount, formatQuantity, parseDecimal } from '../../lib/format'
import type { Page, PartnerPrice, PriceGroup, Product } from '../../lib/types'

/**
 * The prices agreed with one customer, and the group it buys in.
 *
 * <p>Which group a customer is currently in cannot be shown: the partner endpoint does not
 * report it and pricing has no endpoint that answers it either. The control therefore assigns
 * a group without claiming to know the one in force. Saying so is better than showing a
 * value that was guessed.
 */
export function PartnerPrices({ tenantId, partnerId }: { tenantId: number; partnerId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRODUCT_WRITE')

  const prices = useQuery({
    queryKey: ['partner-prices', tenantId, partnerId],
    queryFn: () => api.get<PartnerPrice[]>(`/api/tenants/${tenantId}/partners/${partnerId}/prices`),
  })

  // A picker wants every entry, not a page, so it asks for the largest page the server
  // allows. Beyond that a dropdown is the wrong control anyway and this needs a type-ahead.
  const productQuery = listQuery({ activeOnly: true, size: PICKER_SIZE })
  const products = useQuery({
    queryKey: ['products', tenantId, productQuery],
    queryFn: () => api.get<Page<Product>>(`/api/tenants/${tenantId}/products?${productQuery}`),
  })

  const priceGroups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['partner-prices', tenantId, partnerId] })

  const setPrice = useMutation({
    mutationFn: (price: PartnerPrice) =>
      api.put<PartnerPrice>(`/api/tenants/${tenantId}/partners/${partnerId}/prices`, price),
    onSuccess: refresh,
  })

  const removePrice = useMutation({
    mutationFn: (productId: number) =>
      api.delete<void>(`/api/tenants/${tenantId}/partners/${partnerId}/prices/${productId}`),
    onSuccess: refresh,
  })

  const assignGroup = useMutation({
    mutationFn: (priceGroupId: number) =>
      api.put<void>(
        `/api/tenants/${tenantId}/partners/${partnerId}/price-group/${priceGroupId}`,
        undefined,
      ),
  })

  const nameOf = (productId: number) =>
    products.data?.content.find((product) => product.id === productId)?.name ??
    `Produkt ${productId}`

  const columns: Column<PartnerPrice>[] = [
    { key: 'product', header: 'Produkt', render: (price) => nameOf(price.productId) },
    {
      key: 'quantity',
      header: 'Ab Menge',
      align: 'right',
      width: 'w-[120px]',
      render: (price) => formatQuantity(price.minQuantity ?? 1),
    },
    {
      key: 'price',
      header: 'Preis',
      align: 'right',
      width: 'w-[130px]',
      render: (price) => formatAmount(price.price),
    },
    {
      key: 'remove',
      header: '',
      width: 'w-[60px]',
      render: (price) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => removePrice.mutate(price.productId)}
            aria-label={`Preis für ${nameOf(price.productId)} entfernen`}
            className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-danger/12 hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        ) : null,
    },
  ]

  return (
    <div className="grid gap-6">
      <Panel
        title="Preisgruppe"
        description="Ordnet den Kunden einer Gruppe zu. Die aktuell gültige Gruppe liefert die API nicht."
      >
        {mayWrite ? (
          <GroupAssignment
            groups={priceGroups.data ?? []}
            loading={priceGroups.isPending}
            onAssign={(groupId) => assignGroup.mutate(groupId)}
            busy={assignGroup.isPending}
            done={assignGroup.isSuccess}
            error={assignGroup.error}
          />
        ) : (
          <p className="text-[13px] text-text-secondary">
            Zum Ändern der Preisgruppe fehlt das Recht PRODUCT_WRITE.
          </p>
        )}
      </Panel>

      <Panel
        title="Individuelle Preise"
        description="Gelten vor der Preisgruppe und vor dem Grundpreis."
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={prices.data ?? []}
          keyOf={(price) => price.productId}
          loading={prices.isPending}
          error={prices.error}
          empty={
            <EmptyState
              title="Keine eigenen Preise"
              description="Dieser Kunde zahlt, was seine Preisgruppe oder der Grundpreis sagt."
            />
          }
        />

        {removePrice.error !== null && (
          <div className="px-5 pb-4">
            <ErrorNotice error={removePrice.error} />
          </div>
        )}

        {mayWrite && (
          <PriceForm
            products={products.data?.content ?? []}
            onSubmit={(price) => setPrice.mutate(price)}
            busy={setPrice.isPending}
            error={setPrice.error}
          />
        )}
      </Panel>
    </div>
  )
}

function GroupAssignment({
  groups,
  loading,
  onAssign,
  busy,
  done,
  error,
}: {
  groups: PriceGroup[]
  loading: boolean
  onAssign: (priceGroupId: number) => void
  busy: boolean
  done: boolean
  error: unknown
}) {
  const [selected, setSelected] = useState('')

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Preisgruppe"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        disabled={loading}
        className="min-w-[240px] flex-1"
      >
        <option value="">Bitte wählen</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.code} · {group.name}
          </option>
        ))}
      </SelectField>

      <Button onClick={() => onAssign(Number(selected))} busy={busy} disabled={selected === ''}>
        Zuweisen
      </Button>

      {done && !busy && (
        <p role="status" className="text-[12px] text-success">
          Zugewiesen.
        </p>
      )}
      {error !== null && error !== undefined && (
        <div className="w-full">
          <ErrorNotice error={error} />
        </div>
      )}
    </div>
  )
}

function PriceForm({
  products,
  onSubmit,
  busy,
  error,
}: {
  products: Product[]
  onSubmit: (price: PartnerPrice) => void
  busy: boolean
  error: unknown
}) {
  const [productId, setProductId] = useState('')
  const [minQuantity, setMinQuantity] = useState('1')
  const [price, setPrice] = useState('')

  const amount = parseDecimal(price)
  const incomplete = productId === '' || amount === null

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (incomplete) return
        onSubmit({
          productId: Number(productId),
          minQuantity: parseDecimal(minQuantity) ?? undefined,
          price: amount,
        })
        setPrice('')
      }}
      className="flex flex-wrap items-end gap-3 border-t border-line-subtle px-5 py-4"
    >
      <SelectField
        label="Produkt"
        value={productId}
        onChange={(event) => setProductId(event.target.value)}
        className="min-w-[220px] flex-1"
      >
        <option value="">Bitte wählen</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.productNumber ? `${product.productNumber} · ` : ''}
            {product.name}
          </option>
        ))}
      </SelectField>

      <TextField
        label="Ab Menge"
        value={minQuantity}
        onChange={(event) => setMinQuantity(event.target.value)}
        inputMode="decimal"
        numeric
        className="w-[120px]"
      />

      <TextField
        label="Preis"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        inputMode="decimal"
        numeric
        className="w-[140px]"
      />

      <Button type="submit" busy={busy} disabled={incomplete}>
        Übernehmen
      </Button>

      {error !== null && error !== undefined && (
        <div className="w-full">
          <ErrorNotice error={error} />
        </div>
      )}
    </form>
  )
}
