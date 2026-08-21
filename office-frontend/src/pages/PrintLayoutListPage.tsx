import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { originState } from '../lib/origin'
import type { PrintLayout } from '../lib/types'
import { usePrintLayouts } from '../printlayout/usePrintLayouts'
import { useLayoutPreview } from '../printlayout/useLayoutPreview'
import { NewLayoutDialog } from './printlayout/NewLayoutDialog'

/** Where a link from this list says it came from. */
const ORIGIN = originState('/druckvorlagen', 'Druckvorlagen')

/**
 * The forms this tenant prints its documents on.
 *
 * <p>Every row says who prints on it. A form on which all the invoices run used to look
 * exactly like one nobody ever chose, and the only way to tell them apart was to open every
 * kind of document in turn.
 */
export function PrintLayoutListPage() {
  return (
    <RequireTenant permission="PRINT_LAYOUT_READ">
      {(tenantId) => <PrintLayouts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function PrintLayouts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mayWrite = can('PRINT_LAYOUT_WRITE')

  /** The form the create dialog starts from; `null` means the dialog is closed. */
  const [adding, setAdding] = useState<{ source: PrintLayout | undefined } | null>(null)

  const layouts = usePrintLayouts(tenantId)
  const preview = useLayoutPreview(tenantId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })

  const deactivate = useMutation({
    mutationFn: (id: number) =>
      api.delete<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${id}`),
    onSuccess: refresh,
  })

  const columns: Column<PrintLayout>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[150px]',
      render: (layout) => <span className="font-mono text-[12px]">{layout.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      // The control, not the row, is the way in — only it can be reached with the keyboard.
      // A drawn form leads into the designer, a shipped one into its copy, which is what
      // has to happen before it can change at all.
      render: (layout) => (
        <span className="grid">
          {mayWrite ? (
            <button
              type="button"
              onClick={() =>
                layout.designed
                  ? void navigate(`/druckvorlagen/${layout.id}`, { state: ORIGIN })
                  : setAdding({ source: layout })
              }
              className="justify-self-start text-left font-medium transition-colors hover:text-accent-text"
            >
              {layout.name}
            </button>
          ) : (
            <span className="font-medium">{layout.name}</span>
          )}
          {layout.system && (
            <span className="text-[11px] text-text-tertiary">
              Mitgeliefert — zum Ändern kopieren
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Art',
      width: 'w-[150px]',
      render: (layout) =>
        layout.system ? (
          <Badge tone="neutral">Mitgeliefert</Badge>
        ) : (
          <Badge tone="accent">Selbst gestaltet</Badge>
        ),
    },
    {
      key: 'usedBy',
      header: 'Verwendet von',
      width: 'w-[220px]',
      render: (layout) => <UsedBy layout={layout} />,
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[120px]',
      render: (layout) =>
        layout.active ? (
          <span className="text-text-secondary">Aktiv</span>
        ) : (
          <Badge tone="muted">Deaktiviert</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[230px]',
      render: (layout) => (
        <span className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => preview.mutate(layout.id)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-accent-text"
          >
            Vorschau
          </button>
          {mayWrite && (
            <button
              type="button"
              onClick={() => setAdding({ source: layout })}
              className="text-[12px] text-text-tertiary transition-colors hover:text-accent-text"
            >
              Kopieren
            </button>
          )}
          {mayWrite && layout.active && !layout.system && (
            <button
              type="button"
              onClick={() => deactivate.mutate(layout.id)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
            >
              Deaktivieren
            </button>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Druckvorlagen"
        subtitle="Wie ein Beleg aussieht. Die mitgelieferte Vorlage lässt sich kopieren und dann frei gestalten."
      >
        {mayWrite && (
          <Button onClick={() => setAdding({ source: undefined })}>
            <Plus size={15} aria-hidden />
            Vorlage
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {(deactivate.error !== null || preview.error !== null) && (
          <div className="mb-6">
            <ErrorNotice error={deactivate.error ?? preview.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={layouts.data ?? []}
            keyOf={(layout) => layout.id}
            // A shipped form has no drawing to open. Clicking it offers the way that does
            // lead somewhere: a copy of it, which is what has to happen before it can change.
            onRowOpen={
              mayWrite
                ? (layout) =>
                    layout.designed
                      ? void navigate(`/druckvorlagen/${layout.id}`, { state: ORIGIN })
                      : setAdding({ source: layout })
                : undefined
            }
            loading={layouts.isPending}
            error={layouts.error}
            empty={
              <EmptyState
                title="Keine Druckvorlagen"
                description="Ohne Vorlage druckt jede Belegart auf der mitgelieferten Standardvorlage."
              />
            }
          />
        </Panel>
      </div>

      {adding !== null && (
        <NewLayoutDialog
          // A fresh dialog per source, so its proposed code and name start from that form.
          key={adding.source?.id ?? 'leer'}
          tenantId={tenantId}
          open
          source={adding.source}
          layouts={layouts.data ?? []}
          onClose={() => setAdding(null)}
          onCreated={(created) => {
            void refresh()
            setAdding(null)
            void navigate(`/druckvorlagen/${created.id}`, { state: ORIGIN })
          }}
        />
      )}
    </>
  )
}

/**
 * Which kinds of document print on one form.
 *
 * <p>Names, not a count: «3 Belegarten» would send the reader looking for which three, and
 * that is the very question this column answers. Each name links to its kind, because the
 * next thing anybody wants after reading it is to go there.
 */
function UsedBy({ layout }: { layout: PrintLayout }) {
  const users = layout.usedBy ?? []
  if (users.length === 0) {
    return <span className="text-text-tertiary">Nicht verwendet</span>
  }
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {users.map((type) => (
        <Link
          key={type.id}
          to={`/belegarten/${type.id}`}
          state={ORIGIN}
          title={type.code}
          className="text-[12px] text-text-secondary underline decoration-line underline-offset-2 transition-colors hover:text-accent-text"
        >
          {type.name}
        </Link>
      ))}
    </span>
  )
}
