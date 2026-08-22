import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import type { Partner, PartnerAddress } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { AddressDialog } from './AddressDialog'
import { invalidateAfterPartnerChange } from './partnerRefresh'

/**
 * The addresses of one record, with everything the API can do to them: add, replace, remove.
 *
 * <p>Each kind of document goes to at most one address and there is at most one default
 * address. Both rules belong to the backend; its answer is what the dialog shows when a
 * second invoice address is set.
 */
export function PartnerAddresses({
  tenantId,
  partnerId,
  partnerName,
  addresses,
  mayWrite,
}: {
  tenantId: number
  partnerId: number
  /** Prefilled recipient of a new address. */
  partnerName: string
  addresses: PartnerAddress[]
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')
  // Holds the address being changed, or an empty object while a new one is entered.
  const [editor, setEditor] = useState<{ address?: PartnerAddress } | null>(null)
  const [removing, setRemoving] = useState<PartnerAddress | null>(null)

  const base = `/api/tenants/${tenantId}/partners/${partnerId}/addresses`

  const refresh = () => invalidateAfterPartnerChange(queryClient, tenantId)

  const save = useMutation({
    mutationFn: (entry: PartnerAddress) => {
      const known = editor?.address?.id
      return known === undefined
        ? api.post<Partner>(base, entry)
        : api.put<Partner>(`${base}/${known}`, entry)
    },
    onSuccess: () => {
      refresh()
      setEditor(null)
    },
  })

  const remove = useMutation({
    mutationFn: (addressId: number) => api.delete<Partner>(`${base}/${addressId}`),
    onSuccess: () => {
      refresh()
      setRemoving(null)
    },
  })

  // Resetting first, so a dialog does not open showing the error of the last attempt.
  const openEditor = (address?: PartnerAddress) => {
    save.reset()
    setEditor({ address })
  }

  const openRemoval = (address: PartnerAddress) => {
    remove.reset()
    setRemoving(address)
  }

  const columns: Column<PartnerAddress>[] = [
    {
      key: 'label',
      header: 'Bezeichnung',
      width: 'w-[160px]',
      render: (address) => address.label ?? '-',
    },
    {
      key: 'address',
      header: 'Adresse',
      render: (address) => (
        <span>
          <span className="block font-medium">{address.name}</span>
          <span className="block text-text-secondary">
            {[
              address.addressLine,
              [address.street, address.buildingNumber].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')}
          </span>
          <span className="block text-text-secondary">
            {[address.country, address.postalCode].filter(Boolean).join('-')} {address.town}
          </span>
        </span>
      ),
    },
    {
      key: 'usages',
      header: 'Verwendung',
      render: (address) => (
        <span className="flex flex-wrap gap-1">
          {address.useAsDefault && <Badge tone="accent">Standard</Badge>}
          {(address.usages ?? []).map((usage) => (
            <Badge key={usage}>{usageLabel(usage)}</Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[92px]',
      render: (address) =>
        mayWrite ? (
          <span className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => openEditor(address)}
              aria-label={`Adresse ${address.name} bearbeiten`}
              className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => openRemoval(address)}
              aria-label={`Adresse ${address.name} entfernen`}
              className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-danger/12 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <Panel
        title="Adressen"
        description="Jede Belegart geht an höchstens eine Adresse; ohne eigene gilt die Standardadresse."
        padded={false}
        action={
          mayWrite ? (
            <Button variant="secondary" onClick={() => openEditor()}>
              <Plus size={15} aria-hidden />
              Adresse
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={addresses}
          keyOf={(address) => address.id ?? address.name}
          onRowOpen={mayWrite ? (address) => openEditor(address) : undefined}
          empty={
            <EmptyState
              title="Keine Adresse erfasst"
              description="Ohne Adresse lässt sich kein Beleg an diesen Eintrag ausstellen."
            >
              {mayWrite && (
                <Button variant="secondary" onClick={() => openEditor()}>
                  <Plus size={15} aria-hidden />
                  Erste Adresse erfassen
                </Button>
              )}
            </EmptyState>
          }
        />
      </Panel>

      <AddressDialog
        tenantId={tenantId}
        open={editor !== null}
        onClose={() => setEditor(null)}
        onSubmit={(entry) => save.mutate(entry)}
        busy={save.isPending}
        error={save.error}
        defaultName={partnerName}
        address={editor?.address}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Adresse entfernen"
        description="Bereits ausgestellte Belege behalten die Adresse, die auf ihnen steht."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => removing?.id !== undefined && remove.mutate(removing.id)}
              busy={remove.isPending}
            >
              Entfernen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          {removing?.name}, {removing?.postalCode} {removing?.town} wird gelöscht. Das lässt
          sich nicht rückgängig machen.
        </p>
        {remove.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </Dialog>
    </>
  )
}
