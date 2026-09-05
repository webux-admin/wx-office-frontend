import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  deleteEntryTemplate,
  entryTemplatesKey,
  updateEntryTemplate,
} from '../../lib/accounting'
import type { EntryTemplate } from '../../lib/types'
import { orderPayload, templateRequestOf, type TemplateOrderStep } from './entryTemplateForm'

/** What is true of a template that is deleted, and the reason the delete is harmless here. */
export const DELETE_SENTENCE = 'Bereits gebuchte Buchungen bleiben unverändert.'

/**
 * «Vorlagen verwalten …»: rename, describe, reorder, delete.
 *
 * <p><b>The dialog edits no lines.</b> A second grid inside a dialog would be a second line
 * editor with its own keyboard handling, its own live difference and its own account search —
 * for something the grid outside does in three clicks: apply the template, correct the rows,
 * save under the same name.
 *
 * <p><b>One arrow press is one `PUT` per moved row, both in one mutation</b>, each carrying its
 * own version. The list is read anew afterwards — also where one of the two answered 409 —, so
 * a second arrow press does not sit on a version that has moved on.
 *
 * <p>Deleting asks once. It is the one delete of the whole module, and the question says why it
 * is harmless: a template carries no booking date and no journal number.
 */
export function ManageTemplatesDialog({
  tenantId,
  templates,
  onClose,
}: {
  tenantId: number
  /** The templates in menu order, as the list delivered them. */
  templates: readonly EntryTemplate[]
  onClose: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can(ACCOUNTING_RIGHTS.write)

  const [editing, setEditing] = useState<EntryTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [removing, setRemoving] = useState<EntryTemplate | null>(null)

  /**
   * Reads the list anew — after every write, whether it went through or not.
   *
   * <p><b>On settled and not only on success</b>, because a reordering fires two `PUT`s and one
   * of them may answer 409 while the other goes through. Refreshing only on success would leave
   * the row that did succeed sitting on the version it was read at: every further arrow press
   * on it answers 409 too, and closing and reopening the dialog does not help, because the
   * templates come out of the same cache. Only a page reload did — and that is not a repair a
   * mask may ask of anybody.
   */
  const refresh = () => queryClient.invalidateQueries({ queryKey: entryTemplatesKey(tenantId) })

  const rename = useMutation({
    mutationFn: (template: EntryTemplate) =>
      updateEntryTemplate(
        tenantId,
        template.id,
        // The whole template goes back out: the endpoint replaces what it is given, so a body
        // of nothing but a name would drop the lines.
        templateRequestOf(template, {
          name: name.trim(),
          description: description.trim() === '' ? null : description.trim(),
        }),
      ),
    onSettled: refresh,
    // The edit row closes only where the change went through: a 409 leaves it open with its
    // error, so the correction is not typed a second time.
    onSuccess: () => setEditing(null),
  })

  const reorder = useMutation({
    // There is no endpoint for a whole order, so one arrow press is one request per moved row.
    // They go out together and count as one mutation, so a half-done move cannot be seen.
    mutationFn: (steps: TemplateOrderStep[]) =>
      Promise.all(
        steps.map((entry) => updateEntryTemplate(tenantId, entry.id, entry.request)),
      ),
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (template: EntryTemplate) => deleteEntryTemplate(tenantId, template.id),
    onSettled: refresh,
    onSuccess: () => setRemoving(null),
  })

  const failure = rename.error ?? reorder.error ?? remove.error

  function move(index: number, direction: -1 | 1) {
    const steps = orderPayload(templates, index, direction)
    if (steps.length === 0) return
    reorder.mutate(steps)
  }

  function openEdit(template: EntryTemplate) {
    setName(template.name)
    setDescription(template.description ?? '')
    rename.reset()
    setRemoving(null)
    setEditing(template)
  }

  return (
    <Dialog
      open
      title="Vorlagen verwalten"
      onClose={onClose}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          Schliessen
        </Button>
      }
    >
      <div className="grid gap-3">
        {failure !== null && <ErrorNotice error={failure} />}

        {templates.length === 0 ? (
          <EmptyState
            title="Noch keine Vorlage."
            description="Tippen Sie eine Buchung und speichern Sie sie als Vorlage."
          />
        ) : (
          <ul className="grid gap-1">
            {templates.map((template, index) => (
              <li
                key={template.id}
                className="grid gap-2 rounded-[var(--radius-md)] border border-line-subtle px-2 py-2"
              >
                <div className="flex items-center gap-3 text-[13px]">
                  <RowOrderButtons
                    name={template.name}
                    upDisabled={!mayWrite || index === 0 || reorder.isPending}
                    downDisabled={
                      !mayWrite || index === templates.length - 1 || reorder.isPending
                    }
                    onUp={() => move(index, -1)}
                    onDown={() => move(index, 1)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-primary">{template.name}</span>
                    <span className="block truncate text-[12px] text-text-secondary">
                      {template.problems.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-warning">
                          <TriangleAlert size={12} aria-hidden />
                          {template.problems.join(' ')}
                        </span>
                      ) : (
                        (template.description ?? '')
                      )}
                    </span>
                  </span>
                  <span className="w-[70px] shrink-0 text-right tabular-nums text-text-secondary">
                    {template.lines.length} Zeilen
                  </span>
                  <span className="w-[70px] shrink-0 text-text-secondary">
                    Beträge {template.carriesAmounts ? 'ja' : 'nein'}
                  </span>
                  {mayWrite && (
                    <span className="flex shrink-0 gap-0.5">
                      <IconButton
                        label={`${template.name} umbenennen`}
                        onClick={() => openEdit(template)}
                      >
                        <Pencil size={14} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={`${template.name} löschen`}
                        onClick={() => {
                          setEditing(null)
                          setRemoving(template)
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                      </IconButton>
                    </span>
                  )}
                </div>

                {editing?.id === template.id && (
                  <div className="grid gap-2 border-t border-line-subtle pt-2 sm:grid-cols-[1fr_1fr_auto]">
                    <TextField
                      label="Name"
                      value={name}
                      maxLength={60}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <TextField
                      label="Beschreibung"
                      value={description}
                      maxLength={200}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                    <span className="flex items-end gap-2">
                      <Button variant="secondary" onClick={() => setEditing(null)}>
                        Abbrechen
                      </Button>
                      <Button
                        onClick={() => rename.mutate(template)}
                        disabled={name.trim() === ''}
                        busy={rename.isPending}
                      >
                        Speichern
                      </Button>
                    </span>
                  </div>
                )}

                {removing?.id === template.id && (
                  <div className="grid gap-2 border-t border-line-subtle pt-2">
                    <p className="text-[13px]">
                      Die Vorlage «{template.name}» wird gelöscht. {DELETE_SENTENCE}
                    </p>
                    <span className="flex gap-2">
                      <Button variant="secondary" onClick={() => setRemoving(null)}>
                        Abbrechen
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => remove.mutate(template)}
                        busy={remove.isPending}
                      >
                        Löschen
                      </Button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[13px] text-text-secondary">
          Zeilen und Beträge ändern Sie, indem Sie die Vorlage anwenden, das Raster korrigieren
          und unter demselben Namen wieder speichern.
        </p>
      </div>
    </Dialog>
  )
}

/** One of the two icon buttons of a row. The name goes into the label, never onto the screen. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-[var(--radius-sm)] p-1 text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
    >
      {children}
    </button>
  )
}
