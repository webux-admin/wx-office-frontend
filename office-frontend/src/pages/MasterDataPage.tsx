import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RowOrderButtons } from '../components/RowOrderButtons'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { basicDataFor, firstBasicDataPath, type BasicDataList } from '../lib/basicData'
import { defaultCodeOf, labelPayload } from '../lib/masterData'
import type { MasterDataEntry } from '../lib/types'
import { useMasterDataEntries, useMasterDataList } from '../masterdata/useMasterData'
import { EntryDialog } from './masterdata/EntryDialog'
import {
  EMPTY_ENTRY,
  decimalPlacesOf,
  entryComplaint,
  toEntryForm,
  type EntryForm,
} from './masterdata/entryForm'

/**
 * One maintained selection list of the tenant.
 *
 * <p>What used to be an enum in the code is master data: the values are added, renamed,
 * sorted and deactivated here. Deleting works only for a value nothing points at and that was
 * not delivered with the application; anything else is refused by the backend, and its answer
 * is what the dialog shows.
 *
 * <p>Which list is shown comes from the address, not from a tab: every list is its own menu
 * entry, so it must be linkable on its own.
 */
export function MasterDataPage() {
  const { liste } = useParams()
  const chosen = basicDataFor(liste)

  // A segment no list is served under — a typed address, or a link from an older menu.
  if (!chosen) return <Navigate to={firstBasicDataPath()} replace />

  return (
    <RequireTenant permission="MASTERDATA_READ">
      {/* Keyed by the list, so switching starts with an empty form instead of the last one. */}
      {(tenantId) => <MasterData key={chosen.slug} tenantId={tenantId} chosen={chosen} />}
    </RequireTenant>
  )
}

function MasterData({ tenantId, chosen }: { tenantId: number; chosen: BasicDataList }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('MASTERDATA_WRITE')
  const mayDeactivate = can('MASTERDATA_DEACTIVATE')

  const list = chosen.list
  const [editing, setEditing] = useState<MasterDataEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<EntryForm>(EMPTY_ENTRY)
  const [removing, setRemoving] = useState<MasterDataEntry | null>(null)
  const [complaint, setComplaint] = useState<string | null>(null)

  // The name of a value is its text in the tenant's default language, and the API keeps that
  // text twice: as `name` and as the translation for that language. Both are written together.
  const defaultLanguage = defaultCodeOf(useMasterDataEntries(tenantId, 'languages'))
  const base = `/api/tenants/${tenantId}/${list}`

  // Deactivated values belong on this screen: they have to be visible to be switched on again.
  const entries = useMasterDataList(tenantId, list, false)
  const rows = entries.data ?? []

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['master-data', tenantId] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        labels: labelPayload(form.name, form.translations, defaultLanguage),
        shortName: form.shortName.trim() || undefined,
        description: form.description.trim() || undefined,
        documentLanguage: list === 'languages' ? form.documentLanguage : undefined,
        decimalPlaces: decimalPlacesOf(form, list),
      }
      return editing
        ? api.put<MasterDataEntry>(`${base}/${editing.id}`, payload)
        : api.post<MasterDataEntry>(base, payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const makeDefault = useMutation({
    mutationFn: (id: number) => api.put<MasterDataEntry>(`${base}/${id}/default`, undefined),
    onSuccess: refresh,
  })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.put<MasterDataEntry>(`${base}/${id}/${active ? 'activate' : 'deactivate'}`, undefined),
    onSuccess: refresh,
  })

  const reorder = useMutation({
    mutationFn: (entryIds: number[]) => api.put<MasterDataEntry[]>(`${base}/order`, { entryIds }),
    onSuccess: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`${base}/${id}`),
    onSuccess: () => {
      void refresh()
      setRemoving(null)
    },
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_ENTRY)
    setComplaint(null)
    save.reset()
  }

  const submit = () => {
    const problem = entryComplaint(form, list)
    setComplaint(problem)
    if (!problem) save.mutate()
  }

  const openNew = () => {
    setForm(EMPTY_ENTRY)
    setEditing(null)
    setComplaint(null)
    save.reset()
    setCreating(true)
  }

  const openEdit = (entry: MasterDataEntry) => {
    setForm(toEntryForm(entry, defaultLanguage))
    setEditing(entry)
    save.reset()
    setCreating(false)
  }

  /** Moves one value past its neighbour and sends the whole list in its new order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const order = rows.map((entry) => entry.id)
    const moved = order[index]
    order[index] = order[target]
    order[target] = moved
    reorder.mutate(order)
  }

  const columns: Column<MasterDataEntry>[] = [
    {
      key: 'order',
      header: '',
      width: 'w-[74px]',
      render: (entry) => {
        if (!mayWrite) return null
        const index = rows.indexOf(entry)
        return (
          <RowOrderButtons
            name={entry.name}
            upDisabled={index <= 0 || reorder.isPending}
            downDisabled={index === rows.length - 1 || reorder.isPending}
            onUp={() => move(index, -1)}
            onDown={() => move(index, 1)}
          />
        )
      },
    },
    {
      key: 'code',
      header: 'Code',
      width: 'w-[150px]',
      render: (entry) => <span className="font-mono text-[12px]">{entry.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (entry) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(entry)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {entry.name}
          </button>
        ) : (
          <span className="font-medium">{entry.name}</span>
        ),
    },
    {
      key: 'shortName',
      header: 'Kurzform',
      width: 'w-[110px]',
      render: (entry) => <span className="text-text-secondary">{entry.shortName ?? '-'}</span>,
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[210px]',
      render: (entry) => (
        <span className="flex flex-wrap items-center gap-1">
          {entry.isDefault && <Badge tone="accent">Standard</Badge>}
          {entry.active === false && <Badge tone="muted">Deaktiviert</Badge>}
          {entry.system === true && <Badge tone="neutral">Ausgeliefert</Badge>}
          {list === 'languages' && entry.documentLanguage === true && <Badge>Belegsprache</Badge>}
          {mayWrite && !entry.isDefault && entry.active !== false && (
            <button
              type="button"
              onClick={() => makeDefault.mutate(entry.id)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
            >
              <Star size={12} aria-hidden />
              Als Standard
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[170px]',
      render: (entry) => (
        <span className="flex items-center justify-end gap-3">
          {mayDeactivate && !entry.isDefault && (
            <button
              type="button"
              onClick={() => setActive.mutate({ id: entry.id, active: entry.active === false })}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              {entry.active === false ? 'Aktivieren' : 'Deaktivieren'}
            </button>
          )}
          {mayDeactivate && entry.system !== true && (
            <button
              type="button"
              onClick={() => {
                remove.reset()
                setRemoving(entry)
              }}
              aria-label={`${entry.name} löschen`}
              className="text-text-tertiary transition-colors hover:text-danger"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ]

  const failure = makeDefault.error ?? setActive.error ?? reorder.error

  return (
    <>
      <PageHeader title={chosen.label} subtitle={chosen.description}>
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Wert
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {failure !== null && failure !== undefined && (
          <div className="mb-6">
            <ErrorNotice error={failure} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(entry) => entry.id}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={entries.isPending}
            error={entries.error}
            empty={
              <EmptyState
                title="Keine Werte"
                description="Diese Liste ist leer. In den Masken bleibt die Auswahl damit ohne Inhalt."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Ersten Wert
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <EntryDialog
        tenantId={tenantId}
        list={list}
        open={creating || editing !== null}
        onClose={close}
        onSubmit={submit}
        form={form}
        onChange={setForm}
        busy={save.isPending}
        error={save.error ?? (complaint === null ? null : new Error(complaint))}
        editing={editing}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Wert löschen"
        description="Nur möglich, solange kein Datensatz auf den Wert zeigt."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => removing && remove.mutate(removing.id)} busy={remove.isPending}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          {removing?.name} wird endgültig entfernt. Wird der Wert noch benutzt, lehnt das Backend
          das ab — dann bleibt das Deaktivieren, und bestehende Datensätze behalten ihn.
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

