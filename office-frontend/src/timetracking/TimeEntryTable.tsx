import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, Unlink } from 'lucide-react'
import { DataTable, type Column } from '../components/DataTable'
import { IconButton } from '../components/IconButton'
import { MarkdownLine } from '../components/MarkdownLine'
import { Tooltip } from '../components/Tooltip'
import { formatDurationShort } from '../lib/duration'
import { formatDate } from '../lib/format'
import type { OriginState } from '../lib/origin'
import { emptyPage } from '../lib/paging'
import { api } from '../lib/api'
import {
  entryProjectText,
  entryServiceText,
  entryUserText,
  timeEntryListKey,
  timeEntryListUrl,
  timeRangeText,
  type TimesOf,
} from '../lib/timetracking'
import type { Page, TimeEntry } from '../lib/types'
import { TimeEntryStateBadge } from './TimeEntryStateBadge'
import { useReleaseFromDraft } from './useReleaseFromDraft'

/**
 * The entries of a project or a customer, of every user, a page at a time: the latest day first,
 * in the order the server keeps (backend ADR-0162).
 *
 * <p>Only to read. An entry is changed in «Meine Zeiten» by whoever recorded it, or with
 * `TIME_WRITE` in the week of that colleague; a second way to change it here would be a second
 * set of rules for the same row. The one step offered here is «Vom Entwurf lösen» with
 * `TIME_BILL`, because it belongs to the billing and not to the entry; a billed entry links its
 * badge to the invoice and says why it is locked (backend ADR-0163, frontend ADR-0085).
 *
 * @param of the project or the customer whose entries are listed
 * @param showsProject adds the column «Projekt», for a customer whose entries span projects
 * @param empty what the list says while there is no entry at all
 * @param origin where an invoice opened from a badge leads back to
 */
export function TimeEntryTable({
  tenantId,
  of,
  showsProject,
  empty,
  origin,
}: {
  tenantId: number
  of: TimesOf
  showsProject: boolean
  empty: ReactNode
  origin?: OriginState
}) {
  const [page, setPage] = useState(0)
  // What the last «Vom Entwurf lösen» did, in one line under the list.
  const [status, setStatus] = useState<string | null>(null)
  const release = useReleaseFromDraft(tenantId, setStatus)
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
        <MarkdownLine text={entry.description} className="text-text-secondary" />
      ),
    },
    {
      key: 'state',
      header: 'Zustand',
      width: 'w-column-xl',
      render: (entry) => {
        const short = `${formatDurationShort(entry.durationMinutes)} vom ${formatDate(entry.workDate)}`
        return (
          <span className="inline-flex items-center gap-1">
            <TimeEntryStateBadge entry={entry} origin={origin} />
            {!entry.editable && entry.readOnlyReason && (
              <Tooltip icon="lock" label={`${short}: gesperrt`} text={entry.readOnlyReason} />
            )}
            {release.mayRelease(entry) && (
              <IconButton
                label={`${short} vom Entwurf lösen`}
                onClick={() => {
                  setStatus(null)
                  release.ask(entry)
                }}
              >
                <Unlink size={15} aria-hidden />
              </IconButton>
            )}
          </span>
        )
      },
    },
  ]

  return (
    <>
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
      {status !== null && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 border-t border-line-subtle px-5 py-3 text-small text-text-secondary"
        >
          <Check size={13} className="text-accent-text" aria-hidden />
          {status}
        </p>
      )}
      {release.question}
    </>
  )
}
