import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { Spinner } from '../components/Spinner'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatDateTime } from '../lib/format'
import {
  DEFAULT_STATUS_FILTER,
  MESSAGE_STATUSES,
  messageStatusLabel,
  messageStatusTone,
  outboxListKey,
  outboxMessagesUrl,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { MessageStatus, OutboxSummary, Page } from '../lib/types'
import { OutboxMessageDialog } from './outbox/OutboxMessageDialog'

/**
 * What went out, what is waiting, and what did not make it.
 *
 * <p>A screen of its own and not a line on the document: what failed has to be findable
 * <b>without knowing which document it was</b> — otherwise nobody notices that nothing has gone
 * out since Tuesday. Same reasoning that gave the module switch a screen (backend ADR-0079).
 *
 * <p>Read only, apart from «Erneut senden». A mail that went out cannot be taken back, and a
 * row that could be edited would suggest it could.
 */
export function OutboxListPage() {
  return (
    <RequireTenant permission={OUTBOX_RIGHTS.read}>
      {(tenantId) => <Outbox tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Outbox({ tenantId }: { tenantId: number }) {
  // Failed first, because that is the question this screen is opened with. Everything else is
  // one click away, and the count in the header always names the whole outbox.
  const [status, setStatus] = useState<MessageStatus | ''>(DEFAULT_STATUS_FILTER)
  const search = useQuickSearch('')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('createdAt,desc')
  const [opened, setOpened] = useState<OutboxSummary | null>(null)

  const query = listQuery({
    status: status === '' ? undefined : status,
    recipient: search.term === '' ? undefined : search.term,
    from: from === '' ? undefined : `${from}T00:00:00Z`,
    until: until === '' ? undefined : `${until}T00:00:00Z`,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const messages = useQuery({
    queryKey: outboxListKey(tenantId, query),
    queryFn: () => api.get<Page<OutboxSummary>>(`${outboxMessagesUrl(tenantId)}?${query}`),
    placeholderData: keepPreviousData,
  })

  const result = messages.data ?? emptyPage<OutboxSummary>()
  const filtered = status !== '' || search.term !== '' || from !== '' || until !== ''

  const resetFilters = () => {
    setStatus('')
    search.setValue('')
    setFrom('')
    setUntil('')
    setPage(0)
  }

  const columns: Column<OutboxSummary>[] = [
    {
      key: 'createdAt',
      header: 'Eingereiht',
      sortKey: 'createdAt',
      width: 'w-[150px]',
      render: (message) => formatDateTime(message.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      width: 'w-[150px]',
      render: (message) => (
        <span className="flex items-center gap-2">
          <Badge tone={messageStatusTone(message.status)}>
            {messageStatusLabel(message.status)}
          </Badge>
          {/* Only while one is on the wire. A spinner on a waiting row would claim movement
              where the runner has not picked it up yet. */}
          {message.status === 'SENDING' && <Spinner />}
        </span>
      ),
    },
    {
      key: 'recipients',
      header: 'Empfänger',
      width: 'w-[220px]',
      render: (message) => <span className="truncate">{message.recipients}</span>,
    },
    {
      key: 'subject',
      header: 'Betreff',
      sortKey: 'subject',
      render: (message) => <span className="truncate font-medium">{message.subject}</span>,
    },
    {
      key: 'sentAt',
      header: 'Gesendet',
      sortKey: 'sentAt',
      width: 'w-[150px]',
      render: (message) =>
        message.sentAt === undefined ? (
          <span className="text-text-tertiary">-</span>
        ) : (
          formatDateTime(message.sentAt)
        ),
    },
    {
      key: 'attempts',
      header: 'Versuche',
      align: 'right',
      width: 'w-[90px]',
      render: (message) => (
        <span className={message.attempts > 1 ? 'text-danger' : 'text-text-tertiary'}>
          {message.attempts}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Postausgang" subtitle={`${formatCount(result.totalElements)} Nachrichten`} />

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Empfängeradresse"
              maxLength={140}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as MessageStatus | '')
                setPage(0)
              }}
              className="w-[190px]"
            >
              <option value="">Alle</option>
              {MESSAGE_STATUSES.map((code) => (
                <option key={code} value={code}>
                  {messageStatusLabel(code)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Von"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setPage(0)
              }}
              className="w-[160px]"
            />
            <TextField
              label="Bis"
              type="date"
              value={until}
              onChange={(event) => {
                setUntil(event.target.value)
                setPage(0)
              }}
              className="w-[160px]"
            />
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(message) => message.id}
            onRowOpen={setOpened}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={messages.isPending}
            error={messages.error}
            empty={
              <EmptyState
                title={
                  status === DEFAULT_STATUS_FILTER && search.term === ''
                    ? 'Nichts fehlgeschlagen'
                    : filtered
                      ? 'Keine Treffer'
                      : 'Noch nichts versendet'
                }
                description={
                  status === DEFAULT_STATUS_FILTER && search.term === ''
                    ? 'Alles, was eingereiht wurde, ist auch hinausgegangen.'
                    : filtered
                      ? 'Für diese Auswahl gibt es keine Nachricht.'
                      : 'Belege werden aus der Belegmaske heraus versendet.'
                }
              >
                {filtered && (
                  <Button variant="secondary" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <OutboxMessageDialog
        message={opened}
        tenantId={tenantId}
        onClose={() => setOpened(null)}
      />
    </>
  )
}
