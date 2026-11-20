import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, type Column } from '../../components/DataTable'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { IconButton } from '../../components/IconButton'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import { formatAmount, formatDate, formatQuantity, parseDecimal } from '../../lib/format'
import type { Page, PartnerPrice, PriceGroup, Product } from '../../lib/types'

/**
 * The prices agreed with one customer, and the group it buys in.
 *
 * <p>Built like the addresses and contacts: a table, a button in the header that opens a
 * dialog, a pencil and a bin on each row, and a question before anything is removed.
 *
 * <p>Which group a customer is currently in cannot be shown: the partner endpoint does not
 * report it and pricing has no endpoint that answers it either. The control therefore assigns
 * a group without claiming to know the one in force.
 */
export function PartnerPrices({ tenantId, partnerId }: { tenantId: number; partnerId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRODUCT_WRITE')
  // Holds the price being changed, or an empty object while a new one is entered.
  const [editor, setEditor] = useState<{ price?: PartnerPrice } | null>(null)
  const [removing, setRemoving] = useState<PartnerPrice | null>(null)

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
    onSuccess: () => {
      void refresh()
      setEditor(null)
    },
  })

  const removePrice = useMutation({
    mutationFn: (priceId: number) =>
      api.delete<void>(`/api/tenants/${tenantId}/partners/${partnerId}/prices/${priceId}`),
    onSuccess: () => {
      void refresh()
      setRemoving(null)
    },
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

  // Resetting first, so a dialog does not open showing the error of the last attempt.
  const openEditor = (price?: PartnerPrice) => {
    setPrice.reset()
    setEditor({ price })
  }

  const openRemoval = (price: PartnerPrice) => {
    removePrice.reset()
    setRemoving(price)
  }

  const columns: Column<PartnerPrice>[] = [
    {
      key: 'product',
      header: 'Produkt',
      render: (price) => <span className="font-medium">{nameOf(price.productId)}</span>,
    },
    {
      key: 'quantity',
      header: 'Ab Menge',
      align: 'right',
      width: 'w-column-sm',
      render: (price) => formatQuantity(price.minQuantity ?? 1),
    },
    {
      key: 'validFrom',
      header: 'Gültig ab',
      align: 'right',
      width: 'w-column-sm',
      // formatDate already draws a hyphen for an open start.
      render: (price) => formatDate(price.validFrom),
    },
    {
      key: 'validTo',
      header: 'Gültig bis',
      align: 'right',
      width: 'w-column-sm',
      render: (price) => formatDate(price.validTo),
    },
    {
      key: 'price',
      header: 'Preis',
      align: 'right',
      width: 'w-column-md',
      render: (price) => formatAmount(price.price),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-column-xs',
      render: (price) =>
        mayWrite && price.id !== undefined ? (
          <span className="flex justify-end gap-1">
            <IconButton
              label={`Preis für ${nameOf(price.productId)} bearbeiten`}
              onClick={() => openEditor(price)}
            >
              <Pencil size={14} aria-hidden />
            </IconButton>
            <IconButton
              label={`Preis für ${nameOf(price.productId)} entfernen`}
              onClick={() => openRemoval(price)}
              tone="danger"
            >
              <Trash2 size={14} aria-hidden />
            </IconButton>
          </span>
        ) : null,
    },
  ]

  return (
    <div className="grid gap-6">
      <Panel title="Preisgruppe">
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
          <p className="text-body text-text-secondary">
            Zum Ändern der Preisgruppe fehlt das Recht PRODUCT_WRITE.
          </p>
        )}
      </Panel>

      <Panel
        title="Individuelle Preise"
        padded={false}
        action={
          mayWrite ? (
            <Button variant="secondary" onClick={() => openEditor()}>
              <Plus size={15} aria-hidden />
              Preis
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={prices.data ?? []}
          keyOf={(price) => price.id ?? price.productId}
          loading={prices.isPending}
          error={prices.error}
          onRowOpen={mayWrite ? (price) => openEditor(price) : undefined}
          empty={
            <EmptyState
              title="Keine eigenen Preise"
              description="Dieser Kunde zahlt, was seine Preisgruppe oder der Grundpreis sagt."
            >
              {mayWrite && (
                <Button variant="secondary" onClick={() => openEditor()}>
                  <Plus size={15} aria-hidden />
                  Preis erfassen
                </Button>
              )}
            </EmptyState>
          }
        />
      </Panel>

      <PriceDialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        products={products.data?.content ?? []}
        price={editor?.price}
        onSubmit={(price) => setPrice.mutate(price)}
        busy={setPrice.isPending}
        error={setPrice.error}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Preis entfernen"
        confirmLabel="Entfernen"
        tone="danger"
        onConfirm={() => removing?.id !== undefined && removePrice.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
        busy={removePrice.isPending}
        error={removePrice.error}
      >
        Der Preis für {removing && nameOf(removing.productId)} wird entfernt. Der Kunde zahlt
        danach wieder, was seine Preisgruppe oder der Grundpreis sagt.
      </ConfirmDialog>
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
        className="min-w-column-xl flex-1"
        tooltip="Ordnet den Kunden einer Gruppe zu. Welche Gruppe heute gilt, liefert die API nicht."
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
        <p role="status" className="text-small text-success">
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

/**
 * Agrees a price with the customer, or changes one agreed before.
 *
 * <p>The product of a stored price stays: the backend rewrites a row only within its own
 * product, so another product is a new price.
 */
function PriceDialog({
  open,
  onClose,
  products,
  price,
  onSubmit,
  busy,
  error,
}: {
  open: boolean
  onClose: () => void
  products: Product[]
  /** The stored price being changed; absent while a new one is added. */
  price?: PartnerPrice
  onSubmit: (price: PartnerPrice) => void
  busy: boolean
  error: unknown
}) {
  const [productId, setProductId] = useState('')
  const [minQuantity, setMinQuantity] = useState('1')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [amount, setAmount] = useState('')
  const [edited, setEdited] = useState(price)
  const [wasOpen, setWasOpen] = useState(open)

  // The dialog stays mounted, so it has to forget what was typed the last time it was open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEdited(price)
      setProductId(price ? `${price.productId}` : '')
      setMinQuantity(price ? formatQuantity(price.minQuantity ?? 1) : '1')
      setValidFrom(price?.validFrom ?? '')
      setValidTo(price?.validTo ?? '')
      setAmount(price ? formatAmount(price.price) : '')
    }
  }

  const parsed = parseDecimal(amount)
  const backwards = validFrom !== '' && validTo !== '' && validTo < validFrom
  const incomplete = productId === '' || parsed === null || backwards

  const submit = () => {
    if (incomplete) return
    onSubmit({
      id: edited?.id,
      productId: Number(productId),
      minQuantity: parseDecimal(minQuantity) ?? undefined,
      validFrom: validFrom === '' ? undefined : validFrom,
      validTo: validTo === '' ? undefined : validTo,
      price: parsed,
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edited ? 'Preis bearbeiten' : 'Preis erfassen'}
      onSubmit={busy ? undefined : submit}
      wide
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={busy} disabled={incomplete} shortcut>
            {edited ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Produkt"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          disabled={edited !== undefined}
          required
          className="sm:col-span-2"
          tooltip={
            edited
              ? 'Bleibt fest. Für ein anderes Produkt wird ein neuer Preis erfasst.'
              : undefined
          }
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
          label="Preis"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          numeric
          required
        />

        <TextField
          label="Ab Menge"
          value={minQuantity}
          onChange={(event) => setMinQuantity(event.target.value)}
          inputMode="decimal"
          numeric
          tooltip="Staffelpreis: gilt ab dieser Menge auf einer Position."
        />

        <TextField
          label="Gültig ab"
          value={validFrom}
          onChange={(event) => setValidFrom(event.target.value)}
          type="date"
          tooltip="Ohne Datum gilt der Preis unbefristet."
        />

        <TextField
          label="Gültig bis"
          value={validTo}
          onChange={(event) => setValidTo(event.target.value)}
          type="date"
          error={backwards ? 'Nicht vor dem Ab-Datum.' : undefined}
        />
      </div>

      {error !== null && error !== undefined && (
        <div className="mt-4">
          <ErrorNotice error={error} />
        </div>
      )}
    </Dialog>
  )
}
