import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Printer } from 'lucide-react'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { ErrorNotice, EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { SplitButton } from '../components/SplitButton'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api, ApiError } from '../lib/api'
import { showFile } from '../lib/files'
import { formatAmount, formatDate, formatQuantity, toIsoDate } from '../lib/format'
import {
  backdatedMovementsText,
  INVENTORY_RIGHTS,
  missingAsOfDateNote,
  showsLocationChoice,
  STOCK_AS_OF_PATH,
  STOCK_MOVEMENT_PATH,
  STOCK_PATH,
  stockAsOfListKey,
  stockAsOfPageToShow,
  stockAsOfPdfUrl,
  stockAsOfStandText,
  stockAsOfSummaryKey,
  stockAsOfSummaryUrl,
  stockAsOfUrl,
  stockLocationsKey,
  stockLocationsUrl,
  valueColumnNote,
} from '../lib/inventory'
import { optionalOriginOf, originState } from '../lib/origin'
import { listQuery, PAGE_SIZE } from '../lib/paging'
import { printFile } from '../lib/print'
import type { Page, StockAsOfEntry, StockAsOfSummary, StockLocation } from '../lib/types'
import { BookStockDialog } from './inventory/BookStockDialog'

/** What a mask opened from this report returns to. */
const ORIGIN = originState(STOCK_AS_OF_PATH, 'Inventar')

/**
 * The stock on a cut-off date — the inventory a trustee asks for.
 *
 * <p>A different question from the one the stock list answers. Because a count runs without
 * stopping the store, what was counted on the 20th is not what stood there on the 31st, and a
 * balance sheet asks about the 31st (OR Art. 958c Abs. 2, backend ADR-0071).
 *
 * <p>Everything on this screen comes out of the movement journal, never out of the projection.
 * Every quantity links into the movements that explain it, filtered to the same cut-off date.
 */
export function StockAsOfPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read}>
      {(tenantId) => <StockAsOf tenantId={tenantId} />}
    </RequireTenant>
  )
}

function StockAsOf({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayMove = can(INVENTORY_RIGHTS.move)
  const queryClient = useQueryClient()
  const search = useQuickSearch('')
  // A list is normally reached through the navigation and shows no way back. It gets one where
  // another screen sent the user here, for example a hint out of the count list.
  const back = optionalOriginOf(useLocation().state)
  // Two dates rather than one: what stands in the field while it is being typed, and the day
  // the report is asked about. A half typed day never becomes the second, because a request
  // built without `date` is malformed and is better not sent. A whole day always does,
  // whichever day it is — which days may be asked about is a rule of the inventory and is
  // answered by the server (backend `InventoryRules.validateAsOfDate`).
  const [typedDate, setTypedDate] = useState(toIsoDate())
  const [askedDate, setAskedDate] = useState(typedDate)
  const [locationId, setLocationId] = useState('')
  const [includeZero, setIncludeZero] = useState(false)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('productName,asc')
  const [printing, setPrinting] = useState(false)
  const [printFailure, setPrintFailure] = useState<unknown>(null)
  const [booking, setBooking] = useState(false)

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  // The filters both queries share. The quick search is deliberately not among them: the
  // figures belong to the report, and a search box that changed them would let somebody type
  // their way to a smaller inventory.
  const filters = {
    date: askedDate,
    locationId: locationId === '' ? undefined : locationId,
    includeZero: includeZero ? true : undefined,
  }
  const query = listQuery({ ...filters, search: search.term, page, size: PAGE_SIZE, sort })
  const summaryQuery = listQuery(filters)

  const report = useQuery({
    queryKey: stockAsOfListKey(tenantId, query),
    queryFn: () => api.get<Page<StockAsOfEntry>>(`${stockAsOfUrl(tenantId)}?${query}`),
    // The rows found last stay on screen while the next answer is on its way.
    placeholderData: keepPreviousData,
  })
  const summary = useQuery({
    queryKey: stockAsOfSummaryKey(tenantId, summaryQuery),
    queryFn: () =>
      api.get<StockAsOfSummary>(`${stockAsOfSummaryUrl(tenantId)}?${summaryQuery}`),
    placeholderData: keepPreviousData,
  })

  // What was answered last and which day it was about, remembered rather than read off the
  // field. `placeholderData: keepPreviousData` carries the rows of a request on its way but
  // not of one that failed (TanStack Query v5), and a cut-off date the server refuses is
  // exactly that: the rows of the day before it stay on screen, and they stay under that day.
  const answeredRows = report.isPlaceholderData ? undefined : report.data
  const answeredFacts = summary.isPlaceholderData ? undefined : summary.data
  const [keptRows, setKeptRows] = useState<Page<StockAsOfEntry>>()
  const [keptDate, setKeptDate] = useState(askedDate)
  const [keptFacts, setKeptFacts] = useState<StockAsOfSummary>()
  // Taken over while rendering rather than in an effect: what is on the screen and the day it
  // is about have to change in the same breath, and an effect would show the new rows under
  // the old day for one paint.
  if (answeredRows !== undefined && (answeredRows !== keptRows || askedDate !== keptDate)) {
    setKeptRows(answeredRows)
    setKeptDate(askedDate)
  }
  if (answeredFacts !== undefined && answeredFacts !== keptFacts) setKeptFacts(answeredFacts)

  // The day the rows on screen are about. The header, the empty state, every link out of the
  // table and the printout speak about this one and never about the day in the field:
  // «Bestand per 31.12.2099» over the rows of the 21.01.2026 would be worse than no report.
  const shownDate = answeredRows === undefined ? keptDate : askedDate
  // The printout is the report standing on the screen, so it follows the same day.
  const pdfQuery = listQuery({ ...filters, date: shownDate })
  const result = stockAsOfPageToShow(report.data, keptRows)
  // The figures are held through a refused day and through nothing else: a 400 says «not that
  // day», and the figures of the day before it still stand. Any other failure leaves the
  // valuation unclear, and the notice under them says so rather than showing yesterday's.
  const facts = summary.data ?? (isBadRequest(summary.error) ? keptFacts : undefined)
  const active = locations.data ?? []
  const showsLocations = showsLocationChoice(locations.data)
  // Where the figures failed this is false for want of an answer, not because a cost is
  // missing. Which of the two it is stands under the figures — the two must never look alike.
  const showsValue = facts?.showsValue ?? false
  const stand = stockAsOfStandText(facts)
  const note = valueColumnNote(facts)
  const backdated =
    facts === undefined ? '' : backdatedMovementsText(facts.backdatedMovements, facts.asOf)
  // The cut-off day is what the report is about and never a filter: a day with nothing in it
  // is an answer. These three are filters, and where one of them emptied the list the screen
  // says so instead of claiming that nothing was booked up to that day.
  const filtered = search.term !== '' || locationId !== '' || includeZero
  // A refused cut-off date belongs at the date field, where the day was typed. The field
  // itself only says when there is no whole day to send at all; whether a day may be asked
  // about is a rule of the inventory and arrives in its own words.
  const dateProblem =
    missingAsOfDateNote(typedDate) ?? fieldError(report.error) ?? fieldError(summary.error)
  // A failed request never becomes an empty state. «Am 31.12.2025 war kein Bestand gebucht»
  // is a statement about the books, and a refusal is not one. Where a refused day left the
  // rows of an earlier one standing, the date field carries the refusal alone: the notice
  // replaces the table and would take away exactly those rows, which are still true. Where
  // there is nothing to keep, the table says what happened instead.
  const tableProblem = isBadRequest(report.error) && keptRows !== undefined ? null : report.error
  // One failure, one place: where the table already carries it, the figures failed with the
  // same day and saying so twice only splits the reader in two.
  const factsProblem = tableProblem === null ? summaryProblem(summary.error) : null

  const resetFilters = () => {
    search.setValue('')
    setLocationId('')
    setIncludeZero(false)
    setPage(0)
  }

  /**
   * Takes over a typed day, once it is a whole one.
   *
   * <p>Every keystroke lands in the field, but only a whole day is asked about: a request
   * built without `date` is malformed and would earn a 400 while somebody is still typing.
   * Whether the day itself may be asked about is not decided here — the server answers that,
   * and its answer lands at the same field.
   */
  const acceptDate = (value: string) => {
    setTypedDate(value)
    if (missingAsOfDateNote(value) !== undefined) return
    setAskedDate(value)
    setPage(0)
  }

  /** The movements behind one row, filtered the way the row is and cut at the same day. */
  const journalOf = (row: StockAsOfEntry) =>
    `${STOCK_MOVEMENT_PATH}?produkt=${row.productId}&lagerort=${row.locationId}&bis=${shownDate}`

  const openPdf = async (print: boolean) => {
    setPrinting(true)
    setPrintFailure(null)
    try {
      const file = await api.file(stockAsOfPdfUrl(tenantId, pdfQuery))
      if (print) await printFile(file)
      else showFile(file)
    } catch (failure) {
      setPrintFailure(failure)
    } finally {
      setPrinting(false)
    }
  }

  const columns: Column<StockAsOfEntry>[] = [
    {
      key: 'productNumber',
      header: 'Nummer',
      sortKey: 'productNumber',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {row.productNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'productName',
      header: 'Bezeichnung',
      sortKey: 'productName',
      render: (row) => <span className="font-medium">{row.productName}</span>,
    },
    ...(showsLocations
      ? [
          {
            key: 'locationName',
            header: 'Lagerort',
            sortKey: 'locationName',
            width: 'w-[150px]',
            render: (row: StockAsOfEntry) => (
              <span className="text-text-secondary">{row.locationName}</span>
            ),
          },
        ]
      : []),
    {
      key: 'quantity',
      header: 'Menge',
      align: 'right',
      sortKey: 'quantity',
      width: 'w-[120px]',
      render: (row) => (
        <Link
          to={journalOf(row)}
          state={ORIGIN}
          className={`font-medium transition-colors hover:text-accent-text ${
            row.quantity < 0 ? 'text-danger' : ''
          }`}
          title="Bewegungen dieser Zeile"
        >
          {formatQuantity(row.quantity)}
        </Link>
      ),
    },
    // The unit explains the quantity, it does not carry the row: on a phone it goes and
    // designation and quantity stay.
    {
      key: 'unitShortName',
      header: 'Einheit',
      width: 'w-[90px]',
      hideBelow: 'sm',
      render: (row) => <span className="text-text-secondary">{row.unitShortName ?? '-'}</span>,
    },
    // All or nothing: where one line has no cost the two columns are gone for the whole
    // report, and the note under the table says why. Never 0.00 (backend ADR-0071).
    ...(showsValue
      ? [
          {
            key: 'unitCost',
            header: 'Einstandspreis',
            align: 'right' as const,
            sortKey: 'unitCost',
            width: 'w-[130px]',
            hideBelow: 'sm' as const,
            render: (row: StockAsOfEntry) => (
              <span className="text-text-secondary">
                {row.unitCost === undefined ? '-' : formatAmount(row.unitCost)}
              </span>
            ),
          },
          {
            key: 'lineValue',
            header: 'Wert',
            align: 'right' as const,
            width: 'w-[130px]',
            render: (row: StockAsOfEntry) => (
              <span className="font-medium">
                {row.lineValue === undefined ? '-' : formatAmount(row.lineValue)}
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Inventar"
        subtitle={`Bestand per ${formatDate(shownDate)} · aus dem Bewegungsjournal gerechnet`}
        back={back && { to: back.from, label: back.label }}
      >
        <SplitButton
          onClick={() => void openPdf(false)}
          busy={printing}
          menuLabel="Weitere Wege zum Bericht"
          actions={[
            {
              id: 'print',
              label: 'Drucken',
              hint: 'Öffnet den Druckdialog des Browsers',
              icon: <Printer size={15} aria-hidden />,
              onSelect: () => void openPdf(true),
            },
          ]}
        >
          Als PDF anzeigen
        </SplitButton>
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            {/* The focus starts here: the cut-off date is the one thing this screen is about. */}
            <TextField
              label="Bestand per"
              type="date"
              value={typedDate}
              autoFocus
              onChange={(event) => acceptDate(event.target.value)}
              className="w-[170px]"
              invalid={dateProblem !== undefined}
              hint={dateProblem}
            />
            {showsLocations && (
              <SelectField
                label="Lagerort"
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value)
                  setPage(0)
                }}
                className="w-[190px]"
              >
                <option value="">Alle</option>
                {active.map((location) => (
                  <option key={location.id} value={`${location.id}`}>
                    {location.code} · {location.name}
                  </option>
                ))}
              </SelectField>
            )}
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Nummer oder Bezeichnung"
              maxLength={140}
            />
            <CheckboxField
              label="Zeilen ohne Bestand zeigen"
              checked={includeZero}
              onChange={(event) => {
                setIncludeZero(event.target.checked)
                setPage(0)
              }}
              className="h-10 items-center"
            />
          </div>

          <div className="grid gap-2 border-b border-line-subtle px-5 py-3">
            {stand !== '' && <p className="text-[12px] text-text-tertiary">{stand}</p>}
            {backdated !== '' && (
              <p role="status" className="text-[12px] text-text-secondary">
                {backdated}{' '}
                <Link
                  to={`${STOCK_MOVEMENT_PATH}?bis=${shownDate}`}
                  state={ORIGIN}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  Im Journal ansehen
                </Link>
              </p>
            )}
            {note !== '' && <p className="text-[12px] text-text-secondary">{note}</p>}
            {factsProblem !== null && (
              <ErrorNotice error={factsProblem}>
                <p className="text-[13px] text-text-secondary">
                  Ohne diese Zahlen nennt der Bericht keinen Stand und führt keine Wertspalten.
                  Das heisst <strong className="font-semibold">nicht</strong>, dass die
                  Einstandspreise fehlen — die Mengen unten stimmen, nur die Bewertung ist
                  ungeklärt.
                </p>
              </ErrorNotice>
            )}
          </div>

          {printFailure !== null && (
            <div className="px-5 py-3">
              <ErrorNotice error={printFailure} />
            </div>
          )}

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(row) => `${row.productId}-${row.locationId}`}
            rowTo={journalOf}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={report.isPending}
            error={tableProblem}
            empty={
              filtered ? (
                <EmptyState title="Keine Treffer." description={missText(search.term)}>
                  <Button variant="secondary" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  title={`Am ${formatDate(shownDate)} war kein Bestand gebucht.`}
                  description="Was später gebucht wurde, erscheint hier erst mit einem späteren Stichtag."
                >
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {mayMove && (
                      <Button onClick={() => setBooking(true)}>
                        <Plus size={15} aria-hidden />
                        Bestand buchen
                      </Button>
                    )}
                    <LinkButton to={STOCK_PATH} state={ORIGIN} variant="secondary">
                      Bestand heute ansehen
                    </LinkButton>
                  </div>
                </EmptyState>
              )
            }
          />
        </Panel>
      </div>

      <BookStockDialog
        open={booking}
        onClose={() => {
          setBooking(false)
          // The dialog refreshes stock and journal, but it knows nothing of the cut-off day
          // this screen stands on. A booking dated back to it has to show up here too.
          void queryClient.invalidateQueries({ queryKey: stockAsOfListKey(tenantId, query) })
          void queryClient.invalidateQueries({
            queryKey: stockAsOfSummaryKey(tenantId, summaryQuery),
          })
        }}
        tenantId={tenantId}
        locations={active}
      />
    </>
  )
}

/**
 * A refused cut-off date belongs at the date field, not across the whole page.
 *
 * <p>In the wording of the server and unchanged: which days a report may be asked about is a
 * rule of the inventory (backend `InventoryRules.validateAsOfDate`), and a sentence of our
 * own beside it would be a second version of that rule, free to drift away from it.
 *
 * @param failure what the request answered, `null` while it went through
 * @returns the message for the field, or undefined where the failure is not about the date
 */
function fieldError(failure: unknown): string | undefined {
  return isBadRequest(failure) ? failure.message : undefined
}

/**
 * What went wrong with the figures over the whole report, where it was not the day.
 *
 * <p>Said out loud rather than swallowed: the value columns hang on these figures, and a
 * failed request would otherwise take them away exactly the way a missing cost does. That is
 * the one confusion this report exists to prevent — «für 12 von 84 Zeilen ist kein
 * Einstandspreis erfasst» is a statement about the books, a broken connection is not (backend
 * ADR-0071).
 *
 * @param failure what the summary request answered, `null` while it went through
 * @returns the failure to show over the table, or null where the date field carries it
 */
function summaryProblem(failure: unknown): unknown {
  return isBadRequest(failure) ? null : failure
}

/**
 * Why a filtered report shows nothing.
 *
 * <p>The figures over the table count the whole report and know nothing of the quick search —
 * that is deliberate, so that nobody types their way to a smaller inventory. Without the
 * second sentence «84 Zeilen» would stand right above «keine Zeile» and contradict it.
 *
 * @param term what is being searched for, empty where the list was narrowed some other way
 * @returns the sentence under the title of the empty state
 */
function missText(term: string): string {
  const miss = 'Für diese Auswahl führt der Bericht keine Zeile.'
  if (term === '') return miss
  return `${miss} Die Zeilenzahl darüber zählt den ganzen Bericht — die Schnellsuche wirkt nur `
    + 'auf die Liste.'
}

function isBadRequest(failure: unknown): failure is ApiError {
  return failure instanceof ApiError && failure.status === 400
}
