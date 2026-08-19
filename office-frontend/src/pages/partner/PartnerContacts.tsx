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
import type { Partner, PartnerContact } from '../../lib/types'
import { ContactDialog } from './ContactDialog'

/** The name of a contact as it is read, without the gap a missing salutation would leave. */
function nameOf(contact: PartnerContact): string {
  return [contact.salutationLabel, contact.firstName, contact.lastName]
    .filter((part) => part)
    .join(' ')
}

/**
 * The contact persons of one record, with everything the API can do to them.
 *
 * <p>Exactly one of them can be the main contact; the backend refuses a second one, and its
 * answer is what the dialog shows.
 */
export function PartnerContacts({
  tenantId,
  partnerId,
  contacts,
  mayWrite,
}: {
  tenantId: number
  partnerId: number
  contacts: PartnerContact[]
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  // Holds the contact being changed, or an empty object while a new one is entered.
  const [editor, setEditor] = useState<{ contact?: PartnerContact } | null>(null)
  const [removing, setRemoving] = useState<PartnerContact | null>(null)

  const base = `/api/tenants/${tenantId}/partners/${partnerId}/contacts`

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['partner', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['partners', tenantId] })
  }

  const save = useMutation({
    mutationFn: (entry: PartnerContact) => {
      const known = editor?.contact?.id
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
    mutationFn: (contactId: number) => api.delete<Partner>(`${base}/${contactId}`),
    onSuccess: () => {
      refresh()
      setRemoving(null)
    },
  })

  // Resetting first, so a dialog does not open showing the error of the last attempt.
  const openEditor = (contact?: PartnerContact) => {
    save.reset()
    setEditor({ contact })
  }

  const openRemoval = (contact: PartnerContact) => {
    remove.reset()
    setRemoving(contact)
  }

  const columns: Column<PartnerContact>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (contact) => <span className="font-medium">{nameOf(contact)}</span>,
    },
    { key: 'job', header: 'Funktion', render: (contact) => contact.jobTitle ?? '-' },
    { key: 'email', header: 'E-Mail', render: (contact) => contact.email ?? '-' },
    {
      key: 'phone',
      header: 'Telefon',
      render: (contact) => contact.phone ?? contact.mobile ?? '-',
    },
    {
      key: 'primary',
      header: '',
      width: 'w-[120px]',
      render: (contact) => (contact.isPrimary ? <Badge tone="accent">Hauptkontakt</Badge> : null),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[92px]',
      render: (contact) =>
        mayWrite ? (
          <span className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => openEditor(contact)}
              aria-label={`${nameOf(contact)} bearbeiten`}
              className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => openRemoval(contact)}
              aria-label={`${nameOf(contact)} entfernen`}
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
        title="Kontaktpersonen"
        description="Der Hauptkontakt wird auf Belegen angeschrieben und bestimmt deren Sprache."
        padded={false}
        action={
          mayWrite ? (
            <Button variant="secondary" onClick={() => openEditor()}>
              <Plus size={15} aria-hidden />
              Kontakt
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          rows={contacts}
          keyOf={(contact) => contact.id ?? contact.lastName}
          onRowOpen={mayWrite ? (contact) => openEditor(contact) : undefined}
          empty={
            <EmptyState
              title="Keine Kontaktperson"
              description="Bei Firmen hilft eine Ansprechperson, bei Privatpersonen ist sie meist überflüssig."
            >
              {mayWrite && (
                <Button variant="secondary" onClick={() => openEditor()}>
                  <Plus size={15} aria-hidden />
                  Kontaktperson erfassen
                </Button>
              )}
            </EmptyState>
          }
        />
      </Panel>

      <ContactDialog
        tenantId={tenantId}
        open={editor !== null}
        onClose={() => setEditor(null)}
        onSubmit={(entry) => save.mutate(entry)}
        busy={save.isPending}
        error={save.error}
        contact={editor?.contact}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Kontaktperson entfernen"
        description="Bereits ausgestellte Belege behalten die Person, die auf ihnen steht."
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
          {removing && nameOf(removing)} wird gelöscht. Das lässt sich nicht rückgängig
          machen.
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
