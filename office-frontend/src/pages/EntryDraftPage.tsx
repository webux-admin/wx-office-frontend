import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  DRAFT_PATH,
  ENTRY_PATH,
  JOURNAL_PATH,
  attentionKey,
  entriesKey,
  fetchAttention,
  fetchEntries,
  previewPostRun,
  runPost,
} from '../lib/accounting'
import { formatAmount, formatDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Entry, PostRunOutcome, PostRunResult } from '../lib/types'
import { IRREVERSIBLE } from './EntryPage'

/** The standing note above the rows. It is the whole reason this list exists. */
const NOT_IN_THE_BOOKS =
  'Diese Buchungen sind noch nicht in Bilanz und Erfolgsrechnung enthalten.'

/**
 * «Entwürfe»: what is typed and not posted yet.
 *
 * <p>A `DataTable` with multi-select (ADR-0030), because posting twenty vouchers one at a time
 * is the work this list is meant to take away.
 *
 * <p><b>The collective step shows the preview first</b>, before anything is written: how many go
 * through, the reason for each one that does not, and the sentence about what stops being
 * possible afterwards. Then three result lists — a run opens one transaction per entry and does
 * not tip over (backend ADR-0102, ADR-0109).
 */
export function EntryDraftPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <EntryDrafts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function EntryDrafts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayPost = can(ACCOUNTING_RIGHTS.post)

  const search = useQuickSearch()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('bookingDate,asc')
  const [selected, setSelected] = useState<Set<string | number>>(() => new Set())
  const [announcing, setAnnouncing] = useState(false)
  const [result, setResult] = useState<PostRunResult | null>(null)
  // A search, a sort or a page change puts other rows on the screen, so what was ticked before
  // means something else afterwards — and the button over them would go on offering to post it.
  // Asked about rather than done, the same guard the write-off run puts around its tolerance.
  // Held as a thunk, so the keystroke that raised the question is the one that runs after it.
  const [pending, setPending] = useState<{ run: () => void } | null>(null)

  const query = listQuery({ q: search.term, page, size: PAGE_SIZE, sort })
  const drafts = useQuery({
    queryKey: entriesKey(tenantId, query),
    queryFn: () => fetchEntries(tenantId, query),
    placeholderData: keepPreviousData,
  })
  const attention = useQuery({
    queryKey: attentionKey(tenantId),
    queryFn: () => fetchAttention(tenantId),
  })
  const rows = (drafts.data ?? emptyPage<Entry>()).content
  const ticked = [...selected].map(Number)

  const run = useMutation({
    mutationFn: () => runPost(tenantId, ticked),
    onSuccess: (answer) => {
      setResult(answer)
      setSelected(new Set())
      setAnnouncing(false)
      void queryClient.invalidateQueries({ queryKey: ['accounting-entries', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['accounting-journal', tenantId] })
      void queryClient.invalidateQueries({ queryKey: attentionKey(tenantId) })
    },
  })

  /** Narrows or reorders the list — asks first while any ticks stand, and drops them after. */
  const narrow = (change: () => void) => {
    if (selected.size === 0) {
      change()
      return
    }
    setPending({
      run: () => {
        change()
        setSelected(new Set())
      },
    })
  }

  const columns: Column<Entry>[] = [
    {
      key: 'bookingDate',
      header: 'Datum',
      sortKey: 'bookingDate',
      width: 'w-[120px]',
      render: (entry) => <span className="tabular-nums">{formatDate(entry.bookingDate)}</span>,
    },
    {
      key: 'description',
      header: 'Text',
      sortKey: 'description',
      render: (entry) => <span className="font-medium">{entry.description}</span>,
    },
    {
      key: 'documentReference',
      header: 'Beleg',
      sortKey: 'documentReference',
      width: 'w-[140px]',
      hideBelow: 'sm',
      render: (entry) => (
        <span className="font-mono text-[12px] text-text-tertiary">{entry.documentReference}</span>
      ),
    },
    {
      key: 'lines',
      header: 'Zeilen',
      width: 'w-[90px]',
      align: 'right',
      hideBelow: 'sm',
      render: (entry) => <span className="tabular-nums">{entry.lines.length}</span>,
    },
    {
      key: 'amount',
      header: 'Betrag',
      width: 'w-[140px]',
      align: 'right',
      render: (entry) => <span className="tabular-nums">{formatAmount(entry.amount)}</span>,
    },
  ]

  const summary = attention.data

  return (
    <>
      <PageHeader
        title="Entwürfe"
        subtitle="Erfasst, aber noch nicht verbucht. Solange sie hier stehen, lassen sie sich ändern und löschen."
      >
        <Link to={ENTRY_PATH}>
          <Button variant="secondary">Neue Buchung</Button>
        </Link>
        {mayPost && (
          <Button onClick={() => setAnnouncing(true)} disabled={ticked.length === 0}>
            Verbuchen ({ticked.length})
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {/* The one sentence this list is about, and it stands whether or not anything is
            ticked — not a warning that appears once something is wrong. */}
        <Panel>
          <p className="text-[13px]">
            <strong>{NOT_IN_THE_BOOKS}</strong>
          </p>
          {summary !== undefined && summary.drafts > 0 && (
            <p className="mt-1 text-[13px] text-text-secondary">
              {summary.drafts} Entwürfe über {formatAmount(summary.draftTotal)}{' '}
              {summary.currencyCode ?? ''}, ältestes Buchungsdatum{' '}
              {formatDate(summary.oldestBookingDate)}.
              {summary.lockingOn
                ? ` Bis und mit ${formatDate(summary.lockingOn)} ist nichts verbuchbar.`
                : ''}
            </p>
          )}
        </Panel>

        {result !== null && <RunResult result={result} onClose={() => setResult(null)} />}

        <div className="flex flex-wrap items-end gap-4">
          <QuickSearchField
            value={search.value}
            onChange={(next) =>
              narrow(() => {
                search.setValue(next)
                setPage(0)
              })
            }
            placeholder="Text oder Belegverweis"
          />
        </div>

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(entry) => entry.id ?? 0}
            loading={drafts.isLoading}
            error={drafts.error}
            empty={
              <EmptyState
                title="Keine Entwürfe"
                description="Alles Erfasste ist verbucht. Neue Buchungen entstehen unter «Buchen»."
              >
                <Link to={ENTRY_PATH}>
                  <Button>Neue Buchung</Button>
                </Link>
              </EmptyState>
            }
            rowTo={(entry) => `${ENTRY_PATH}/${entry.id}`}
            rowState={originState(DRAFT_PATH, 'Entwürfe')}
            page={drafts.data}
            onPageChange={(next) => narrow(() => setPage(next))}
            sort={sort}
            onSortChange={(next) =>
              narrow(() => {
                setSort(next)
                setPage(0)
              })
            }
            selected={mayPost ? selected : undefined}
            onSelectedChange={mayPost ? setSelected : undefined}
            selectionLabel={(entry) => `Buchung vom ${formatDate(entry.bookingDate)} markieren`}
          />
        </Panel>

        {!mayPost && (
          <p className="text-[13px] text-text-secondary">
            Zum Verbuchen fehlt das Recht «Verbuchen».
          </p>
        )}
      </div>

      <PostRunDialog
        tenantId={tenantId}
        open={announcing}
        entryIds={ticked}
        rows={rows}
        busy={run.isPending}
        error={run.error}
        onClose={() => setAnnouncing(false)}
        onConfirm={() => run.mutate()}
      />

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Markierung verwerfen?"
        description={`${markedText(ticked.length)}, aber noch nicht verbucht. Suche, Sortierung und Seite stellen andere Zeilen auf — die Markierung gilt dann für Zeilen, die niemand angeschaut hat.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Zurück
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                pending?.run()
                setPending(null)
              }}
            >
              Verwerfen und weiter
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Zuerst verbuchen behält alles: die Liste lässt sich danach weiter durchsuchen.
        </p>
      </Dialog>
    </>
  )
}

/**
 * How many rows are ticked, in a sentence.
 *
 * @param count the number of ticks
 * @returns the wording, singular for one
 */
function markedText(count: number): string {
  return count === 1 ? '1 Buchung ist markiert' : `${count} Buchungen sind markiert`
}

/**
 * What a run would do, before it writes anything.
 *
 * <p><b>It names no number range</b>, although the dialog sketch of the issue shows one: the
 * backend answers `firstNumber` and `lastNumber` empty in this stage, because the counter of
 * `numbering` never leaves that module. A number that stands in a dialog and is a different one
 * afterwards is worse than none (ADR-0045, backend ADR-0114).
 */
function PostRunDialog({
  tenantId,
  open,
  entryIds,
  rows,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  tenantId: number
  open: boolean
  entryIds: number[]
  rows: readonly Entry[]
  busy: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) {
  const preview = useQuery({
    queryKey: ['accounting-post-run-preview', tenantId, entryIds],
    queryFn: () => previewPostRun(tenantId, entryIds),
    enabled: open && entryIds.length > 0,
  })
  const postable = preview.data?.postable.length ?? 0

  return (
    <Dialog
      open={open}
      title="Verbuchen"
      onClose={onClose}
      onSubmit={onConfirm}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} busy={busy} disabled={postable === 0}>
            Verbuchen ({postable})
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-[13px]">
        <p>{entryIds.length} Buchungen sind ausgewählt.</p>
        {preview.isLoading && <p className="text-text-secondary">Wird geprüft …</p>}
        {preview.error !== null && <ErrorNotice error={preview.error} />}
        {preview.data !== undefined && (
          <>
            <p>
              <strong>{postable}</strong> werden verbucht und bekommen ihre Journalnummer.
            </p>
            {preview.data.blocked.length > 0 && (
              <ul className="grid gap-1 text-text-secondary">
                {preview.data.blocked.map((blocked) => (
                  <li key={blocked.entryId}>
                    <strong>{labelOfEntry(rows, blocked.entryId)}:</strong> {blocked.reason}
                  </li>
                ))}
                <li>Diese bleiben in der Liste «Entwürfe».</li>
              </ul>
            )}
          </>
        )}
        <p className="text-text-secondary">{IRREVERSIBLE}</p>
        {error !== null && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}

/** The three result lists of a run, after the pattern the clearing basket already shows. */
function RunResult({ result, onClose }: { result: PostRunResult; onClose: () => void }) {
  const rest = [...result.skipped, ...result.failed]
  return (
    <Panel title="Ergebnis des Laufs">
      <p aria-live="polite" className="text-[13px]">
        {result.posted.length} verbucht, {result.skipped.length} übersprungen,{' '}
        {result.failed.length} fehlgeschlagen.
      </p>
      {result.posted.length > 0 && (
        <ul className="mt-3 grid gap-1 text-[13px]">
          {result.posted.map((line) => (
            <li key={line.entryId}>
              Verbucht als <strong>{line.entryNumber}</strong>.
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 grid gap-1 text-[13px] text-text-secondary">
          {rest.map((line) => (
            <li key={`${line.outcome}-${line.entryId}`}>
              <strong>{OUTCOME_NAMES[line.outcome]}:</strong> {line.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={JOURNAL_PATH}>
          <Button variant="secondary">Im Journal ansehen</Button>
        </Link>
        <Button variant="ghost" onClick={onClose}>
          Schliessen
        </Button>
      </div>
    </Panel>
  )
}

/** What each of the three outcomes is called above its sentence. */
const OUTCOME_NAMES: Record<PostRunOutcome['outcome'], string> = {
  POSTED: 'Verbucht',
  SKIPPED: 'Übersprungen',
  FAILED: 'Fehlgeschlagen',
}

/**
 * Names one entry in a sentence about it.
 *
 * <p>The preview answers ids, and an id says nothing to a reader. Where the entry is not on the
 * page being looked at, the id has to do — better than a sentence about nothing.
 */
function labelOfEntry(rows: readonly Entry[], entryId: number): string {
  const entry = rows.find((candidate) => candidate.id === entryId)
  if (entry === undefined) return `Buchung ${entryId}`
  return `${formatDate(entry.bookingDate)} ${entry.description}`
}
