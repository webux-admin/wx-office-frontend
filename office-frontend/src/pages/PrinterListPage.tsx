import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import type { Printer } from '../lib/types'
import { PrinterDialog } from './printer/PrinterDialog'
import {
  EMPTY_PRINTER,
  describeTrays,
  printerComplaint,
  toPrinterForm,
  toPrinterPayload,
  type PrinterForm,
} from './printer/printerForm'

/**
 * The printers of the tenant, with their paper trays.
 *
 * <p>They are a note, not a connection: nothing in this application talks to a printer, and no
 * web API lets a page choose the device a sheet comes out of. What is kept here is shown next
 * to the print dialog so the person standing in front of it picks the right one (ADR-0009).
 *
 * <p>A printer that a kind of document or a document points at is not deleted but deactivated
 * — the backend refuses the delete, and this screen offers both.
 */
export function PrinterListPage() {
  return (
    <RequireTenant permission="PRINTER_READ">
      {(tenantId) => <Printers tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Printers({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRINTER_WRITE')

  const [editing, setEditing] = useState<Printer | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<PrinterForm>(EMPTY_PRINTER)
  const [complaint, setComplaint] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Printer | null>(null)

  const base = `/api/tenants/${tenantId}/printers`

  // The endpoint answers with every printer, deactivated ones included: they have to be
  // visible to be switched on again, and a document written yesterday may still point at one.
  const printers = useQuery({
    queryKey: ['printers', tenantId],
    queryFn: () => api.get<Printer[]>(base),
  })
  const rows = printers.data ?? []

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['printers', tenantId] })
    // The kinds of document name the printer of each copy, so their list is stale as well.
    void queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = toPrinterPayload(form)
      return editing
        ? api.put<Printer>(`${base}/${editing.id}`, payload)
        : api.post<Printer>(base, payload)
    },
    onSuccess: () => {
      refresh()
      close()
    },
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => api.post<Printer>(`${base}/${id}/deactivate`, undefined),
    onSuccess: refresh,
  })

  // Only for a printer nothing points at. The backend answers 409 for one that is set on a
  // kind of document or on a document, and the message says so — deleting it would take the
  // hint off a document that was issued with it.
  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`${base}/${id}`),
    onSuccess: () => {
      refresh()
      setRemoving(null)
    },
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_PRINTER)
    setComplaint(null)
    save.reset()
  }

  const openNew = () => {
    setForm(EMPTY_PRINTER)
    setEditing(null)
    setComplaint(null)
    save.reset()
    setCreating(true)
  }

  const openEdit = (printer: Printer) => {
    setForm(toPrinterForm(printer))
    setEditing(printer)
    setComplaint(null)
    save.reset()
    setCreating(false)
  }

  const submit = () => {
    const problem = printerComplaint(form, editing === null)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  const columns: Column<Printer>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[160px]',
      render: (printer) => <span className="font-mono text-[12px]">{printer.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (printer) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(printer)}
            className="text-left font-medium transition-colors hover:text-accent-text"
          >
            {printer.name}
          </button>
        ) : (
          <span className="font-medium">{printer.name}</span>
        ),
    },
    {
      key: 'location',
      header: 'Standort',
      render: (printer) => (
        <span className="text-text-secondary">
          {printer.location === undefined || printer.location === '' ? '—' : printer.location}
        </span>
      ),
    },
    {
      key: 'trays',
      header: 'Schächte',
      render: (printer) => <span className="text-text-secondary">{describeTrays(printer)}</span>,
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[140px]',
      render: (printer) =>
        printer.active === false ? <Badge tone="muted">Deaktiviert</Badge> : null,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[180px]',
      render: (printer) => (
        <span className="flex items-center justify-end gap-3">
          {mayWrite && printer.active !== false && (
            <button
              type="button"
              onClick={() => {
                deactivate.reset()
                deactivate.mutate(printer.id)
              }}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              Deaktivieren
            </button>
          )}
          {mayWrite && printer.active === false && (
            <button
              type="button"
              onClick={() => openEdit(printer)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              Aktivieren
            </button>
          )}
          {mayWrite && (
            <button
              type="button"
              onClick={() => {
                remove.reset()
                setRemoving(printer)
              }}
              aria-label={`${printer.name} löschen`}
              className="text-text-tertiary transition-colors hover:text-danger"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Drucker"
        subtitle="Geräte und Schächte, die einer Belegart oder einer Ausfertigung hinterlegt werden."
      >
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Drucker
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {deactivate.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={deactivate.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(printer) => printer.id}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={printers.isPending}
            error={printers.error}
            empty={
              <EmptyState
                title="Keine Drucker erfasst"
                description="Ohne Drucker bleibt bei einer Ausfertigung offen, wohin sie gedacht ist — gedruckt wird trotzdem, über den Dialog des Browsers."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Ersten Drucker erfassen
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>

        <p className="mt-4 max-w-[70ch] text-[12px] text-text-tertiary">
          Gedruckt wird immer über den Druckdialog des Browsers. Zielgerät, Schacht und
          Exemplarzahl kann keine Webseite setzen — die Angaben hier werden beim Drucken
          angezeigt, damit im Dialog das Richtige gewählt wird.
        </p>
      </div>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Drucker löschen"
        description="Nur möglich, solange keine Belegart und kein Beleg darauf zeigt."
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
          {removing?.name} wird endgültig entfernt. Zeigt noch eine Belegart oder ein Beleg
          darauf, lehnt das Backend das ab — dann bleibt das Deaktivieren. Was auf einem
          ausgestellten Beleg steht, ändert sich in keinem Fall.
        </p>
        {remove.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </Dialog>

      <PrinterDialog
        open={creating || editing !== null}
        onClose={close}
        onSubmit={submit}
        form={form}
        onChange={setForm}
        busy={save.isPending}
        error={save.error ?? (complaint === null ? null : new Error(complaint))}
        editing={editing}
      />
    </>
  )
}
