import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import type { PrintLayout } from '../../lib/types'
import {
  MAX_LAYOUT_CODE_LENGTH,
  MAX_LAYOUT_NAME_LENGTH,
  layoutComplaint,
  suggestCopy,
  type NewLayoutForm,
} from './printLayoutForm'

/**
 * Adds a print form, either empty or as a copy of one that already prints.
 *
 * <p>One dialog for both ways, because both need the same two values. The primary button of
 * the list used to copy whichever form came first alphabetically, which was neither what it
 * said nor what anybody wanted.
 *
 * @param tenantId the tenant
 * @param source the form the dialog opens on, `undefined` to start from an empty arrangement
 * @param layouts every form of the tenant, to choose a different source from
 * @param onClose called when the dialog is dismissed
 * @param onCreated called with the stored form, so the caller can open the designer
 */
export function NewLayoutDialog({
  tenantId,
  open,
  source,
  layouts,
  onClose,
  onCreated,
}: {
  tenantId: number
  open: boolean
  source: PrintLayout | undefined
  layouts: PrintLayout[]
  onClose: () => void
  onCreated: (created: PrintLayout) => void
}) {
  const [form, setForm] = useState<NewLayoutForm>(suggestCopy(source))
  const [complaint, setComplaint] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => {
      const body = { code: form.code.trim(), name: form.name.trim() }
      // An empty arrangement is a plain create; a source is a copy of that form. Two
      // endpoints, because copying has to read the drawing it starts from.
      return form.sourceId === ''
        ? api.post<PrintLayout>(`/api/tenants/${tenantId}/print-layouts`, body)
        : api.post<PrintLayout>(
            `/api/tenants/${tenantId}/print-layouts/${form.sourceId}/copy`,
            body,
          )
    },
    onSuccess: onCreated,
  })

  const submit = () => {
    const problem = layoutComplaint(form)
    setComplaint(problem)
    if (problem === null) create.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Neue Druckvorlage"
      description="Eine Kopie startet mit derselben Anordnung und lässt sich danach frei gestalten."
      onSubmit={create.isPending ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={create.isPending} shortcut>
            Anlegen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectField
          label="Vorlage übernehmen von"
          value={form.sourceId}
          onChange={(event) => {
            const chosen = layouts.find((entry) => `${entry.id}` === event.target.value)
            setForm(
              event.target.value === ''
                ? { ...form, sourceId: '' }
                : { ...suggestCopy(chosen), sourceId: event.target.value },
            )
          }}
          hint="Ohne Vorlage beginnt die neue mit der eingebauten Standardanordnung."
        >
          <option value="">Leere Standardanordnung</option>
          {layouts.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Code"
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
          maxLength={MAX_LAYOUT_CODE_LENGTH}
          hint="Buchstaben, Ziffern, Bindestrich. Danach unveränderlich."
        />
        <TextField
          label="Bezeichnung"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          maxLength={MAX_LAYOUT_NAME_LENGTH}
        />

        {(complaint !== null || create.error !== null) && (
          <ErrorNotice error={create.error ?? new Error(complaint ?? '')} />
        )}
      </div>
    </Dialog>
  )
}
