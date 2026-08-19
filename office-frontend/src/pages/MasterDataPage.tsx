import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { defaultCodeOf, labelPayload } from '../lib/masterData'
import type { MasterDataEntry, MasterDataList } from '../lib/types'
import { useMasterDataEntries, useMasterDataList } from '../masterdata/useMasterData'
import { EntryDialog } from './masterdata/EntryDialog'
import { EMPTY_ENTRY, entryComplaint, toEntryForm, type EntryForm } from './masterdata/entryForm'

/** The lists a tenant maintains, in the order they are offered. */
const LISTS: { list: MasterDataList; label: string; description: string }[] = [
  {
    list: 'legal-forms',
    label: 'Rechtsformen',
    description: 'Die Rechtsform einer Firma, bei Kunden, Lieferanten und beim Mandanten.',
  },
  {
    list: 'salutations',
    label: 'Anreden',
    description: 'Wie eine Person angeschrieben wird.',
  },
  {
    list: 'units',
    label: 'Einheiten',
    description: 'Worin ein Produkt verkauft wird. Die Kurzform steht auf der Belegzeile.',
  },
  {
    list: 'languages',
    label: 'Sprachen',
    description: 'Korrespondenzsprachen. Der Code ist das Sprachkürzel, zum Beispiel de.',
  },
  {
    list: 'countries',
    label: 'Länder',
    description: 'Länder einer Adresse. Der Code ist das Kürzel nach ISO, zum Beispiel CH.',
  },
  {
    list: 'currencies',
    label: 'Währungen',
    description: 'Währungen, in denen Belege ausgestellt werden können.',
  },
  {
    list: 'layout-templates',
    label: 'Druckvorlagen',
    description: 'Vorlagen, nach denen eine Belegart gedruckt wird.',
  },
  {
    list: 'revenue-accounts',
    label: 'Ertragskonten',
    description: 'Konten, auf die eine Belegzeile gebucht wird. Der Code ist die Kontonummer.',
  },
]

/**
 * The selection values of the tenant.
 *
 * <p>What used to be an enum in the code is master data: the values are added, renamed,
 * sorted and deactivated here. Deleting works only for a value nothing points at and that was
 * not delivered with the application; anything else is refused by the backend, and its answer
 * is what the dialog shows.
 */
export function MasterDataPage() {
  return (
    <RequireTenant permission="MASTERDATA_READ">
      {(tenantId) => <MasterData tenantId={tenantId} />}
    </RequireTenant>
  )
}

function MasterData({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('MASTERDATA_WRITE')
  const mayDeactivate = can('MASTERDATA_DEACTIVATE')

  const [list, setList] = useState<MasterDataList>('legal-forms')
  const [editing, setEditing] = useState<MasterDataEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<EntryForm>(EMPTY_ENTRY)
  const [removing, setRemoving] = useState<MasterDataEntry | null>(null)
  const [complaint, setComplaint] = useState<string | null>(null)

  // The name of a value is its text in the tenant's default language, and the API keeps that
  // text twice: as `name` and as the translation for that language. Both are written together.
  const defaultLanguage = defaultCodeOf(useMasterDataEntries(tenantId, 'languages'))
  const chosen = LISTS.find((entry) => entry.list === list) ?? LISTS[0]
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
      <PageHeader
        title="Auswahllisten"
        subtitle="Die Auswahlwerte dieses Mandanten. Was hier steht, steht in den Masken zur Wahl."
      >
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Wert
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <div className="mb-6 flex flex-wrap gap-1 border-b border-line-subtle" role="tablist">
          {LISTS.map((entry) => (
            <button
              key={entry.list}
              type="button"
              role="tab"
              aria-selected={list === entry.list}
              onClick={() => {
                close()
                setList(entry.list)
              }}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
                list === entry.list
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {failure !== null && failure !== undefined && (
          <div className="mb-6">
            <ErrorNotice error={failure} />
          </div>
        )}

        <Panel title={chosen.label} description={chosen.description} padded={false}>
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

