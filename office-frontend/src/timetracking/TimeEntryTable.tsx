import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { formatDurationShort } from '../lib/duration'
import { formatDate } from '../lib/format'
import { emptyPage } from '../lib/paging'
import { api } from '../lib/api'
import {
  TIME_ENTRY_STATE_LABELS,
  TIME_ENTRY_STATE_TONES,
  entryProjectText,
  entryServiceText,
  entryUserText,
  timeEntryListKey,
  timeEntryListUrl,
  timeRangeText,
  type TimesOf,
} from '../lib/timetracking'
import type { Page, TimeEntry } from '../lib/types'

/**
 * The entries of a project or a customer, of every user, a page at a time: the latest day first,
 * in the order the server keeps (backend ADR-0162).
 *
 * <p>Only to read. An entry is changed in «Meine Zeiten» by whoever recorded it, or with
 * `TIME_WRITE` in the week of that colleague; a second way to change it here would be a second
 * set of rules for the same row.
 *
 * @param of the project or the customer whose entries are listed
 * @param showsProject adds the column «Projekt», for a customer whose entries span projects
 * @param empty what the list says while there is no entry at all
 */
export function TimeEntryTable({
  tenantId,
  of,
  showsProject,
  empty,
}: {
  tenantId: number
  of: TimesOf
  showsProject: boolean
  empty: ReactNode
}) {
  const [page, setPage] = useState(0)
  const entries = useQuery({
    queryKey: timeEntryListKey(tenantId, of, page),
    queryFn: () => api.get<Page<TimeEntry>>(timeEntryListUrl(tenantId, of, page)),
    placeholderData: keepPreviousData,
  })
  const result = entries.data ?? emptyPage<TimeEntry>()

  const columns: Column<TimeEntry>[] = [
    {
      key: 'date',
      header: 'Datum',
      width: 'w-column-sm',
      render: (entry) => <span className="tabular-nums">{formatDate(entry.workDate)}</span>,
    },
    {
      key: 'user',
      header: 'Person',
      render: (entry) => entryUserText(entry),
    },
    ...(showsProject
      ? [
          {
            key: 'project',
            header: 'Projekt',
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
      align: 'right',
      width: 'w-column-sm',
      render: (entry) => (
        <span
          className="font-mono tabular-nums"
          title={timeRangeText(entry) === '' ? undefined : timeRangeText(entry)}
        >
          {formatDurationShort(entry.durationMinutes)}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Text',
      hideBelow: 'sm',
      render: (entry) => (
        <span className="text-text-secondary">{entry.description ?? ''}</span>
      ),
    },
    {
      key: 'state',
      header: 'Zustand',
      width: 'w-column-md',
      render: (entry) => (
        <Badge tone={TIME_ENTRY_STATE_TONES[entry.state]}>
          {TIME_ENTRY_STATE_LABELS[entry.state]}
        </Badge>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={result.content}
      keyOf={(entry) => entry.id}
      page={result}
      onPageChange={setPage}
      loading={entries.isPending}
      error={entries.error}
      empty={empty}
    />
  )
}
