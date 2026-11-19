import { useState } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { useFieldErrors } from '../../components/useFieldErrors'
import { isToldByFields } from '../../lib/fieldErrors'
import type { PartnerContact } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import {
  contactComplaints,
  emptyContact,
  toContactForm,
  toContactPayload,
  type ContactForm,
} from './contactForm'

/** The contact fields that can show a message of their own. */
const SHOWN_FIELDS = ['firstName', 'lastName', 'jobTitle', 'email', 'phone', 'mobile'] as const

/**
 * Adds a contact person to a record, or changes one it already has.
 *
 * <p>Changing means replacing, as with an address: the backend takes the whole contact, so
 * what is left blank here is cleared there.
 */
export function ContactDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  busy,
  error,
  contact,
  startsAsPrimary = false,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (contact: PartnerContact) => void
  busy: boolean
  error: unknown
  /** The stored contact being changed; absent while a new one is added. */
  contact?: PartnerContact
  /** Whether a new contact starts ticked as main contact, as the first one of a record does. */
  startsAsPrimary?: boolean
}) {
  const [form, setForm] = useState(() => emptyContact(startsAsPrimary))
  const [wasOpen, setWasOpen] = useState(open)
  // What the dialog was opened with; see the address dialog for why it is kept in state.
  const [edited, setEdited] = useState(contact)

  const { errors, check, reset } = useFieldErrors(
    () => contactComplaints(form),
    error,
    'contacts.',
  )

  // Same reason as in the address dialog: it stays mounted, so it has to forget what was
  // typed the last time it was open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEdited(contact)
      setForm(contact ? toContactForm(contact) : emptyContact(startsAsPrimary))
      reset()
    }
  }

  const set = <K extends keyof ContactForm>(field: K, value: ContactForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = () => {
    if (check()) onSubmit(toContactPayload(form))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edited ? 'Kontaktperson bearbeiten' : 'Kontaktperson hinzufügen'}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Vorname"
          value={form.firstName}
          onChange={(event) => set('firstName', event.target.value)}
          maxLength={60}
          error={errors.firstName}
        />
        <TextField
          label="Nachname"
          value={form.lastName}
          onChange={(event) => set('lastName', event.target.value)}
          maxLength={60}
          required
          error={errors.lastName}
        />
        <TextField
          label="E-Mail"
          type="email"
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          maxLength={255}
          error={errors.email}
        />
        <TextField
          label="Telefon"
          type="tel"
          value={form.phone}
          onChange={(event) => set('phone', event.target.value)}
          maxLength={30}
          error={errors.phone}
        />
        <TextField
          label="Funktion"
          value={form.jobTitle}
          onChange={(event) => set('jobTitle', event.target.value)}
          placeholder="Einkauf"
          maxLength={80}
          error={errors.jobTitle}
        />
        <TextField
          label="Mobile"
          type="tel"
          value={form.mobile}
          onChange={(event) => set('mobile', event.target.value)}
          maxLength={30}
          error={errors.mobile}
        />
        <MasterDataSelect
          label="Anrede"
          tenantId={tenantId}
          list="salutations"
          value={form.salutation}
          storedLabel={edited?.salutationLabel}
          onChange={(code) => set('salutation', code)}
          emptyLabel="Ohne Anrede"
        />
        <MasterDataSelect
          label="Sprache"
          tenantId={tenantId}
          list="languages"
          value={form.language}
          storedLabel={edited?.languageLabel}
          onChange={(code) => set('language', code)}
          emptyLabel="Wie der Eintrag"
          tooltip="Nur nötig, wenn diese Person in einer anderen Sprache angeschrieben wird als die Firma."
        />
      </div>

      <CheckboxField
        label="Hauptkontakt"
        tooltip="Wird auf Belegen angeschrieben. Pro Eintrag gibt es höchstens einen."
        checked={form.isPrimary}
        onChange={(event) => set('isPrimary', event.target.checked)}
        className="mt-5"
      />

      {error !== null &&
        error !== undefined &&
        !isToldByFields(error, SHOWN_FIELDS, 'contacts.') && (
          <div className="mt-4">
            <ErrorNotice error={error} />
          </div>
        )}
    </Dialog>
  )
}
