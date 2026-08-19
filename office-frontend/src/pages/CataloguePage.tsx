import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import type { CatalogueEntry, CatalogueName } from '../lib/types'
import { useCatalogues, useMasterDataEntries } from '../masterdata/useMasterData'
import { CatalogueDialog } from './catalogue/CatalogueDialog'
import {
  CATALOGUES,
  catalogueComplaint,
  reorderPayload,
  toCatalogueForm,
  toCataloguePayload,
  type CatalogueForm,
} from './catalogue/catalogueForm'

const EMPTY_FORM: CatalogueForm = { name: '', shortName: '', visible: true, translations: {} }

/**
 * The fixed values of the application, in nine catalogues.
 *
 * <p>Which values exist is decided in the backend code, because they steer logic: the state
 * model of a document, the VAT return, which fields a record must carry. So nothing is added
 * here and nothing is deleted — what a tenant decides is how a value is named, in which order
 * it stands and whether it is still offered.
 */
export function CataloguePage() {
  return (
    <RequireTenant permission="MASTERDATA_READ">
      {(tenantId) => <Catalogue tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Catalogue({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('MASTERDATA_WRITE')

  const [name, setName] = useState<CatalogueName>('partner-type')
  const [editing, setEditing] = useState<CatalogueEntry | null>(null)
  const [form, setForm] = useState<CatalogueForm>(EMPTY_FORM)
  const [complaint, setComplaint] = useState<string | null>(null)
  const [resetting, setResetting] = useState<CatalogueEntry | null>(null)

  const chosen = CATALOGUES.find((catalogue) => catalogue.name === name) ?? CATALOGUES[0]
  const base = `/api/tenants/${tenantId}/catalogues/${name}`

  // One request brings all nine catalogues, hidden values included: they have to be visible
  // here to be offered again.
  const catalogues = useCatalogues(tenantId)
  const rows = catalogues.data?.[name] ?? []
  const defaultLanguage = defaultCodeOf(useMasterDataEntries(tenantId, 'languages'))

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalogues', tenantId] })

  const save = useMutation({
    mutationFn: (entry: CatalogueEntry) => {
      // One German input, two stored fields: `labelPayload` writes the text under the default
      // language of the tenant, and `toCataloguePayload` sends it as the name as well. The
      // backend keeps the two apart and syncs neither, so writing only one of them would leave
      // tables and dropdowns disagreeing.
      const labels = labelPayload(form.name, form.translations, defaultLanguage)
      const payload = toCataloguePayload(form, entry, labels)
      return api.put<CatalogueEntry>(`${base}/${entry.code}`, payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const setVisible = useMutation({
    // A full replace again: everything the value carries goes back out, only the flag differs.
    mutationFn: (entry: CatalogueEntry) =>
      api.put<CatalogueEntry>(`${base}/${entry.code}`, {
        ...entry,
        visible: entry.visible === false,
      }),
    onSuccess: refresh,
  })

  const reorder = useMutation({
    // There is no endpoint for a whole order, so one arrow press is one request per moved row.
    // They go out together and count as one mutation, so a half-done move cannot be seen.
    mutationFn: (entries: CatalogueEntry[]) =>
      Promise.all(
        entries.map((entry) => api.put<CatalogueEntry>(`${base}/${entry.code}`, entry)),
      ),
    onSuccess: refresh,
  })

  const reset = useMutation({
    mutationFn: (entry: CatalogueEntry) => api.delete<CatalogueEntry>(`${base}/${entry.code}`),
    onSuccess: () => {
      void refresh()
      setResetting(null)
    },
  })

  const close = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setComplaint(null)
    save.reset()
  }

  const openEdit = (entry: CatalogueEntry) => {
    setForm(toCatalogueForm(entry, defaultLanguage))
    setComplaint(null)
    save.reset()
    setEditing(entry)
  }

  const submit = () => {
    if (editing === null) return
    const problem = catalogueComplaint(form)
    setComplaint(problem)
    if (problem !== null) return
    save.mutate(editing)
  }

  /** Moves one value past its neighbour and writes back the rows whose position changed. */
  const move = (index: number, direction: -1 | 1) => {
    const payload = reorderPayload(rows, index, direction)
    if (payload.length === 0) return
    reorder.mutate(payload)
  }

  // The position has no column of its own: the arrows are the way to change it, and a number
  // the user cannot fully control — the delivered values are 100, 200, 300 and not contiguous —
  // would only raise questions the mask cannot answer.
  const columns: Column<CatalogueEntry>[] = [
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
      width: 'w-[190px]',
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
      width: 'w-[220px]',
      render: (entry) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {entry.visible === false && <Badge tone="muted">Ausgeblendet</Badge>}
          {mayWrite && (
            <button
              type="button"
              onClick={() => setVisible.mutate(entry)}
              disabled={setVisible.isPending}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              {entry.visible === false ? 'Wieder anbieten' : 'Ausblenden'}
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[130px]',
      render: (entry) =>
        mayWrite ? (
          <span className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                reset.reset()
                setResetting(entry)
              }}
              className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
            >
              Zurücksetzen
            </button>
          </span>
        ) : null,
    },
  ]

  const failure = setVisible.error ?? reorder.error

  return (
    <>
      <PageHeader
        title="Feste Werte"
        subtitle="Diese Werte sind in der Anwendung festgelegt, weil sie Abläufe steuern. Ändern lässt sich, wie sie heissen, in welcher Reihenfolge sie stehen und ob sie noch angeboten werden."
      />

      <div className="px-8 pb-12">
        <div className="mb-6 flex flex-wrap gap-1 border-b border-line-subtle" role="tablist">
          {CATALOGUES.map((catalogue) => (
            <button
              key={catalogue.name}
              type="button"
              role="tab"
              aria-selected={name === catalogue.name}
              onClick={() => {
                close()
                setName(catalogue.name)
              }}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
                name === catalogue.name
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {catalogue.title}
            </button>
          ))}
        </div>

        {failure !== null && (
          <div className="mb-6">
            <ErrorNotice error={failure} />
          </div>
        )}

        <Panel title={chosen.title} description={chosen.description} padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(entry) => entry.code}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={catalogues.isPending}
            error={catalogues.error}
            empty={
              <EmptyState
                title="Keine Werte"
                description="Diesen Katalog liefert die Anwendung mit. Eine leere Liste ist deshalb keine Einstellung, sondern ein Defekt."
              />
            }
          />
        </Panel>
      </div>

      <CatalogueDialog
        open={editing !== null}
        onClose={close}
        onSubmit={submit}
        tenantId={tenantId}
        entry={editing}
        form={form}
        onChange={setForm}
        busy={save.isPending}
        error={save.error ?? (complaint === null ? null : new Error(complaint))}
      />

      <Dialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Wert zurücksetzen"
        description="Es gilt wieder, was die Anwendung ausliefert."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => resetting && reset.mutate(resetting)}
              busy={reset.isPending}
            >
              Zurücksetzen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          {resetting?.name} heisst danach wieder so, wie die Anwendung den Wert benennt. Die eigene
          Bezeichnung, die Kurzform, die Übersetzungen und die Position gehen dabei verloren.
        </p>
        <p className="mt-2 text-[13px] text-text-secondary">
          Der Wert selbst bleibt: der Code ändert sich nicht, und alle Belege und Datensätze, die
          darauf zeigen, bleiben unberührt.
        </p>
        {reset.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={reset.error} />
          </div>
        )}
      </Dialog>
    </>
  )
}

