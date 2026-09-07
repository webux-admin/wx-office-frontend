import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  attentionKey,
  fetchFiscalYears,
  fetchJournal,
  fiscalYearsKey,
  journalKey,
  reversalReasonRoom,
  reverseEntry,
} from '../lib/accounting'
import { formatAmount, formatDate, formatDateTime, toIsoDate } from '../lib/format'
import { selectOptions } from '../lib/masterData'
import { optionalOriginOf } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { EntryLine, FiscalYear, JournalRow } from '../lib/types'
import { useCatalogue } from '../masterdata/useMasterData'
import { ReportToolbar } from './accounting/ReportToolbar'

/**
 * «Journal»: everything that is in the books, in the order it was written.
 *
 * <p>Reads while the module is off — what is posted stays readable for ten years (OR Art. 958f).
 *
 * <p><b>The two filters take their wording from `GET /catalogues`</b> and never from a constant
 * in this frontend. A German label written in here would be the one place a tenant cannot change
 * the wording, and it would be the first thing to drift when a value is added (ADR-0017).
 *
 * <p><b>The cut-off day belongs to the paper alone.</b> Moved, it narrows the PDF, the printable
 * page and the filed copy; the list keeps showing the whole year, because `GET /journal` takes no
 * such day. That is said under the field instead of being papered over — a filter that quietly
 * does nothing is worse than none.
 *
 * <p><b>Left where it starts, it is not sent at all.</b> The field is prefilled with the last day
 * of the year, and an untouched field means «no cut-off day» — the same paper as before the day
 * was offered at all.
 *
 * <p>A row opens to its lines. A counter entry is marked as one and leads to the entry it
 * reverses; that entry leads back, as far as both are on the page being read.
 */
export function JournalPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <Journal tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Journal({ tenantId }: { tenantId: number }) {
  const location = useLocation()
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayPost = can(ACCOUNTING_RIGHTS.post)

  const search = useQuickSearch()
  // Preselected where the account sheet named one, so the entry it links to is on the page that
  // opens rather than on whichever year the picker would have chosen.
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(() => {
    const named = new URLSearchParams(location.search).get('fiscalYearId')
    return named === null ? null : Number(named)
  })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // The cut-off day of the paper, and of nothing else on this screen — see the field below.
  const [asOf, setAsOf] = useState('')
  const [entryKind, setEntryKind] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('bookingDate,asc')
  // The account sheet leads here with one entry named, and that entry is opened straight away.
  // Read once, in the initialiser: it is where the screen was opened from, and reading it again
  // later would fight with whatever somebody has opened since. There is no screen of its own for
  // one booking — a second mask for the same entry would be a second truth about it.
  const [opened, setOpened] = useState<number | null>(() => {
    const named = new URLSearchParams(location.search).get('entryId')
    return named === null ? null : Number(named)
  })
  const [reversing, setReversing] = useState<JournalRow | null>(null)

  // Through `selectOptions`, so a value the tenant has hidden is hidden here too: the endpoint
  // answers the whole catalogue, `visible === false` and all, and the house filter is the one
  // place that reads it. The chosen value is passed along, so a filter that stands on a value
  // hidden in the meantime keeps showing what it is filtering by.
  const kinds = selectOptions(useCatalogue(tenantId, 'entry-kind'), entryKind)
  const sources = selectOptions(useCatalogue(tenantId, 'entry-source'), source)

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  // The year is compulsory at the endpoint, so the screen has to choose one before it may ask
  // at all: the one today falls into, and the latest one otherwise.
  const chosen = fiscalYearId ?? defaultYearOf(available)?.id ?? null
  const chosenYear = available.find((year) => year.id === chosen)

  // The cut-off day follows the year. It starts on the last day of the year on screen, and
  // choosing another year moves it to the last day of that one: a day left standing from the
  // year before would fall outside the new one, and the endpoint refuses such a day with 400.
  //
  // Adjusted while rendering, the technique `ReverseDialog` further down uses; an effect would
  // draw the empty field once before filling it. Held against the end date rather than the id,
  // because the id can come out of the address before the years have arrived — kept on the id,
  // the prefill would never happen for whoever is sent here from an account sheet.
  const [prefilled, setPrefilled] = useState('')
  if ((chosenYear?.endDate ?? '') !== prefilled) {
    setPrefilled(chosenYear?.endDate ?? '')
    setAsOf(chosenYear?.endDate ?? '')
  }

  // What travels to the paper: the day only where somebody moved it off the prefill.
  //
  // The prefill is the last day of the year, which means «the whole year» and not a cut-off day.
  // The PDF cannot tell the two apart — a missing day falls back to the year end there (backend
  // `AccountingPrintouts.paper`) — but the printable page can: its subtitle carries
  // « · Stichtag 31.12.2026» wherever a day arrives (backend `AccountingReports.subtitleOf`).
  // Sending the prefill would print a cut-off day onto the sheet that stands for GeBüV Art. 6
  // Abs. 3 where the whole year is meant. The filed copy is keyed by the day drawn on the sheet,
  // and that is the year end either way — so leaving the prefill out files neither twice nor
  // under another key (backend `ReportArchiveManagement.archiveByHand`).
  const cutOff = asOf === '' || asOf === chosenYear?.endDate ? undefined : asOf

  const query = listQuery({
    fiscalYearId: chosen,
    from,
    to,
    entryKind,
    source,
    q: search.term,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const journal = useQuery({
    queryKey: journalKey(tenantId, query),
    queryFn: () => fetchJournal(tenantId, query),
    enabled: chosen !== null,
    placeholderData: keepPreviousData,
  })
  const rows = (journal.data ?? emptyPage<JournalRow>()).content

  const reverse = useMutation({
    mutationFn: (input: { entryId: number; reason: string; bookingDate: string }) =>
      reverseEntry(tenantId, input.entryId, {
        reversalReason: input.reason,
        bookingDate: input.bookingDate === '' ? undefined : input.bookingDate,
      }),
    onSuccess: () => {
      setReversing(null)
      void queryClient.invalidateQueries({ queryKey: ['accounting-journal', tenantId] })
      void queryClient.invalidateQueries({ queryKey: attentionKey(tenantId) })
    },
  })

  /** Brings one journal number into view: it becomes the search term and its row opens. */
  function jumpTo(row: JournalRow | undefined) {
    if (row === undefined) return
    search.setValue(row.entryNumber)
    setPage(0)
    setOpened(row.id)
  }

  const columns: Column<JournalRow>[] = [
    {
      key: 'entryNumber',
      header: 'Nummer',
      sortKey: 'entryNumber',
      width: 'w-[150px]',
      render: (row) => (
        <button
          type="button"
          aria-expanded={opened === row.id}
          onClick={() => setOpened(opened === row.id ? null : row.id)}
          className="inline-flex items-center gap-1 font-mono text-[12px] text-text-secondary transition-colors hover:text-text-primary"
        >
          {opened === row.id ? (
            <ChevronDown size={13} aria-hidden />
          ) : (
            <ChevronRight size={13} aria-hidden />
          )}
          {row.entryNumber}
        </button>
      ),
    },
    {
      key: 'bookingDate',
      header: 'Datum',
      sortKey: 'bookingDate',
      width: 'w-[110px]',
      render: (row) => <span className="tabular-nums">{formatDate(row.bookingDate)}</span>,
    },
    {
      key: 'description',
      header: 'Text',
      sortKey: 'description',
      render: (row) => (
        <span className="block">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.description}</span>
            {row.reversesEntryId !== null && row.reversesEntryId !== undefined && (
              <Badge tone="danger">Gegenbuchung</Badge>
            )}
            {counterOf(rows, row) !== undefined && <Badge tone="muted">storniert</Badge>}
          </span>
          {row.reversalReason && (
            <span className="mt-0.5 block text-[12px] text-text-secondary">
              {row.reversalReason}
            </span>
          )}
          <LinkedEntry rows={rows} row={row} onJump={jumpTo} />
          {opened === row.id && <Lines lines={row.lines} />}
        </span>
      ),
    },
    {
      key: 'documentReference',
      header: 'Beleg',
      width: 'w-[130px]',
      sortKey: 'documentReference',
      hideBelow: 'sm',
      render: (row) => (
        <span className="font-mono text-[12px] text-text-tertiary">{row.documentReference}</span>
      ),
    },
    {
      key: 'debit',
      header: 'Soll',
      width: 'w-[130px]',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatAmount(row.amount)}</span>,
    },
    {
      key: 'credit',
      header: 'Haben',
      width: 'w-[130px]',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatAmount(row.amount)}</span>,
    },
    {
      key: 'reverse',
      header: '',
      width: 'w-[120px]',
      align: 'right',
      render: (row) =>
        mayPost && !row.reversesEntryId && counterOf(rows, row) === undefined ? (
          // Reset in the same click that opens the box, the way `DocumentReceivablePanel`
          // does it: the reason and the booking date are emptied inside the box, and the
          // refusal of the request before lives out here in the mutation. Without this, a
          // reversal that was refused for one entry showed its sentence over the form of the
          // next — and it reads as if that one had been refused.
          <Button
            variant="ghost"
            onClick={() => {
              reverse.reset()
              setReversing(row)
            }}
          >
            <Undo2 size={13} aria-hidden /> Stornieren
          </Button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Was verbucht ist, in der Reihenfolge, in der es geschrieben wurde. Geändert wird hier nichts."
        // Only where somebody was sent here — from an account sheet, say. Reached through the
        // navigation the journal shows no way back at all (frontend ADR-0003).
        back={backOf(location.state)}
      >
        {/* The paper is the journal of the year, and of the year up to the cut-off day where
            somebody moved it — see `cutOff` above. The day is the only thing that travels; the
            five filters of the list — «Von», «Bis», «Buchungsart», «Herkunft» and the search —
            stay behind, because the endpoint takes none of them and the journal the law asks for
            is the complete one (GeBüV Art. 1 Abs. 2 Bst. b), not the page somebody narrowed. */}
        <ReportToolbar
          tenantId={tenantId}
          report="journal"
          fiscalYearId={chosen}
          yearLabel={chosenYear?.label}
          options={{ asOf: cutOff }}
        />
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label="Geschäftsjahr"
            value={chosen === null ? '' : String(chosen)}
            onChange={(event) => {
              setFiscalYearId(event.target.value === '' ? null : Number(event.target.value))
              setPage(0)
            }}
            className="w-[170px]"
          >
            {available.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label}
              </option>
            ))}
          </SelectField>
          {/* Only for the paper. `GET /journal` takes no cut-off day: it knows `from` and
              `to` and nothing else of the kind (backend `JournalController.getJournal`). So a day
              moved off the prefill narrows the PDF, the printable page and the filed copy, and
              the list below keeps showing the whole year. The hint says so rather than letting
              the field pretend to a filtering it does not do — «Von» and «Bis» beside it are what
              narrows the list. */}
          <TextField
            label="Stichtag"
            type="date"
            value={asOf}
            // The endpoint refuses a day outside the year with 400, so the picker offers none.
            min={chosenYear?.startDate}
            max={chosenYear?.endDate}
            onChange={(event) => setAsOf(event.target.value)}
            className="w-[160px]"
            hint="Nur fürs Papier. Für die Liste unten gelten «Von» und «Bis»."
          />
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
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
              setPage(0)
            }}
            className="w-[160px]"
          />
          <SelectField
            label="Buchungsart"
            value={entryKind}
            onChange={(event) => {
              setEntryKind(event.target.value)
              setPage(0)
            }}
            className="w-[170px]"
          >
            <option value="">Alle</option>
            {kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Herkunft"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setPage(0)
            }}
            className="w-[170px]"
          >
            <option value="">Alle</option>
            {sources.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </SelectField>
          <QuickSearchField
            value={search.value}
            onChange={(next) => {
              search.setValue(next)
              setPage(0)
            }}
            placeholder="Journalnummer, Text oder Beleg"
          />
        </div>

        <Panel padded={false}>
          {available.length === 0 && !years.isLoading ? (
            <EmptyState
              title="Noch kein Geschäftsjahr"
              description="Ein Journal gehört zu einem Geschäftsjahr. Ohne eines gibt es nichts zu lesen."
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              loading={journal.isLoading || years.isLoading}
              error={journal.error ?? years.error}
              empty={
                <EmptyState
                  title="Nichts verbucht"
                  description="In diesem Zeitraum steht noch keine Buchung im Journal."
                />
              }
              onRowOpen={(row) => setOpened(opened === row.id ? null : row.id)}
              page={journal.data}
              onPageChange={setPage}
              sort={sort}
              onSortChange={(next) => {
                setSort(next)
                setPage(0)
              }}
            />
          )}
        </Panel>
      </div>

      <ReverseDialog
        row={reversing}
        busy={reverse.isPending}
        error={reverse.error}
        onClose={() => setReversing(null)}
        onConfirm={(reason, bookingDate) =>
          reverse.mutate({ entryId: reversing?.id ?? 0, reason, bookingDate })
        }
      />
    </>
  )
}

/** The lines of one entry, shown under its text once the row is opened. */
function Lines({ lines }: { lines: readonly EntryLine[] }) {
  return (
    <span className="mt-2 block overflow-x-auto">
      <span className="block min-w-[420px]">
        {lines.map((line) => (
          <span
            key={line.lineNumber}
            className="flex items-baseline gap-3 border-t border-line-subtle py-1 text-[12px]"
          >
            <span className="w-[64px] shrink-0 font-mono text-text-tertiary">
              {line.accountNumber}
            </span>
            <span className="min-w-0 flex-1 truncate text-text-secondary">
              {line.accountName}
              {line.text ? ` · ${line.text}` : ''}
              {line.taxCode ? ` · ${line.taxCode}` : ''}
            </span>
            <span className="w-[110px] shrink-0 text-right tabular-nums">
              {line.debit ? formatAmount(line.debit) : ''}
            </span>
            <span className="w-[110px] shrink-0 text-right tabular-nums">
              {line.credit ? formatAmount(line.credit) : ''}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * The way between a counter entry and the entry it reverses — in both directions.
 *
 * <p>Only as far as both stand on the page being read: the journal holds fifty entries at a
 * time and cannot know what is on the others. Where the partner is not there, no link is
 * offered rather than one that leads nowhere.
 */
function LinkedEntry({
  rows,
  row,
  onJump,
}: {
  rows: readonly JournalRow[]
  row: JournalRow
  onJump: (target: JournalRow | undefined) => void
}) {
  const reversed = rows.find((candidate) => candidate.id === row.reversesEntryId)
  const counter = counterOf(rows, row)
  const target = reversed ?? counter
  if (target === undefined) return null
  return (
    <button
      type="button"
      onClick={() => onJump(target)}
      className="mt-0.5 block text-[12px] text-accent-text underline-offset-2 hover:underline"
    >
      {reversed === undefined ? 'Storniert durch ' : 'Storno zu '}
      {target.entryNumber}
    </button>
  )
}

/**
 * Asks the reason, and says once more what a reversal is.
 *
 * <p><b>Both fields are emptied when the box opens.</b> The box stays in the tree while it is
 * shut, so without this the reason and the booking date of the entry before would travel with
 * the next one — and what stands here is written the moment it is confirmed. An inherited
 * reason then explains an entry it says nothing about, an inherited date decides which period
 * the counter entry lands in, and neither can be corrected afterwards.
 */
function ReverseDialog({
  row,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  row: JournalRow | null
  busy: boolean
  error: unknown
  onClose: () => void
  onConfirm: (reason: string, bookingDate: string) => void
}) {
  const [reason, setReason] = useState('')
  const [bookingDate, setBookingDate] = useState('')

  // The endpoint stops the reason earlier than its column does: it is built into «Storno zu
  // <Journalnummer>: …», and that sentence is what has to fit into 200 characters. Derived
  // from the number the box already shows rather than written here as a second constant —
  // with 200 in the field, everything between 178 and 200 characters was typed unhindered and
  // refused only after the button.
  const room = reversalReasonRoom(row?.entryNumber ?? '')

  // Adjusted while rendering rather than in an effect, the same technique as `WriteOffDialog`
  // and `AdvanceDialog`. Unmounting the box instead would cost it its fade, and keying it on
  // the row would keep what was typed whenever the same entry is opened a second time.
  const opened = row?.id ?? null
  const [shown, setShown] = useState<number | null>(opened)
  if (opened !== shown) {
    setShown(opened)
    if (opened !== null) {
      setReason('')
      setBookingDate('')
    }
  }

  return (
    <Dialog
      open={row !== null}
      title="Buchung stornieren"
      onClose={onClose}
      onSubmit={() => reason.trim() !== '' && onConfirm(reason, bookingDate)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => onConfirm(reason, bookingDate)}
            disabled={reason.trim() === ''}
            busy={busy}
          >
            Stornieren
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-[13px] text-text-secondary">
          Storniert wird durch eine <strong>Gegenbuchung</strong> mit vertauschten Seiten, die
          sofort verbucht ist. {row?.entryNumber} bleibt im Journal stehen — genau das ist der
          Nachweis, dass nachträglich nichts verändert wurde.
        </p>
        <TextField
          label="Grund"
          value={reason}
          maxLength={room}
          onChange={(event) => setReason(event.target.value)}
          hint={
            `Steht im Journal neben der Gegenbuchung. `
            + `Noch ${room - reason.length} von ${room} Zeichen.`
          }
        />
        <TextField
          label="Buchungsdatum der Gegenbuchung"
          type="date"
          value={bookingDate}
          onChange={(event) => setBookingDate(event.target.value)}
          hint={`Leer gelassen bucht sie auf den ${formatDate(row?.bookingDate)}.`}
        />
        {row !== null && (
          <p className="text-[12px] text-text-tertiary">
            Verbucht am {formatDateTime(row.postedAt)} von {row.postedBy}.
          </p>
        )}
        {error !== null && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}

/** The counter entry of one row, as far as it stands on the same page. */
function counterOf(
  rows: readonly JournalRow[],
  row: JournalRow,
): JournalRow | undefined {
  return rows.find((candidate) => candidate.reversesEntryId === row.id)
}

/**
 * The year the journal opens on: the one today falls into, and the latest one otherwise.
 *
 * @param years the fiscal years of the tenant, in any order
 * @returns the year to preselect, or undefined where the tenant has none
 */
function defaultYearOf(years: readonly FiscalYear[]): FiscalYear | undefined {
  const today = toIsoDate()
  const running = years.find((year) => year.startDate <= today && today <= year.endDate)
  if (running !== undefined) return running
  return [...years].sort((one, other) => one.endDate.localeCompare(other.endDate)).at(-1)
}

/**
 * The way back, where another screen sent the reader here.
 *
 * <p>`Origin` calls the address `from` and the header calls it `to`; renamed in one place rather
 * than given a second shape. Reached through the navigation there is no origin and no way back,
 * which is what a list normally looks like (frontend ADR-0003).
 */
function backOf(state: unknown): { to: string; label: string } | undefined {
  const origin = optionalOriginOf(state)
  return origin === undefined ? undefined : { to: origin.from, label: origin.label }
}
