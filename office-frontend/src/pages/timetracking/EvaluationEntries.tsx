import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DataTable, type Column } from '../../components/DataTable'
import { MarkdownLine } from '../../components/MarkdownLine'
import { api } from '../../lib/api'
import { formatDurationShort } from '../../lib/duration'
import { formatDate } from '../../lib/format'
import type { OriginState } from '../../lib/origin'
import { emptyPage } from '../../lib/paging'
import {
  evaluationEntriesKey,
  evaluationEntriesUrl,
  evaluationQuery,
  type TimeEvaluationFilter,
} from '../../lib/timeEvaluation'
import {
  entryCustomerText,
  entryProjectText,
  entryServiceText,
  entryUserText,
  timeRangeText,
} from '../../lib/timetracking'
import type { Page, TimeEntry } from '../../lib/types'
import { TimeEntryStateBadge } from '../../timetracking/TimeEntryStateBadge'

/** The order of the list until a column is clicked: the latest day first, as the server keeps it. */
const DEFAULT_SORT = 'workDate,desc'

/**
 * The entries of the evaluation, a page at a time, sorted by the server.
 *
 * <p>Only to read, like the register «Zeiten» of a project: an entry is changed in «Meine
 * Zeiten» or in the week of the colleague. Page and order belong to the reading and not to the
 * question, so they stay out of the address, and a new filter starts on the first page again.
 *
 * @param filter the filter as the requests go out, with both days
 * @param projectsOn without projects there is no column «Projekt»
 * @param origin where an invoice opened from a badge leads back to
 * @param empty what the list says while the filter holds no entry
 */
export function EvaluationEntries({
  tenantId,
  filter,
  projectsOn,
  origin,
  empty,
}: {
  tenantId: number
  filter: TimeEvaluationFilter
  projectsOn: boolean
  origin: OriginState
  empty: ReactNode
}) {
  const query = evaluationQuery(filter)
  const [reading, setReading] = useState({ query, sort: DEFAULT_SORT, page: 0 })
  const sort = reading.sort
  const page = reading.query === query ? reading.page : 0

  const entries = useQuery({
    queryKey: evaluationEntriesKey(tenantId, filter, page, sort),
    queryFn: () => api.get<Page<TimeEntry>>(evaluationEntriesUrl(tenantId, filter, page, sort)),
    placeholderData: keepPreviousData,
  })
  const result = entries.data ?? emptyPage<TimeEntry>()

  const columns: Column<TimeEntry>[] = [
    {
      key: 'date',
      header: 'Datum',
      sortKey: 'workDate',
      width: 'w-column-sm',
      render: (entry) => <span className="tabular-nums">{formatDate(entry.workDate)}</span>,
    },
    {
      key: 'user',
      header: 'Person',
      sortKey: 'userName',
      render: (entry) => entryUserText(entry),
    },
    ...(projectsOn
      ? [
          {
            key: 'project',
            header: 'Projekt',
            sortKey: 'projectNumber',
            hideBelow: 'sm',
            render: (entry: TimeEntry) => (
              <span className={entry.projectId == null ? 'text-text-tertiary' : ''}>
                {entryProjectText(entry)}
              </span>
            ),
          } satisfies Column<TimeEntry>,
        ]
      : []),
    {
      key: 'customer',
      header: 'Kunde',
      sortKey: 'customerName',
      hideBelow: 'sm',
      render: (entry) => (
        <span className={entry.partnerId == null ? 'text-text-tertiary' : ''}>
          {entryCustomerText(entry)}
        </span>
      ),
    },
    {
      key: 'service',
      header: 'Leistung',
      hideBelow: 'sm',
      render: (entry) => (
        <span className={entry.productId == null ? 'text-text-tertiary' : ''}>
          {entryServiceText(entry)}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Dauer',
      sortKey: 'durationMinutes',
      align: 'right',
      width: 'w-column-xs',
      render: (entry) => (
        <span title={timeRangeText(entry) === '' ? undefined : timeRangeText(entry)}>
          {formatDurationShort(entry.durationMinutes)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Text',
      hideBelow: 'sm',
      render: (entry) => <MarkdownLine text={entry.description} className="text-text-secondary" />,
    },
    {
      key: 'state',
      header: 'Zustand',
      width: 'w-column-xl',
      render: (entry) => <TimeEntryStateBadge entry={entry} origin={origin} />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={result.content}
      keyOf={(entry) => entry.id}
      page={result}
      onPageChange={(next) => setReading({ query, sort, page: next })}
      sort={sort}
      onSortChange={(next) => setReading({ query, sort: next, page: 0 })}
      loading={entries.isPending}
      error={entries.error}
      empty={empty}
    />
  )
}
