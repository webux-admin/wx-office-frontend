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
import { salesDocumentFor } from '../lib/salesDocument'
import type { DocumentType } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { describeCopies } from './documenttype/documentTypeForm'

/** Where a link into the mask says it came from. */
const ORIGIN = originState('/belegarten', 'Belegarten')

/**
 * The kinds of document the tenant writes.
 *
 * <p>Shows what ties a kind to the rest of the system: which form it prints on, how many
 * sheets it prints, and which kinds it may be taken over from.
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
      render: (type) => <span className="font-mono text-small">{type.code}</span>,
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
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary">{categoryLabel(type.category)}</span>
          {/* Which of several kinds of a category a new document starts with. Shown here
              rather than in a column of its own: it is a statement about the category. */}
          {type.categoryDefault === true && <Badge tone="accent">Standard</Badge>}
          {/* The Gutschrift is the only category without a list of its own: it is written
              from the invoice it corrects. */}
          {salesDocumentFor(type.category) === undefined && (
            <Badge tone="neutral">Aus Rechnung</Badge>
          )}
        </span>
      ),
    },
    {
      key: 'prefix',
      header: 'Präfix',
      width: 'w-[90px]',
      render: (type) => (
        <span className="font-mono text-small text-text-secondary">
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
          <span className="block truncate text-text-secondary" title={type.documentLayout}>
            {type.documentLayoutName}
          </span>
        ),
    },
    {
      key: 'copies',
      header: 'Ausdruck',
      width: 'w-[150px]',
      render: (type) => (
        <span className="grid">
          <span
            className={
              (type.copies ?? []).length === 0 ? 'text-text-tertiary' : 'text-text-secondary'
            }
          >
            {describeCopies(type.copies)}
          </span>
          {(type.copies ?? []).length > 0 && (
            <span className="truncate text-small text-text-tertiary">
              {(type.copies ?? [])
                .map((copy) => (copy.internal === true ? `${copy.label} (intern)` : copy.label))
                .join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'predecessors',
      header: 'Vorgängerbeleg',
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
        subtitle="Die Arten von Belegen, die Sie schreiben: Nummer, Druck und woraus sie entstehen."
      >
        {mayWrite && (
          <LinkButton to="/belegarten/neu" state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Neue Belegart
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
                description="Ohne Belegart lässt sich kein Beleg anlegen."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
