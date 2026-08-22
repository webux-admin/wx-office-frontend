import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Badge, type BadgeTone } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { QuickSearchField } from '../../components/QuickSearch'
import { useQuickSearch } from '../../components/useQuickSearch'
import { api } from '../../lib/api'
import { formatAmount, formatDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../../lib/paging'
import type { DocumentHistoryEntry, Page } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { wordingFor, type PartnerRole } from './role'

/**
 * How loudly a status speaks, the same reading as in the order list.
 *
 * <p>Keyed by the plain string: a history row spans every kind of document and carries its
 * status the way the server wrote it, so an unknown one leaves the badge without a tone
 * rather than breaking the row.
 */
const TONES: Record<string, BadgeTone> = {
  DRAFT: 'muted',
  FINALISED: 'accent',
  CANCELLED: 'danger',
}

/**
 * Where a row leads, by the kind of document it holds.
 *
 * <p>Only the kinds that have a mask of their own today. Offers, delivery notes, invoices and
 * credit notes appear in the list and are not clickable, because there is no screen to send
 * anyone to — a route invented here would end on the dashboard.
 */
const ROUTES: Record<string, string> = {
  ORDER: '/auftraege',
}

/**
 * The mask of one row.
 *
 * @param entry the row
 * @returns the route to its mask, `undefined` for a kind of document that has none
 */
function routeOf(entry: DocumentHistoryEntry): string | undefined {
  const base = ROUTES[entry.category]
  return base ? `${base}/${entry.id}` : undefined
}

/**
 * Everything that happened with one partner, in one list.
 *
 * <p>Fetches its own page rather than taking it from the mask around it: the register is
 * opened rarely and holds a list of its own, with its own search, order and paging.
 *
 * <p>The rows are narrowed by the server to the kinds of document the reader may see. Someone
 * without the right to read invoices gets the offers and orders of that partner and learns
 * nothing about the invoices — not even that there are any — which is why this register is
 * shown to everyone who may read the partner.
 */
export function PartnerHistory({
  tenantId,
  partnerId,
  role,
}: {
  tenantId: number
  partnerId: number
  /** Which of the two masks this register sits in, for the way back out of a document. */
  role: PartnerRole
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const search = useQuickSearch()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('documentDate,desc')

  // A document opened from a row names this mask as the way back, so saving there returns to
  // the partner and not to whichever list the document mask holds as its fallback.
  const origin = originState(useLocation().pathname, wordingFor(role).ownRoleLabel)

  const query = listQuery({ search: search.term, page, size: PAGE_SIZE, sort })
  const history = useQuery({
    queryKey: ['partner-history', tenantId, partnerId, query],
    queryFn: () =>
      api.get<Page<DocumentHistoryEntry>>(
        `/api/tenants/${tenantId}/partners/${partnerId}/history?${query}`,
      ),
  })

  // Search, order and count are the server's answer. This register holds one page and cannot
  // know what is on the others, so it must not sift through the rows itself.
  const result = history.data ?? emptyPage<DocumentHistoryEntry>()

  // The keys are those of the column catalogue the server offers, not decoration: a tenant
  // that later picks its own columns picks them by exactly these names.
  const columns: Column<DocumentHistoryEntry>[] = [
    {
      key: 'documentDate',
      header: 'Datum',
      width: 'w-[110px]',
      sortKey: 'documentDate',
      render: (entry) => formatDate(entry.documentDate),
    },
    {
      key: 'documentType',
      header: 'Belegart',
      width: 'w-[150px]',
      sortKey: 'documentType',
      // The tenant's own wording, as the server sends it. Nothing is translated here.
      //
      // A link wherever the kind of document has a mask: the click on the row is convenience,
      // this is the way in for the keyboard, the middle mouse button and the context menu. A
      // kind without a mask reads as plain text, which is also how the row says so.
      render: (entry) => {
        const to = routeOf(entry)
        if (!to) return entry.documentTypeName
        return (
          <Link
            to={to}
            state={origin}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {entry.documentTypeName}
          </Link>
        )
      },
    },
    {
      key: 'documentNumber',
      header: 'Nummer',
      width: 'w-[150px]',
      sortKey: 'documentNumber',
      render: (entry) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {entry.documentNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-[130px]',
      render: (entry) => <Badge tone={TONES[entry.status]}>{statusLabel(entry.status)}</Badge>,
    },
    {
      key: 'reference',
      header: 'Referenz',
      sortKey: 'reference',
      render: (entry) => <span className="text-text-secondary">{entry.reference ?? '-'}</span>,
    },
    {
      key: 'predecessorDocumentNumber',
      header: 'Vorgänger',
      width: 'w-[150px]',
      render: (entry) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {entry.predecessorDocumentNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'dueDate',
      header: 'Fällig',
      width: 'w-[110px]',
      sortKey: 'dueDate',
      render: (entry) => formatDate(entry.dueDate),
    },
    {
      key: 'totalGross',
      header: 'Betrag',
      align: 'right',
      width: 'w-[140px]',
      sortKey: 'totalGross',
      render: (entry) => (
        <span className="font-medium">
          {formatAmount(entry.totalGross)}{' '}
          <span className="text-text-tertiary">{entry.currency}</span>
        </span>
      ),
    },
  ]

  return (
    <Panel
      title="Verlauf"
      description="Alle Belege zu diesem Partner. Belegarten ohne Leserecht erscheinen nicht."
      padded={false}
    >
      <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
        <QuickSearchField
          value={search.value}
          onChange={(next) => {
            search.setValue(next)
            setPage(0)
          }}
          placeholder="Nummer, Referenz, Datum oder Betrag"
        />
      </div>

      <DataTable
        columns={columns}
        rows={result.content}
        keyOf={(entry) => entry.id}
        rowTo={routeOf}
        rowState={origin}
        page={result}
        onPageChange={setPage}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          setPage(0)
        }}
        loading={history.isPending}
        error={history.error}
        empty={
          <EmptyState
            title={search.term ? 'Nichts gefunden' : 'Noch kein Verlauf'}
            description={
              search.term
                ? `Für «${search.term}» gibt es keinen Treffer. Ein anderer Begriff hilft vielleicht.`
                : 'Der Verlauf füllt sich, sobald Belege zu diesem Partner geschrieben werden.'
            }
          />
        }
      />
    </Panel>
  )
}
