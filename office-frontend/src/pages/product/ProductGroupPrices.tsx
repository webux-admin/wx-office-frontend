import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatAmount, parseDecimal } from '../../lib/format'
import type { GroupPrice, PriceGroup, Product } from '../../lib/types'

/**
 * What each price group pays for this product; an empty group falls back to the base price.
 *
 * <p>Every change here is stored at once, through its own endpoint. It does not wait for the
 * save button of the mask: a price agreed with a group is not part of the master data
 * payload, so nothing can silently drop one that is already stored.
 */
export function ProductGroupPrices({
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
