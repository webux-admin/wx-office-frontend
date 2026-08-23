import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { composeDueAt, splitDueAt } from '../../lib/dueAt'
import { formatDateTime, toIsoDate } from '../../lib/format'
import { dueOfferRemindersKey, offerRemindersKey } from '../../lib/salesDocument'
import type { OfferReminder } from '../../lib/types'

/** What the reminder dialog edits: the two field values of the due moment, and the note. */
type ReminderForm = { date: string; time: string; note: string }

/**
 * A new reminder starts a week ahead at nine: far enough that the customer had time to read
 * the offer, early enough in the day that the call still happens on it.
 */
function proposedForm(): ReminderForm {
  const inAWeek = new Date()
  inAWeek.setDate(inAWeek.getDate() + 7)
  return { date: toIsoDate(inAWeek), time: '09:00', note: '' }
}

/**
 * The follow-up reminders of one offer.
 *
 * <p>A reminder belongs to whoever wrote it and shows up on their overview once it is due.
 * Writing needs the write right; on a cancelled offer only the done mark still moves, so a
 * reminder that already rang can be put away.
 *
 * @param mayWrite whether the user holds the write right of the offer
 * @param cancelled whether the offer is cancelled, which freezes everything but the done mark
 */
export function OfferReminders({
  tenantId,
  base,
  documentId,
  mayWrite,
  cancelled,
  readOnlyNote,
}: {
  tenantId: number
  /** Path of the offer, for example `/api/tenants/1/offers/42`. */
  base: string
  documentId: number
  mayWrite: boolean
  cancelled: boolean
  /** Why nothing can be changed, where a right is missing. */
  readOnlyNote?: string
}) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<OfferReminder | null>(null)
  const [deleting, setDeleting] = useState<OfferReminder | null>(null)
  const [form, setForm] = useState<ReminderForm>(proposedForm)

  const reminders = useQuery({
    queryKey: offerRemindersKey(tenantId, documentId),
    queryFn: () => api.get<OfferReminder[]>(`${base}/reminders`),
  })

  // The overview shows the due ones, so its list is stale the moment one is written here.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: offerRemindersKey(tenantId, documentId) })
    void queryClient.invalidateQueries({ queryKey: dueOfferRemindersKey(tenantId) })
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const create = useMutation({
    mutationFn: (body: { dueAt: string; note?: string }) =>
      api.post<OfferReminder>(`${base}/reminders`, body),
    onSuccess: () => {
      refresh()
      closeForm()
    },
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { dueAt: string; note?: string; done: boolean } }) =>
      api.put<OfferReminder>(`${base}/reminders/${id}`, body),
    onSuccess: () => {
      refresh()
      closeForm()
    },
  })

  // Rewriting the row is how the mark is toggled: the endpoint takes the whole reminder, so
  // the unchanged due moment and note travel along.
  const toggleDone = useMutation({
    mutationFn: (reminder: OfferReminder) =>
      api.put<OfferReminder>(`${base}/reminders/${reminder.id}`, {
        dueAt: reminder.dueAt,
        note: reminder.note,
        done: !reminder.done,
      }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`${base}/reminders/${id}`),
    onSuccess: () => {
      refresh()
      setDeleting(null)
    },
  })

  const openCreate = () => {
    create.reset()
    update.reset()
    setForm(proposedForm())
    setCreating(true)
  }

  const openEdit = (reminder: OfferReminder) => {
    create.reset()
    update.reset()
    setForm({ ...splitDueAt(reminder.dueAt), note: reminder.note ?? '' })
    setEditing(reminder)
  }

  const submitForm = () => {
    const body = {
      dueAt: composeDueAt(form.date, form.time),
      note: form.note.trim() === '' ? undefined : form.note.trim(),
    }
    if (editing === null) create.mutate(body)
    else update.mutate({ id: editing.id, body: { ...body, done: editing.done } })
  }

  const rows = reminders.data ?? []
  const editableDocument = mayWrite && !cancelled

  return (
    <Panel
      title="Erinnerungen"
      description="Wann nachgefasst wird. Fällige Erinnerungen stehen auf der Übersicht."
      action={
        editableDocument ? (
          <Button variant="secondary" onClick={openCreate}>
            Erinnerung hinzufügen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        {reminders.isPending && (
          <p className="text-[13px] text-text-secondary">Wird geladen ...</p>
        )}
        {reminders.error !== null && <ErrorNotice error={reminders.error} />}

        {reminders.isSuccess && rows.length === 0 && (
          <p className="text-[13px] text-text-secondary">
            Noch keine Erinnerungen. Eine Erinnerung gehört der Person, die sie anlegt, und
            erscheint bei Fälligkeit auf deren Übersicht.
          </p>
        )}

        {rows.length > 0 && (
          <ul className="divide-y divide-line-subtle">
            {rows.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                mayWrite={mayWrite}
                editableDocument={editableDocument}
                busy={toggleDone.isPending}
                onToggleDone={() => toggleDone.mutate(reminder)}
                onEdit={() => openEdit(reminder)}
                onDelete={() => {
                  remove.reset()
                  setDeleting(reminder)
                }}
              />
            ))}
          </ul>
        )}

        {readOnlyNote !== undefined && (
          <p className="text-[13px] text-text-secondary">{readOnlyNote}</p>
        )}
        {mayWrite && cancelled && (
          <p className="text-[13px] text-text-secondary">
            Die Offerte ist storniert: Erinnerungen lassen sich nur noch erledigen.
          </p>
        )}

        {toggleDone.error !== null && <ErrorNotice error={toggleDone.error} />}
      </div>

      <Dialog
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing === null ? 'Erinnerung hinzufügen' : 'Erinnerung bearbeiten'}
        description="Datum und Uhrzeit gelten in der eigenen Zeitzone."
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Abbrechen
            </Button>
            <Button
              onClick={submitForm}
              busy={create.isPending || update.isPending}
              disabled={form.date === '' || form.time === ''}
            >
              {editing === null ? 'Hinzufügen' : 'Übernehmen'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Datum"
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
            <TextField
              label="Uhrzeit"
              type="time"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            />
          </div>
          <TextField
            label="Notiz"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            maxLength={255}
            hint="Worauf es beim Nachfassen ankommt."
          />
          {create.error !== null && <ErrorNotice error={create.error} />}
          {update.error !== null && <ErrorNotice error={update.error} />}
        </div>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Erinnerung löschen"
        description="Die Erinnerung wird endgültig entfernt."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => deleting !== null && remove.mutate(deleting.id)}
              busy={remove.isPending}
            >
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Erledigtes bleibt nachvollziehbar, wenn die Erinnerung stattdessen als erledigt
          markiert wird.
        </p>
        {remove.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </Dialog>
    </Panel>
  )
}

/**
 * One reminder: when it is due, what it says, and what may still happen to it.
 *
 * <p>An open reminder whose moment lies in the past is marked in the danger tone — that is
 * the one the register exists for.
 */
function ReminderRow({
  reminder,
  mayWrite,
  editableDocument,
  busy,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  reminder: OfferReminder
  mayWrite: boolean
  /** Whether the reminder itself may still be rewritten or removed. */
  editableDocument: boolean
  busy: boolean
  onToggleDone: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const overdue = !reminder.done && new Date(reminder.dueAt).getTime() < new Date().getTime()

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <span
          className={`block text-[13px] font-medium ${
            reminder.done ? 'text-text-tertiary' : overdue ? 'text-danger' : ''
          }`}
        >
          {formatDateTime(reminder.dueAt)}
          {overdue && ' · fällig'}
        </span>
        {reminder.note && (
          <span className="block text-[13px] text-text-secondary">{reminder.note}</span>
        )}
        <span className="block text-[12px] text-text-tertiary">
          {reminder.done
            ? `Erledigt ${formatDateTime(reminder.doneAt)}${
                reminder.doneBy ? ` · ${reminder.doneBy}` : ''
              }`
            : reminder.createdBy
              ? `Angelegt von ${reminder.createdBy}`
              : `Angelegt ${formatDateTime(reminder.createdAt)}`}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {mayWrite && (
          <Button variant="ghost" onClick={onToggleDone} busy={busy}>
            {reminder.done ? 'Wieder öffnen' : 'Erledigt'}
          </Button>
        )}
        {editableDocument && (
          <Button variant="ghost" onClick={onEdit}>
            Bearbeiten
          </Button>
        )}
        {editableDocument && (
          <Button variant="ghost" onClick={onDelete}>
            Löschen
          </Button>
        )}
      </div>
    </li>
  )
}
