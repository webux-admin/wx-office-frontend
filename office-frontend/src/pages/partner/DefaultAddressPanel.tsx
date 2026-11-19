import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import type { Partner, PartnerAddress } from '../../lib/types'
import { AddressDialog } from './AddressDialog'
import { addressLines } from './addressForm'
import { invalidateAfterPartnerChange } from './partnerRefresh'

/**
 * The default address on the register «Stammdaten».
 *
 * <p>Shown as it is printed, not as fields: an address is a record of its own with its own
 * endpoint, and saving the partner does not save it. The pencil opens the same dialog as the
 * register «Adressen» and saves the address there and then.
 */
export function DefaultAddressPanel({
  tenantId,
  partner,
  mayWrite,
}: {
  tenantId: number
  partner: Partner
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const address =
    partner.addresses?.find((entry) => entry.useAsDefault) ?? partner.addresses?.[0]
  const base = `/api/tenants/${tenantId}/partners/${partner.id}/addresses`

  const save = useMutation({
    mutationFn: (entry: PartnerAddress) =>
      address?.id === undefined
        ? api.post<Partner>(base, { ...entry, useAsDefault: true })
        : api.put<Partner>(`${base}/${address.id}`, entry),
    onSuccess: () => {
      invalidateAfterPartnerChange(queryClient, tenantId)
      setEditing(false)
    },
  })

  const open = () => {
    save.reset()
    setEditing(true)
  }

  return (
    <Panel
      title="Standardadresse"
      action={
        mayWrite ? (
          <IconButton
            label={address ? 'Standardadresse bearbeiten' : 'Standardadresse erfassen'}
            onClick={open}
          >
            {address ? <Pencil size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          </IconButton>
        ) : undefined
      }
    >
      {address ? (
        <address className="grid gap-0.5 not-italic">
          {addressLines(address).map((line, index) => (
            <span key={index} className={index === 0 ? 'font-medium' : undefined}>
              {line}
            </span>
          ))}
        </address>
      ) : (
        <p className="text-text-secondary">Noch keine Adresse.</p>
      )}

      <AddressDialog
        tenantId={tenantId}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(entry) => save.mutate(entry)}
        busy={save.isPending}
        error={save.error}
        defaultName={partner.name}
        address={address}
      />
    </Panel>
  )
}
