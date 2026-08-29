import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, FileInput, Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { SplitButton, type SplitButtonAction } from '../components/SplitButton'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatCount, formatDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import {
  indefiniteArticle,
  salesDocumentListKey,
  type SalesDocumentKind,
} from '../lib/salesDocument'
import type {
  DocumentStatus,
  DocumentSummary,
  DocumentType,
  OfferOutcome,
  Page,
  SalesDocument,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { CopyDocumentDialog } from './document/CopyDocumentDialog'
import { TakeoverDialog } from './document/TakeoverDialog'

/** Status of the badge next to a document. */
const TONES: Record<DocumentStatus, 'muted' | 'accent' | 'danger'> = {
  DRAFT: 'muted',
  FINALISED: 'accent',
  CANCELLED: 'danger',
}

/** Badge tone of each outcome of an issued offer, matching the head of its mask. */
const OUTCOME_TONES: Record<OfferOutcome, 'accent' | 'success' | 'danger'> = {
  OPEN: 'accent',
  ACCEPTED: 'success',
  DECLINED: 'danger',
}

/** One filter chip: what it is called, and what it asks the server for. */
type DocumentFilter = {
  id: string
  label: string
  status?: DocumentStatus
  outcome?: OfferOutcome
  /**
   * Asks the server for offers past their valid-until day. Left undefined rather than false
   * everywhere else, so the other chips carry no `expired=false` in their query strings.
   */
  expired?: boolean
  /**
   * Asks the server for Rechnungen that still owe money past their due day. Left undefined
   * everywhere else, for the same reason as `expired`.
   */
  overdue?: boolean
}

const FILTERS: DocumentFilter[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'DRAFT', label: 'Entwürfe', status: 'DRAFT' },
  { id: 'FINALISED', label: 'Ausgestellt', status: 'FINALISED' },
  { id: 'CANCELLED', label: 'Storniert', status: 'CANCELLED' },
]

/**
 * The chips of a kind that is followed up: the issued documents split by their outcome
 * instead of standing behind one «Ausgestellt».
 */
const TRACKING_FILTERS: DocumentFilter[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'DRAFT', label: 'Entwürfe', status: 'DRAFT' },
  { id: 'OPEN', label: 'Offen', status: 'FINALISED', outcome: 'OPEN' },
  // A narrowing of «Offen», not a slice out of it: the open chip keeps showing the expired
  // ones too — an offer past its day is still waiting for an answer.
  { id: 'EXPIRED', label: 'Abgelaufen', status: 'FINALISED', outcome: 'OPEN', expired: true },
  { id: 'ACCEPTED', label: 'Angenommen', status: 'FINALISED', outcome: 'ACCEPTED' },
  { id: 'DECLINED', label: 'Abgelehnt', status: 'FINALISED', outcome: 'DECLINED' },
  { id: 'CANCELLED', label: 'Storniert', status: 'CANCELLED' },
]

/**
 * The chips of a kind that can owe money: «Ausgestellt» gains a narrowing for the ones
 * somebody has to chase.
 *
 * <p>«Überfällig» is a narrowing of «Ausgestellt», not a slice out of it: the issued chip
 * keeps showing the overdue ones too — an overdue Rechnung is still an issued Rechnung
 * (backend ADR-0091).
 */
const RECEIVABLE_FILTERS: DocumentFilter[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'DRAFT', label: 'Entwürfe', status: 'DRAFT' },
  { id: 'FINALISED', label: 'Ausgestellt', status: 'FINALISED' },
  { id: 'OVERDUE', label: 'Überfällig', status: 'FINALISED', overdue: true },
  { id: 'CANCELLED', label: 'Storniert', status: 'CANCELLED' },
]

/**
 * The documents of one kind belonging to the tenant.
 *
 * <p>Status, order and count come from the server. The rows are heads without lines: what a
 * list shows is the head of a document, and loading the lines cost a query per row.
 *
 * @param kind which kind of document this list shows, named by the route
 */
export function SalesDocumentListPage({ kind }: { kind: SalesDocumentKind }) {
  return (
    <RequireTenant permission={kind.rights.read}>
      {(tenantId) => <DocumentList tenantId={tenantId} kind={kind} />}
    </RequireTenant>
  )
}

function DocumentList({ tenantId, kind }: { tenantId: number; kind: SalesDocumentKind }) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const outcomeLabel = useCatalogueLabel(tenantId, 'offer-outcome')
  const { can } = useAuth()
  const filters = kind.tracking
    ? TRACKING_FILTERS
    : kind.receivable
      ? RECEIVABLE_FILTERS
      : FILTERS
  const [filterId, setFilterId] = useState('alle')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('documentDate,desc')

  /** What a mask opened from here returns to when it closes. */
  const origin = originState(kind.path, kind.plural)

  const filter = filters.find((entry) => entry.id === filterId) ?? filters[0]
  // The outcome travels in the query string and with it in the cache key, like every other
  // filter; the server does the narrowing.
  const query = listQuery({
    status: filter.status === undefined ? undefined : [filter.status],
    outcome: filter.outcome,
    expired: filter.expired,
    overdue: filter.overdue,
    page,
    size: PAGE_SIZE,
    sort,
  })
  // The kind belongs in the key: the four lists read the same shape off four resources, and
  // without it the Rechnungen would be answered out of the cache with the Aufträge.
  const documents = useQuery({
    queryKey: salesDocumentListKey(kind, tenantId, query),
    queryFn: () =>
      api.get<Page<DocumentSummary>>(`/api/tenants/${tenantId}/${kind.resource}?${query}`),
  })

  // The status filter, the order and the count are the server's answer. A list row carries
  // no lines any more, which is why this is a DocumentSummary and not a SalesDocument.
  const result = documents.data ?? emptyPage<DocumentSummary>()
  const rows = result.content

  const columns: Column<DocumentSummary>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-[150px]',
      sortKey: 'documentNumber',
      render: (row) => (
        <Link
          to={`${kind.path}/${row.id}`}
          state={origin}
          className="font-mono text-[12px] transition-colors hover:text-accent-text"
        >
          {row.documentNumber ?? `Entwurf ${row.id}`}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Datum',
      width: 'w-[110px]',
      sortKey: 'documentDate',
      render: (row) => formatDate(row.documentDate),
    },
    {
      key: 'partner',
      header: 'Empfänger',
      sortKey: 'partnerName',
      render: (row) => row.partnerName ?? `Kunde ${row.partnerId}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-[130px]',
      // An issued offer wears its outcome, the way the head of its mask does. Drafts and
      // cancelled documents read as everywhere else, and so does every other kind. Only the
      // open offer can be expired — a mark wins over the calendar.
      render: (row) =>
        kind.tracking && row.status === 'FINALISED' && row.offerOutcome !== undefined ? (
          row.offerOutcome === 'OPEN' && row.offerExpired ? (
            <Badge tone="danger">{outcomeLabel('EXPIRED')}</Badge>
          ) : (
            <Badge tone={OUTCOME_TONES[row.offerOutcome]}>{outcomeLabel(row.offerOutcome)}</Badge>
          )
        ) : (
          <Badge tone={TONES[row.status]}>{statusLabel(row.status)}</Badge>
        ),
    },
    {
      key: 'net',
      header: 'Netto',
      align: 'right',
      width: 'w-[120px]',
      render: (row) => formatAmount(row.totalNet),
    },
    {
      key: 'gross',
      header: 'Brutto',
      align: 'right',
      width: 'w-[130px]',
      sortKey: 'totalGross',
      render: (row) => (
        <span className="font-medium">
          {formatAmount(row.totalGross)}{' '}
          <span className="text-text-tertiary">{row.currency}</span>
        </span>
      ),
    },
  ]

  // Only where money can be owed. The column is absent, not empty, on the other three
  // kinds — a «Offen» column full of dashes would suggest the question had been asked.
  if (kind.receivable) {
    columns.push({
      key: 'open',
      header: 'Offen',
      align: 'right',
      width: 'w-[140px]',
      render: (row) => <OpenCell row={row} />,
    })
  }

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [takeover, setTakeover] = useState(false)
  const [copying, setCopying] = useState(false)

  // The kinds of document of this category, so the takeover dialog knows which of them names
  // a predecessor. The catalogue has a right of its own, so asking without it would only
  // collect a 403 nobody shows.
  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
    enabled: can(kind.rights.write) && can('DOCUMENT_TYPE_READ'),
  })
  const activeTypes = (documentTypes.data ?? []).filter(
    (type) => type.category === kind.category && type.active,
  )

  // A way that does not exist does not belong in the menu: where no kind names a predecessor,
  // there is nothing to take over from. For the Offerte that is the normal case and not a gap
  // in the settings — it stands at the beginning of the sale.
  //
  // Hidden only where that is known, which needs the catalogue to have arrived. Whoever may
  // not read it keeps the entry, and the dialog behind it says what is missing — an entry
  // that vanishes says nothing at all.
  const canTakeOver =
    !documentTypes.isSuccess || activeTypes.some((type) => (type.predecessorTypeIds ?? []).length > 0)

  const actions: SplitButtonAction[] = [
    ...(canTakeOver
      ? [
          {
            id: 'takeover',
            label: 'Aus Vorgängerbeleg übernehmen…',
            hint: 'Aus einem ausgestellten Vorgängerbeleg. Beträge werden übernommen.',
            icon: <FileInput size={15} aria-hidden />,
            onSelect: () => setTakeover(true),
          },
        ]
      : []),
    {
      id: 'copy',
      label: `${kind.singular} kopieren…`,
      hint: 'Positionen eines bestehenden Belegs als Vorlage.',
      icon: <Copy size={15} aria-hidden />,
      onSelect: () => setCopying(true),
    },
  ]

  // A document written this way is not finished: it opens straight away, the way a new one
  // does, and the way back out leads to this list. That list is a row longer from now on, so
  // it is marked stale before it is left — otherwise the way back shows the state from before.
  const openCreated = (created: SalesDocument) => {
    setTakeover(false)
    setCopying(false)
    void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(kind, tenantId) })
    void navigate(`${kind.path}/${created.id}`, { state: origin })
  }

  return (
    <>
      <PageHeader title={kind.plural} subtitle={`${formatCount(result.totalElements)} Belege`}>
        {can(kind.rights.write) && (
          <SplitButton
            onClick={() => navigate(`${kind.path}/neu`, { state: origin })}
            menuLabel={`Weitere Wege zu ${indefiniteArticle(kind, 'dative')} ${kind.singular}`}
            actions={actions}
          >
            <Plus size={15} aria-hidden />
            {kind.singular} erfassen
          </SplitButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-1 border-b border-line-subtle px-5 py-3">
            {filters.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={filter.id === entry.id}
                onClick={() => {
                  setFilterId(entry.id)
                  setPage(0)
                }}
                className={`h-8 rounded-[var(--radius-sm)] px-3 text-[13px] transition-colors ${
                  filter.id === entry.id
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
            keyOf={(row) => row.id}
            rowTo={(row) => `${kind.path}/${row.id}`}
            rowState={origin}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={documents.isPending}
            error={documents.error}
            empty={
              <EmptyState
                title={
                  filter.id === 'alle' ? `Noch keine ${kind.plural}` : 'Nichts in diesem Status'
                }
                description={
                  filter.id === 'alle'
                    ? 'Ein Beleg beginnt als Entwurf und bekommt seine Nummer erst beim Ausstellen.'
                    : 'Ein anderer Filter zeigt vielleicht mehr.'
                }
              >
                {filter.id === 'alle' && can(kind.rights.write) && (
                  <LinkButton to={`${kind.path}/neu`} state={origin}>
                    <Plus size={15} aria-hidden />
                    {kind.singular} erfassen
                  </LinkButton>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <TakeoverDialog
        tenantId={tenantId}
        kind={kind}
        open={takeover}
        onClose={() => setTakeover(false)}
        documentTypes={activeTypes}
        onCreated={openCreated}
      />

      <CopyDocumentDialog
        tenantId={tenantId}
        kind={kind}
        open={copying}
        onClose={() => setCopying(false)}
        onCreated={openCreated}
      />
    </>
  )
}

/**
 * What one Rechnung of the list still owes.
 *
 * <p>Three answers and not one number: an overdue debt is what the reader is looking for,
 * a settled Rechnung should stop drawing the eye, and a negative amount is a credit the
 * customer is owed — printed as «-0.20 offen» it would read as a debt of minus twenty
 * rappen. A document that carries no receivable at all shows nothing, not a zero.
 */
function OpenCell({ row }: { row: DocumentSummary }) {
  if (row.openAmount === undefined || row.openAmount === null) {
    return <span className="text-text-tertiary">–</span>
  }
  if (row.openAmount === 0) {
    return <Badge tone="success">bezahlt</Badge>
  }
  if (row.openAmount < 0) {
    return (
      <span className="text-text-secondary">
        {formatAmount(-row.openAmount)} <span className="text-text-tertiary">Guthaben</span>
      </span>
    )
  }
  return (
    <span className={row.overdue === true ? 'font-medium text-danger' : 'font-medium'}>
      {formatAmount(row.openAmount)}
    </span>
  )
}
