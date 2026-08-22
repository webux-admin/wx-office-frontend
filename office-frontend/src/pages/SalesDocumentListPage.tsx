import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, FileInput, Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { SplitButton } from '../components/SplitButton'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatCount, formatDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type {
  DocumentStatus,
  DocumentSummary,
  DocumentType,
  Page,
  SalesDocument,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { CopyDocumentDialog } from './document/CopyDocumentDialog'
import { TakeoverDialog } from './document/TakeoverDialog'

/** What an order mask returns to when it closes here. */
const ORIGIN = originState('/auftraege', 'Aufträge')

/** Status of the badge next to a document. */
const TONES: Record<DocumentStatus, 'muted' | 'accent' | 'danger'> = {
  DRAFT: 'muted',
  FINALISED: 'accent',
  CANCELLED: 'danger',
}

const FILTERS: { id: 'alle' | DocumentStatus; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'DRAFT', label: 'Entwürfe' },
  { id: 'FINALISED', label: 'Ausgestellt' },
  { id: 'CANCELLED', label: 'Storniert' },
]

/**
 * The orders of the tenant.
 *
 * <p>Status, order and count come from the server. The rows are heads without lines: what a
 * list shows is the head of a document, and loading the lines cost a query per row.
 */
export function SalesDocumentListPage() {
  return (
    <RequireTenant permission="ORDER_READ">
      {(tenantId) => <OrderList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function OrderList({ tenantId }: { tenantId: number }) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const { can } = useAuth()
  const [filter, setFilter] = useState<'alle' | DocumentStatus>('alle')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('documentDate,desc')

  const query = listQuery({
    status: filter === 'alle' ? undefined : [filter],
    page,
    size: PAGE_SIZE,
    sort,
  })
  const orders = useQuery({
    queryKey: ['orders', tenantId, query],
    queryFn: () => api.get<Page<DocumentSummary>>(`/api/tenants/${tenantId}/orders?${query}`),
  })

  // The status filter, the order and the count are the server's answer. A list row carries
  // no lines any more, which is why this is a DocumentSummary and not a SalesDocument.
  const result = orders.data ?? emptyPage<DocumentSummary>()
  const rows = result.content

  const columns: Column<DocumentSummary>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-[150px]',
      sortKey: 'documentNumber',
      render: (order) => (
        <Link
          to={`/auftraege/${order.id}`}
          state={ORIGIN}
          className="font-mono text-[12px] transition-colors hover:text-accent-text"
        >
          {order.documentNumber ?? `Entwurf ${order.id}`}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Datum',
      width: 'w-[110px]',
      sortKey: 'documentDate',
      render: (order) => formatDate(order.documentDate),
    },
    {
      key: 'partner',
      header: 'Empfänger',
      sortKey: 'partnerName',
      render: (order) => order.partnerName ?? `Kunde ${order.partnerId}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-[130px]',
      render: (order) => (
        <Badge tone={TONES[order.status]}>{statusLabel(order.status)}</Badge>
      ),
    },
    {
      key: 'net',
      header: 'Netto',
      align: 'right',
      width: 'w-[120px]',
      render: (order) => formatAmount(order.totalNet),
    },
    {
      key: 'gross',
      header: 'Brutto',
      align: 'right',
      width: 'w-[130px]',
      sortKey: 'totalGross',
      render: (order) => (
        <span className="font-medium">
          {formatAmount(order.totalGross)}{' '}
          <span className="text-text-tertiary">{order.currency}</span>
        </span>
      ),
    },
  ]

  const navigate = useNavigate()
  const [takeover, setTakeover] = useState(false)
  const [copying, setCopying] = useState(false)

  // The kinds of Auftrag, so the takeover dialog knows which of them names a predecessor.
  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
    enabled: can('ORDER_WRITE'),
  })
  const orderTypes = (documentTypes.data ?? []).filter(
    (type) => type.category === 'ORDER' && type.active,
  )

  // A document written this way is not finished: it opens straight away, the way a new one
  // does, and the way back out leads to this list.
  const openCreated = (order: SalesDocument) => {
    setTakeover(false)
    setCopying(false)
    void navigate(`/auftraege/${order.id}`, { state: ORIGIN })
  }

  return (
    <>
      <PageHeader title="Aufträge" subtitle={`${formatCount(result.totalElements)} Belege`}>
        {can('ORDER_WRITE') && (
          <SplitButton
            onClick={() => navigate('/auftraege/neu', { state: ORIGIN })}
            menuLabel="Weitere Wege zu einem Auftrag"
            actions={[
              {
                id: 'takeover',
                label: 'Aus Vorgängerbeleg übernehmen…',
                hint: 'Zum Beispiel aus einer Offerte. Beträge werden übernommen.',
                icon: <FileInput size={15} aria-hidden />,
                onSelect: () => setTakeover(true),
              },
              {
                id: 'copy',
                label: 'Auftrag kopieren…',
                hint: 'Positionen eines bestehenden Auftrags als Vorlage.',
                icon: <Copy size={15} aria-hidden />,
                onSelect: () => setCopying(true),
              },
            ]}
          >
            <Plus size={15} aria-hidden />
            Auftrag erfassen
          </SplitButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-1 border-b border-line-subtle px-5 py-3">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={filter === entry.id}
                onClick={() => {
                  setFilter(entry.id)
                  setPage(0)
                }}
                className={`h-8 rounded-[var(--radius-sm)] px-3 text-[13px] transition-colors ${
                  filter === entry.id
                    ? 'bg-sunken text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(order) => order.id}
            rowTo={(order) => `/auftraege/${order.id}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={orders.isPending}
            error={orders.error}
            empty={
              <EmptyState
                title={filter === 'alle' ? 'Noch keine Aufträge' : 'Nichts in diesem Status'}
                description={
                  filter === 'alle'
                    ? 'Ein Auftrag beginnt als Entwurf und bekommt seine Nummer erst beim Ausstellen.'
                    : 'Ein anderer Filter zeigt vielleicht mehr.'
                }
              >
                {filter === 'alle' && can('ORDER_WRITE') && (
                  <LinkButton to="/auftraege/neu" state={ORIGIN}>
                    <Plus size={15} aria-hidden />
                    Ersten Auftrag erfassen
                  </LinkButton>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <TakeoverDialog
        tenantId={tenantId}
        open={takeover}
        onClose={() => setTakeover(false)}
        orderTypes={orderTypes}
        onCreated={openCreated}
      />

      <CopyDocumentDialog
        tenantId={tenantId}
        open={copying}
        onClose={() => setCopying(false)}
        onCreated={openCreated}
      />
    </>
  )
}
