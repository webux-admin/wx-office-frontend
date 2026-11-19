import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import type { PartnerContact } from '../../lib/types'
import { ContactDialog } from './ContactDialog'
import { withSinglePrimary } from './contactForm'

/** The name of a contact as it is read, first name and last name. */
function nameOf(contact: PartnerContact): string {
  return [contact.firstName, contact.lastName].filter((part) => part).join(' ')
}

/**
 * The contact persons of a record that is still being created.
 *
 * <p>Nothing is sent until the record itself is saved: the list lives in the create mask and
 * goes with the record in one request. The first person entered starts as main contact.
 */
export function NewContacts({
  tenantId,
  contacts,
  onChange,
  disabled,
}: {
  tenantId: number
  contacts: PartnerContact[]
  onChange: (contacts: PartnerContact[]) => void
  disabled: boolean
}) {
  // The position of the contact being changed, or 'new' while one is added.
  const [editing, setEditing] = useState<number | 'new' | null>(null)

  const store = (entry: PartnerContact) => {
    const next =
      editing === 'new'
        ? [...contacts, entry]
        : contacts.map((contact, index) => (index === editing ? entry : contact))
    const position = editing === 'new' ? next.length - 1 : (editing ?? 0)
    onChange(entry.isPrimary ? withSinglePrimary(next, position) : next)
    setEditing(null)
  }

  const remove = (position: number) =>
    onChange(contacts.filter((_contact, index) => index !== position))

  return (
    <div className="grid gap-2">
      {contacts.length > 0 && (
        <ul className="grid divide-y divide-line-subtle rounded-[var(--radius-md)] border border-line-subtle">
          {contacts.map((contact, index) => (
            <li key={index} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{nameOf(contact)}</span>
                {contact.jobTitle && (
                  <span className="text-text-secondary"> · {contact.jobTitle}</span>
                )}
                {(contact.email ?? contact.phone) && (
                  <span className="text-text-secondary"> · {contact.email ?? contact.phone}</span>
                )}
              </span>
              {contact.isPrimary && <Badge tone="accent">Hauptkontakt</Badge>}
              {!disabled && (
                <span className="flex gap-1">
                  <IconButton label={`${nameOf(contact)} bearbeiten`} onClick={() => setEditing(index)}>
                    <Pencil size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`${nameOf(contact)} entfernen`}
                    onClick={() => remove(index)}
                    tone="danger"
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div>
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus size={15} aria-hidden />
            Kontaktperson hinzufügen
          </Button>
        </div>
      )}

      <ContactDialog
        tenantId={tenantId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={store}
        busy={false}
        error={null}
        contact={typeof editing === 'number' ? contacts[editing] : undefined}
        startsAsPrimary={contacts.length === 0}
      />
    </div>
  )
}
