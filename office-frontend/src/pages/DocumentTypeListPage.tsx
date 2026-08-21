import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { LinkButton } from '../components/LinkButton'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { originState } from '../lib/origin'
import type { DocumentType } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { describeCopies } from './documenttype/documentTypeForm'

/** Where a link into the mask says it came from. */
const ORIGIN = originState('/belegarten', 'Belegarten')

/**
 * The kinds of document the tenant writes.
 *
 * <p>Shows what ties a kind to the rest of the system: which form it prints on, what comes
 * out of the printer, and which kinds it may be taken over from. Those three used to be
 * visible only after opening a row, which made the catalogue look narrower than it is.
 */
export function DocumentTypeListPage() {
  return (
    <RequireTenant permission="DOCUMENT_TYPE_READ">
      {(tenantId) => <DocumentTypes tenantId={tenantId} />}
    </RequireTenant>
  )
}

function DocumentTypes({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const mayWrite = can('DOCUMENT_TYPE_WRITE')

  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  const byId = new Map((types.data ?? []).map((type) => [type.id, type]))

  const columns: Column<DocumentType>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[90px]',
      render: (type) => <span className="font-mono text-[12px]">{type.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      // The link, not the row, is the way in: only it can be reached with the keyboard,
      // opened in a new tab and offered to a context menu. `rowTo` is the convenience on top.
      render: (type) => (
        <Link
          to={`/belegarten/${type.id}`}
          state={ORIGIN}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {type.name}
        </Link>
      ),
    },
    {
      key: 'category',
      header: 'Kategorie',
      width: 'w-[180px]',
      render: (type) => (
        <span className="flex items-center gap-2">
          <span className="text-text-secondary">{categoryLabel(type.category)}</span>
          {/* Auftrag is the only category with a mask of its own so far. A kind of any other
              can be set up here and will simply sit unused until that module exists. */}
          {type.category !== 'ORDER' && <Badge tone="neutral">Ohne Maske</Badge>}
        </span>
      ),
    },
    {
      key: 'prefix',
      header: 'Präfix',
      width: 'w-[90px]',
      render: (type) => (
        <span className="font-mono text-[12px] text-text-secondary">
          {type.numberPrefix ?? '-'}
        </span>
      ),
    },
    {
      key: 'layout',
      header: 'Druckvorlage',
      width: 'w-[200px]',
      render: (type) =>
        type.documentLayoutName === undefined ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className="grid">
            <span className="truncate text-text-secondary">{type.documentLayoutName}</span>
            <span className="font-mono text-[11px] text-text-tertiary">
              {type.documentLayout}
            </span>
          </span>
        ),
    },
    {
      key: 'copies',
      header: 'Ausfertigungen',
      width: 'w-[150px]',
      render: (type) => (
        <span className="grid">
          <span className="text-text-secondary">{describeCopies(type.copies)}</span>
          {(type.copies ?? []).length > 0 && (
            <span className="truncate text-[11px] text-text-tertiary">
              {(type.copies ?? []).map((copy) => copy.label).join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'predecessors',
      header: 'Übernahme aus',
      width: 'w-[180px]',
      render: (type) => {
        const names = (type.predecessorTypeIds ?? [])
          .map((id) => byId.get(id)?.name)
          .filter((name) => name !== undefined)
        return names.length === 0 ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className="truncate text-text-secondary" title={names.join(', ')}>
            {names.join(', ')}
          </span>
        )
      },
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[110px]',
      render: (type) =>
        type.active ? (
          <span className="text-text-secondary">Aktiv</span>
        ) : (
          <Badge tone="muted">Deaktiviert</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Belegarten"
        subtitle="Was der Mandant schreibt: Nummernkreis, Druckvorlage, Ausfertigungen und aus welcher Belegart übernommen werden darf."
      >
        {mayWrite && (
          <LinkButton to="/belegarten/neu" state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Belegart
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={types.data ?? []}
            keyOf={(type) => type.id}
            rowTo={(type) => `/belegarten/${type.id}`}
            rowState={ORIGIN}
            loading={types.isPending}
            error={types.error}
            empty={
              <EmptyState
                title="Keine Belegarten"
                description="Ohne Belegart lässt sich kein Beleg anlegen. Sie bestimmt Nummernkreis, Adresse und Druckvorlage."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
