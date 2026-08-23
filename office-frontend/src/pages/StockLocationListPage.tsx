import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Star } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { INVENTORY_RIGHTS, stockLocationsKey, stockLocationsUrl } from '../lib/inventory'
import type { NegativeStockPolicy, StockLocation } from '../lib/types'
import {
  belongsToCode,
  emptyLocationForm,
  firstLocationComplaint,
  toLocationForm,
  toLocationPayload,
  type StockLocationForm,
} from './inventory/stockLocationForm'

/**
 * The places a tenant keeps goods in.
 *
 * <p>A short list with six fields per row, so the records are edited in a dialog rather than
 * in a mask of their own — the same shape the price groups have, and for the same reason.
 *
 * <p>Two things are steps of their own rather than fields in that dialog. The default mark,
 * because setting it takes the mark off another location; and switching one off, because
 * there is no delete and the rules behind it name their own way out.
 */
export function StockLocationListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read}>
      {(tenantId) => <StockLocations tenantId={tenantId} />}
    </RequireTenant>
  )
}

function StockLocations({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(INVENTORY_RIGHTS.configure)

  const [editing, setEditing] = useState<StockLocation | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<StockLocationForm>(emptyLocationForm())
  const [complaint, setComplaint] = useState<string | null>(null)
  const codeField = useRef<HTMLInputElement>(null)

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(stockLocationsUrl(tenantId)),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: stockLocationsKey(tenantId) })

  const save = useMutation({
    mutationFn: () => {
      const payload = toLocationPayload(form)
      return editing
        ? api.put<StockLocation>(`${stockLocationsUrl(tenantId)}/${editing.id}`, payload)
        : api.post<StockLocation>(stockLocationsUrl(tenantId), payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const makeDefault = useMutation({
    mutationFn: (id: number) =>
      api.put<StockLocation>(`${stockLocationsUrl(tenantId)}/${id}/default`, undefined),
    onSuccess: refresh,
  })

  const deactivate = useMutation({
    mutationFn: (id: number) =>
      api.post<StockLocation>(`${stockLocationsUrl(tenantId)}/${id}/deactivate`, undefined),
    onSuccess: refresh,
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(emptyLocationForm())
    setComplaint(null)
    save.reset()
  }

  const openNew = () => {
    setForm(emptyLocationForm())
    setComplaint(null)
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (location: StockLocation) => {
    setForm(toLocationForm(location))
    setComplaint(null)
    setEditing(location)
    setCreating(false)
  }

  const submit = () => {
    const found = firstLocationComplaint(form, editing === null)
    setComplaint(found)
    if (found !== null) return
    save.mutate()
  }

  const change = (fields: Partial<StockLocationForm>) => setForm({ ...form, ...fields })

  const columns: Column<StockLocation>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[110px]',
      render: (location) => <span className="font-mono text-[12px]">{location.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (location) =>
        mayConfigure ? (
          <button
            type="button"
            onClick={() => openEdit(location)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {location.name}
          </button>
        ) : (
          <span className="font-medium">{location.name}</span>
        ),
    },
    {
      key: 'bin',
      header: 'Lagerplatz',
      render: (location) => <span className="text-text-secondary">{location.binHint ?? '-'}</span>,
    },
    {
      key: 'policy',
      header: 'Bei Unterdeckung',
      width: 'w-[150px]',
      render: (location) => (
        <span className="text-text-secondary">
          {location.negativeStockPolicy === 'BLOCK' ? 'Sperren' : 'Warnen'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[190px]',
      render: (location) => (
        <span className="flex flex-wrap items-center gap-1">
          {location.defaultLocation === true && <Badge tone="accent">Vorgabe</Badge>}
          {location.active === false && <Badge tone="muted">Deaktiviert</Badge>}
          {mayConfigure && location.defaultLocation !== true && location.active !== false && (
            <button
              type="button"
              onClick={() => location.id !== undefined && makeDefault.mutate(location.id)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
            >
              <Star size={12} aria-hidden />
              Als Vorgabe
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[120px]',
      render: (location) =>
        mayConfigure && location.active !== false && location.defaultLocation !== true ? (
          <button
            type="button"
            onClick={() => location.id !== undefined && deactivate.mutate(location.id)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
          >
            Deaktivieren
          </button>
        ) : null,
    },
  ]

  const open = creating || editing !== null
  // What went wrong, wherever it came from. A complaint about the code belongs at the field:
  // a banner over the whole dialog makes the reader look for what is wrong.
  const message =
    complaint ?? (save.error instanceof Error && open ? save.error.message : null)
  const codeComplaint = message !== null && belongsToCode(message) ? message : null
  const dialogComplaint = codeComplaint === null ? message : null

  return (
    <>
      <PageHeader
        title="Lagerorte"
        subtitle={`${formatCount(locations.data?.length ?? 0)} Lagerorte`}
      >
        {mayConfigure && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Neuer Lagerort
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {(makeDefault.error || deactivate.error) && (
          <div className="mb-6">
            <ErrorNotice error={makeDefault.error ?? deactivate.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={locations.data ?? []}
            keyOf={(location) => location.id ?? location.code}
            onRowOpen={mayConfigure ? openEdit : undefined}
            loading={locations.isPending}
            error={locations.error}
            empty={
              <EmptyState
                title="Noch kein Lagerort erfasst"
                description="Ohne Lagerort lässt sich nichts buchen. Jeder Mandant startet mit «HAUPT»."
              >
                {mayConfigure && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Ersten Lagerort erfassen
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <Dialog
        open={open}
        onClose={close}
        title={editing ? 'Lagerort bearbeiten' : 'Neuer Lagerort'}
        initialFocus={codeField}
        onSubmit={save.isPending ? undefined : submit}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button onClick={submit} busy={save.isPending} shortcut>
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {dialogComplaint !== null && <ErrorNotice error={new Error(dialogComplaint)} />}
          <TextField
            ref={codeField}
            label="Code"
            // Upper case while typing: the server normalises it anyway, and seeing the
            // letters jump after saving reads as a defect rather than as a rule.
            value={form.code}
            onChange={(event) => change({ code: event.target.value.toUpperCase() })}
            maxLength={20}
            disabled={editing !== null}
            invalid={codeComplaint !== null}
            hint={
              codeComplaint ??
              (editing !== null
                ? 'Der Code bleibt: Bewegungen und Belege zeigen auf diesen Lagerort.'
                : 'Kurz und stabil, zum Beispiel HAUPT oder AUSSEN.')
            }
          />
          <TextField
            label="Bezeichnung"
            value={form.name}
            onChange={(event) => change({ name: event.target.value })}
            maxLength={100}
          />
          <TextField
            label="Lagerplatz"
            value={form.binHint}
            onChange={(event) => change({ binHint: event.target.value })}
            maxLength={60}
            hint="Freitext, zum Beispiel «Regal C3». Eine Ortshierarchie gibt es bewusst nicht."
          />
          <CatalogueSelect
            label="Bei Unterdeckung"
            tenantId={tenantId}
            catalogue="negative-stock-policy"
            value={form.negativeStockPolicy}
            onChange={(code) => change({ negativeStockPolicy: code as NegativeStockPolicy })}
            hint="Wird ausgewertet, sobald ein Lieferschein Bestand abbucht."
          />
          <TextAreaField
            label="Bemerkung"
            value={form.note}
            onChange={(event) => change({ note: event.target.value })}
            maxLength={500}
            rows={3}
          />
          <CheckboxField
            label="Aktiv"
            checked={form.active}
            onChange={(event) => change({ active: event.target.checked })}
            disabled={editing === null || editing.defaultLocation === true}
            hint={
              editing?.defaultLocation === true
                ? 'Der Vorgabe-Lagerort lässt sich nicht deaktivieren. Setzen Sie zuerst einen anderen Lagerort als Vorgabe.'
                : undefined
            }
          />
        </div>
      </Dialog>
    </>
  )
}
