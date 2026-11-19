import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { ErrorNotice } from '../../components/Notice'
import { api } from '../../lib/api'
import type { SalesDocument } from '../../lib/types'
import { AddressChoice } from './AddressChoice'
import type { UpdateHeaderRequest } from './headerForm'
import { usePartnerAddresses } from './usePartnerAddresses'

/**
 * Sends a draft to another of its customer's addresses.
 *
 * <p>Only the address changes: the customer, the language, the terms and every line stay as
 * they are. The draft remembers that the address was picked, so when the customer's addresses
 * change later it keeps to this one instead of falling back to the usual one (backend
 * ADR-0134).
 */
export function ChangeAddressDialog({
  tenantId,
  base,
  open,
  onClose,
  document,
  onChanged,
}: {
  tenantId: number
  /** Path of the document, without a trailing slash, for example `/api/tenants/1/orders/42`. */
  base: string
  open: boolean
  onClose: () => void
  document: SalesDocument
  /** Called with the document the backend answered with. */
  onChanged: (document: SalesDocument) => void
}) {
  const addresses = usePartnerAddresses(tenantId, open ? document.partnerId : null)
  const current = document.recipient?.addressId
  const [picked, setPicked] = useState<number | undefined>(current)
  const [wasOpen, setWasOpen] = useState(open)
  // Opened again, it starts from what the draft carries now, not from the last pick.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPicked(current)
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: UpdateHeaderRequest = { addressId: picked, priceMode: 'COPY' }
      return api.put<SalesDocument>(`${base}/header`, payload)
    },
    onSuccess: (updated) => {
      onChanged(updated)
      onClose()
    },
  })

  const submit = () => {
    if (picked === undefined || picked === current) {
      onClose()
      return
    }
    save.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adresse wählen"
      onSubmit={save.isPending ? undefined : submit}
      wide
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={save.isPending} shortcut>
            Übernehmen
          </Button>
        </>
      }
    >
      {addresses.length === 0 ? (
        <p className="text-text-secondary">Der Kunde hat keine gespeicherte Adresse.</p>
      ) : (
        <AddressChoice
          tenantId={tenantId}
          addresses={addresses}
          value={picked}
          onChange={setPicked}
          name="document-address"
        />
      )}
      {save.error !== null && (
        <div className="mt-4">
          <ErrorNotice error={save.error} />
        </div>
      )}
    </Dialog>
  )
}
