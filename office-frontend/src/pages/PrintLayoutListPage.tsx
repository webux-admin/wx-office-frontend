import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import type { PrintLayout } from '../lib/types'
import { usePrintLayouts } from '../printlayout/usePrintLayouts'

/** The forms this tenant prints its documents on. */
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

  const [copying, setCopying] = useState<PrintLayout | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  const layouts = usePrintLayouts(tenantId)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })

  const copy = useMutation({
    mutationFn: () =>
      api.post<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${copying?.id}/copy`, {
        code: code.trim(),
        name: name.trim(),
      }),
    onSuccess: (created) => {
      void refresh()
      setCopying(null)
      void navigate(`/druckvorlagen/${created.id}`)
    },
  })

  const deactivate = useMutation({
    mutationFn: (id: number) =>
      api.delete<PrintLayout>(`/api/tenants/${tenantId}/print-layouts/${id}`),
    onSuccess: refresh,
  })

  const openCopy = (layout: PrintLayout) => {
    setCopying(layout)
    setCode(`${layout.code}-2`.slice(0, 30))
    setName(`${layout.name} (Kopie)`.slice(0, 60))
    copy.reset()
  }

  const columns: Column<PrintLayout>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[160px]',
      render: (layout) => <span className="font-mono text-[12px]">{layout.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (layout) =>
        layout.designed && mayWrite ? (
          <button
            type="button"
            onClick={() => navigate(`/druckvorlagen/${layout.id}`)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {layout.name}
          </button>
        ) : (
          <span className="font-medium">{layout.name}</span>
        ),
    },
    {
      key: 'kind',
      header: 'Art',
      width: 'w-[170px]',
      render: (layout) =>
        layout.system ? (
          <Badge tone="neutral">Mitgeliefert</Badge>
        ) : (
          <Badge tone="accent">Selbst gestaltet</Badge>
        ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[230px]',
      render: (layout) => (
        <span className="flex items-center gap-3">
          {layout.active ? (
            <span className="text-text-secondary">Aktiv</span>
          ) : (
            <Badge tone="muted">Deaktiviert</Badge>
          )}
          {mayWrite && (
            <button
              type="button"
              onClick={() => openCopy(layout)}
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
        {mayWrite && layouts.data && layouts.data.length > 0 && (
          <Button onClick={() => openCopy(layouts.data[0])}>
            <Plus size={15} aria-hidden />
            Vorlage
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
            rows={layouts.data ?? []}
            keyOf={(layout) => layout.id}
            onRowOpen={
              mayWrite
                ? (layout) => layout.designed && navigate(`/druckvorlagen/${layout.id}`)
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

      <Dialog
        open={copying !== null}
        onClose={() => setCopying(null)}
        title="Vorlage kopieren"
        description="Die Kopie startet mit derselben Anordnung und lässt sich frei gestalten."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCopying(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => copy.mutate()}
              busy={copy.isPending}
              disabled={code.trim() === '' || name.trim() === ''}
            >
              Kopieren
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <TextField
            label="Code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={30}
            hint="Buchstaben, Ziffern, Bindestrich. Danach unveränderlich."
          />
          <TextField
            label="Bezeichnung"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          {copy.error !== null && <ErrorNotice error={copy.error} />}
        </div>
      </Dialog>
    </>
  )
}
