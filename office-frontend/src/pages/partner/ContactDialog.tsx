import { useState } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import type { PartnerContact } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import {
  contactComplaint,
  emptyContact,
  toContactForm,
  toContactPayload,
  type ContactForm,
} from './contactForm'

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
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (contact: PartnerContact) => void
  busy: boolean
  error: unknown
  /** The stored contact being changed; absent while a new one is added. */
  contact?: PartnerContact
}) {
  const [form, setForm] = useState(() => emptyContact())
  const [wasOpen, setWasOpen] = useState(open)
  // What the dialog was opened with; see the address dialog for why it is kept in state.
  const [edited, setEdited] = useState(contact)

  // Same reason as in the address dialog: it stays mounted, so it has to forget what was
  // typed the last time it was open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setEdited(contact)
      setForm(contact ? toContactForm(contact) : emptyContact())
    }
  }

  const set = <K extends keyof ContactForm>(field: K, value: ContactForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const complaint = contactComplaint(form)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edited ? 'Kontaktperson bearbeiten' : 'Kontaktperson hinzufügen'}
      onSubmit={busy || complaint !== null ? undefined : () => onSubmit(toContactPayload(form))}
      description="Nur der Nachname ist Pflicht."
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => onSubmit(toContactPayload(form))}
            busy={busy}
            disabled={complaint !== null}
            shortcut
          >
            {edited ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <MasterDataSelect
          label="Anrede"
          tenantId={tenantId}
          list="salutations"
          value={form.salutation}
          storedLabel={edited?.salutationLabel}
          onChange={(code) => set('salutation', code)}
          emptyLabel="Ohne Anrede"
        />
        <TextField
          label="Funktion"
          value={form.jobTitle}
          onChange={(event) => set('jobTitle', event.target.value)}
          placeholder="Einkauf"
          maxLength={80}
        />
        <TextField
          label="Vorname"
          value={form.firstName}
          onChange={(event) => set('firstName', event.target.value)}
          maxLength={60}
        />
        <TextField
          label="Nachname"
          value={form.lastName}
          onChange={(event) => set('lastName', event.target.value)}
          maxLength={60}
          required
        />
        <TextField
          label="E-Mail"
          type="email"
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          maxLength={255}
        />
        <MasterDataSelect
          label="Sprache"
          tenantId={tenantId}
          list="languages"
          value={form.language}
          storedLabel={edited?.languageLabel}
          onChange={(code) => set('language', code)}
          emptyLabel="Wie der Eintrag"
        />
        <TextField
          label="Telefon"
          value={form.phone}
          onChange={(event) => set('phone', event.target.value)}
          maxLength={30}
        />
        <TextField
          label="Mobile"
          value={form.mobile}
          onChange={(event) => set('mobile', event.target.value)}
          maxLength={30}
        />
      </div>

      <CheckboxField
        label="Hauptkontakt"
        hint="Diese Person wird auf Belegen angeschrieben. Es kann nur eine geben."
        checked={form.isPrimary}
        onChange={(event) => set('isPrimary', event.target.checked)}
        className="mt-5"
      />

      {error !== null && error !== undefined && (
        <div className="mt-4">
          <ErrorNotice error={error} />
        </div>
      )}
    </Dialog>
  )
}
