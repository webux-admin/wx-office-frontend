import { useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { ErrorNotice } from '../../components/Notice'
import { useFieldErrors } from '../../components/useFieldErrors'
import { isToldByFields } from '../../lib/fieldErrors'
import type { PartnerAddress } from '../../lib/types'
import { AddressFields } from './AddressFields'
import { addressComplaints, emptyAddress, toAddressForm, toAddressPayload } from './addressForm'

/** The address fields that can show a message of their own. */
const SHOWN_FIELDS = [
  'name',
  'label',
  'street',
  'buildingNumber',
  'postalCode',
  'town',
  'country',
  'email',
  'phone',
] as const

/**
 * Adds an address to a stored record, or changes one it already has.
 *
 * <p>Which kinds of document go to this address is asked here, because an address without a
 * use is only ever reached through the fallback to the default one, a subtlety that stays
 * invisible until an invoice turns up at the wrong place.
 *
 * <p>Changing means replacing: the backend takes the whole address, so the fields start from
 * what is stored and everything left blank is cleared, the usage flags included.
 */
export function AddressDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  busy,
  error,
  defaultName,
  address,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (address: PartnerAddress) => void
  busy: boolean
  error: unknown
  /** Prefilled recipient of a new address, which for a company is its own name. */
  defaultName: string
  /** The stored address being changed; absent while a new one is added. */
  address?: PartnerAddress
}) {
  const [form, setForm] = useState(() => emptyAddress(defaultName))
  const [wasOpen, setWasOpen] = useState(open)
  // What the dialog was opened with. Read from the props only while it opens, so the wording
  // does not change under the closing animation once the caller has dropped its selection.
  const [edited, setEdited] = useState(address)

  // The backend names the fields of an address `addresses.town` in its own rules and `town`
  // in the bean validation of this endpoint; the prefix maps the first onto the second.
  const { errors, check, reset } = useFieldErrors(
    () => addressComplaints(form),
    error,
    'addresses.',
  )

  // The dialog stays mounted so it can animate away, which means it also keeps the values of
  // the last time it was open. They are thrown away the moment it opens again, or the second
  // address would start from the first one — and so are the messages of the last attempt.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEdited(address)
      setForm(address ? toAddressForm(address) : emptyAddress(defaultName))
      reset()
    }
  }

  const submit = () => {
    if (check()) onSubmit(toAddressPayload(form))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edited ? 'Adresse bearbeiten' : 'Adresse hinzufügen'}
      onSubmit={busy ? undefined : submit}
      wide
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={busy} shortcut>
            {edited ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <AddressFields
        tenantId={tenantId}
        form={form}
        onChange={setForm}
        storedCountryLabel={edited?.countryLabel}
        errors={errors}
      />

      {error !== null &&
        error !== undefined &&
        !isToldByFields(error, SHOWN_FIELDS, 'addresses.') && (
          <div className="mt-4">
            <ErrorNotice error={error} />
          </div>
        )}
    </Dialog>
  )
}
