import { useEffect, useRef, useState, type ReactNode } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatDate, formatDateTime, formatQuantity } from '../lib/format'
import {
  countLineUrl,
  countProgress,
  countProgressText,
  INVENTORY_RIGHTS,
  STOCK_MOVEMENT_PATH,
  STOCKTAKE_PATH,
  stockMovementListKey,
  stockMovementsUrl,
  stocktakeKey,
  stocktakeLinesKey,
  stocktakeOpen,
  stocktakeUrl,
} from '../lib/inventory'
import { originOf } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE, pageRange } from '../lib/paging'
import type {
  Page,
  StockMovement,
  Stocktake,
  StocktakeLine,
  StocktakeStatusEntry,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { DifferenceDialog } from './stocktake/DifferenceDialog'
import { StocktakeLineCards } from './stocktake/StocktakeLineCards'
import { ScanHandledByTheMask, type ScanLookup } from './stocktake/scanLookup'
import { focusCountField } from './stocktake/useCountEntry'
import { StocktakeLinesTable, StocktakeScan } from './stocktake/StocktakeLinesTable'
import { StocktakeProtocol } from './stocktake/StocktakeProtocol'

/** How many lines one page of the counting mask holds. */
const LINES_PER_PAGE = 100

/**
 * From this width up the lines are a table, below it they are cards.
 *
 * <p>The width Tailwind calls `sm`, so the two views meet exactly where the rest of the layout
 * changes as well.
 */
const WIDE_ENOUGH_FOR_THE_TABLE = '(min-width: 640px)'

/** The three chips over the lines. */
const CHIPS = [
  { id: 'alle', label: 'Alle' },
  { id: 'offen', label: 'Offen' },
  { id: 'differenz', label: 'Mit Differenz' },
] as const

/**
 * One count list: its head, its lines, and the way to booking it.
 *
 * <p>Built like the document mask, because a count list is a document: a header with the state
 * and the buttons that move it, a panel for the head, a panel for the lines, a panel for the
 * trail. What it does not have is a save button — every line saves on its own
 * (Frontend-ADR-0016).
 */
export function StocktakePage() {
  const { id } = useParams()
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read}>
      {(tenantId) => <StocktakeMask tenantId={tenantId} stocktakeId={Number(id)} />}
    </RequireTenant>
  )
}

function StocktakeMask({ tenantId, stocktakeId }: { tenantId: number; stocktakeId: number }) {
  const { can } = useAuth()
  const mayCount = can(INVENTORY_RIGHTS.count)
  const mayPostIt = can(INVENTORY_RIGHTS.countPost)
  const queryClient = useQueryClient()
  const search = useQuickSearch('')
  const [chip, setChip] = useState<(typeof CHIPS)[number]['id']>('alle')
  const [page, setPage] = useState(0)
  const [checking, setChecking] = useState(false)
  // The box the lines are drawn in, whichever layout draws them. The camera hangs above it and
  // has to be able to put the focus into a line without knowing which view is mounted.
  const linesBox = useRef<HTMLDivElement>(null)
  const wide = useWideEnoughForTheTable()
  const statusLabel = useCatalogueLabel(tenantId, 'stocktake-status')
  const origin = originOf(useLocation().state, { from: STOCKTAKE_PATH, label: 'Inventuren' })

  const stocktake = useQuery({
    queryKey: stocktakeKey(tenantId, stocktakeId),
    queryFn: () => api.get<Stocktake>(stocktakeUrl(tenantId, stocktakeId)),
  })

  const linesQuery = listQuery({
    openOnly: chip === 'offen' ? true : undefined,
    withDifference: chip === 'differenz' ? true : undefined,
    search: search.term,
    page,
    size: LINES_PER_PAGE,
  })
  const lines = useQuery({
    queryKey: stocktakeLinesKey(tenantId, stocktakeId, linesQuery),
    queryFn: () =>
      api.get<Page<StocktakeLine>>(
        `${stocktakeUrl(tenantId, stocktakeId)}/lines?${linesQuery}`,
      ),
    enabled: stocktake.data !== undefined,
    placeholderData: keepPreviousData,
  })

  // The rows this booking wrote, for the «Buchungen» panel. Asked of the journal rather than
  // of the count list: a movement belongs to the journal, and its number is the way in — the
  // quick search of the journal reads the source number of a row (backend `MovementQueries`).
  // Nothing is asked for before there is a number, which is only there once the list is booked.
  const bookedNumber =
    stocktake.data?.postedAt === undefined ? undefined : stocktake.data.stocktakeNumber
  const movementQuery = listQuery({
    search: bookedNumber,
    size: PAGE_SIZE,
    sort: 'bookedOn,desc',
  })
  const movements = useQuery({
    queryKey: stockMovementListKey(tenantId, movementQuery),
    queryFn: () =>
      api.get<Page<StockMovement>>(`${stockMovementsUrl(tenantId)}?${movementQuery}`),
    enabled: bookedNumber !== undefined,
  })

  const trail = useQuery({
    queryKey: [...stocktakeKey(tenantId, stocktakeId), 'trail'],
    queryFn: () =>
      api.get<StocktakeStatusEntry[]>(
        `${stocktakeUrl(tenantId, stocktakeId)}/status-trail`,
      ),
    enabled: stocktake.data !== undefined,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: stocktakeKey(tenantId, stocktakeId) })
    void queryClient.invalidateQueries({
      queryKey: ['stocktake-lines', tenantId, stocktakeId],
    })
  }

  const start = useMutation({
    mutationFn: () => api.post<Stocktake>(`${stocktakeUrl(tenantId, stocktakeId)}/start`, {}),
    onSuccess: refresh,
  })

  const count = useMutation({
    mutationFn: (input: { line: StocktakeLine; quantity: number }) =>
      api.put<Stocktake>(countLineUrl(tenantId, stocktakeId, input.line.id), {
        quantity: input.quantity,
      }),
    onSuccess: refresh,
  })

  if (stocktake.isLoading) return <LoadingBlock />
  if (stocktake.isError) return <ErrorNotice error={stocktake.error} />
  const head = stocktake.data
  if (head === undefined) return <ErrorNotice error={new Error('Inventur nicht gefunden')} />

  const open = stocktakeOpen(head.status)
  const counting = head.status === 'COUNTING'
  const result = lines.data ?? emptyPage<StocktakeLine>()
  const blind = head.blindCount && counting

  // Both views are handed exactly the same thing, because they are the same mask in two
  // layouts: what a line is, whether it may be typed into, and where a count goes.
  const lineView = {
    lines: result.content,
    blind,
    editable: counting && mayCount,
    onCount: (line: StocktakeLine, quantity: number) => count.mutateAsync({ line, quantity }),
  }

  // The camera and the jump field are the same road to the same answer, and the issue says so:
  // «Der Scan ersetzt die Suche». The mask owns that road because it is the mask that knows the
  // lines arrive a page at a time and narrowed by a chip — a scan judged against the rows on
  // screen calls a code foreign whenever the filter or the page number hid its line, and that
  // sentence is the only word the user gets.
  const scanLookup: ScanLookup = {
    narrowTo: (code: string) => {
      setChip('alle')
      setPage(0)
      search.setValue(code)
    },
    term: search.term,
    // The field and the term disagree while the term is still settling; after that the request
    // is still out. Either way what is drawn belongs to the previous search.
    pending: search.term !== search.value.trim() || lines.isFetching,
  }

  // The same way onto a field the mask itself uses, because the camera sits above both views
  // and has to reach a line without knowing which of them is drawn.
  const focusLine = (index: number) => focusCountField(linesBox.current, index)

  return (
    <>
      <PageHeader
        title={head.stocktakeNumber ?? 'Inventur'}
        subtitle={`${head.locationName ?? ''} · ${formatDate(head.countingDate)}`}
        back={{ to: origin.from, label: origin.label }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={head.status === 'POSTED' ? 'success' : 'neutral'}>
            {statusLabel(head.status)}
          </Badge>
          {head.status === 'DRAFT' && mayCount && (
            <Button onClick={() => start.mutate()} busy={start.isPending}>
              Zählen starten
            </Button>
          )}
          {/* Absent and not greyed out where the right is missing: a button nobody may press
              is a question the mask should not ask (backend ADR-0070). */}
          {counting && mayPostIt && (
            <Button onClick={() => setChecking(true)}>Differenzen prüfen</Button>
          )}
        </div>
      </PageHeader>

      <Panel title="Kopfdaten">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Lagerort" value={head.locationName ?? ''} />
          <Fact label="Zähldatum" value={formatDate(head.countingDate)} />
          <Fact label="Umfang" value={head.scope === 'ALL' ? 'Ganzer Lagerort' : 'Auswahl'} />
          <Fact label="Sollmenge" value={head.blindCount ? 'Verborgen' : 'Sichtbar'} />
          <Fact label="Fortschritt" value={countProgress(head.countedCount, head.lineCount)} />
          {head.postedAt !== undefined && (
            <Fact
              label="Nicht gezählte Zeilen"
              value={head.uncountedHandling === 'KEEP' ? 'Als unverändert übernommen'
                : 'Nicht gebucht'}
            />
          )}
          {head.note !== undefined && <Fact label="Bemerkung" value={head.note} />}
        </dl>
        {!mayPostIt && counting && (
          <p className="mt-4 text-[12px] text-text-tertiary">
            Buchen darf, wer das Recht «Inventur buchen» hält.
          </p>
        )}
      </Panel>

      <Panel
        title="Zeilen"
        description={counting
          ? 'Menge tippen, Enter — der Fokus springt in die nächste offene Zeile.'
          : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {CHIPS.map((entry) => (
              <Button
                key={entry.id}
                variant={chip === entry.id ? 'primary' : 'secondary'}
                onClick={() => {
                  setChip(entry.id)
                  setPage(0)
                }}
              >
                {entry.label}
              </Button>
            ))}
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                // Page 2 of the whole list is not page 2 of the narrowed one: without this a
                // term typed on a later page is answered with an empty page, which reads as
                // «nothing found» for a term that has plenty.
                setPage(0)
              }}
              placeholder="Nummer, EAN oder Charge"
            />
          </div>
        }
      >
        {/* The first thing in the panel and above both layouts, so it is reachable without
            scrolling — and so it outlives the rows: a scan that finds nothing empties the view
            below, and that is exactly the moment its sentence has to be readable and the camera
            has to stay there for the next article. */}
        {lineView.editable && (
          <StocktakeScan lines={result.content} onJump={focusLine} lookup={scanLookup} />
        )}

        {/* Announced rather than only drawn: whoever counts with the keyboard never looks at
            the corner of the screen. */}
        <p aria-live="polite" className="mb-3 text-[12px] text-text-secondary">
          {countProgressText(head.countedCount, head.lineCount)}
        </p>

        <div ref={linesBox}>
          {head.status === 'DRAFT' ? (
            <EmptyState
              title="Noch nicht zum Zählen geöffnet"
              description="Beim Öffnen wird die Sollmenge jeder Zeile eingefroren."
            />
          ) : lines.isError ? (
            <ErrorNotice error={lines.error} />
          ) : (
            /* The camera above belongs to the mask, so the block either view asks for stands
               aside rather than drawing a second button. */
            <ScanHandledByTheMask.Provider value>
              {wide ? (
                <StocktakeLinesTable {...lineView} />
              ) : (
                /* One view at a time and never both: two mounted views would give every line
                   two quantity fields, and the keyboard flow would jump into the hidden one. */
                <StocktakeLineCards {...lineView} />
              )}
            </ScanHandledByTheMask.Provider>
          )}
        </div>

        {/* Under both views and not inside one of them: which layout is on screen is a matter
            of width, and how many lines there are is not. A count over a whole location runs
            past one page, and a line that cannot be reached cannot be counted. */}
        {head.status !== 'DRAFT' && !lines.isError && (
          <LinePager page={result} onPageChange={setPage} />
        )}

        {count.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={count.error} />
          </div>
        )}
      </Panel>

      {bookedNumber !== undefined && (
        <Panel title="Buchungen" description="Was diese Inventur im Lager bewegt hat.">
          <BookedMovements
            movements={movements.data}
            error={movements.error}
            loading={movements.isPending}
            stocktakeNumber={bookedNumber}
          />
          <p className="mt-3 text-[12px] text-text-tertiary">
            {`Differenz insgesamt ${formatQuantity(head.differenceSum ?? 0)}`}
          </p>
        </Panel>
      )}

      {/* Same condition as the panel above, for the same reason: the protocol is written while
          the list is booked, so before that there is nothing to show and nothing to grey out
          (backend ADR-0071). */}
      {head.postedAt !== undefined && (
        <StocktakeProtocol
          tenantId={tenantId}
          stocktakeId={stocktakeId}
          stocktakeNumber={head.stocktakeNumber}
        />
      )}

      <Panel title="Verlauf">
        {trail.isError ? (
          <ErrorNotice error={trail.error} />
        ) : (
          <ul className="grid gap-2 text-[13px]">
            {(trail.data ?? []).map((entry, index) => (
              <li key={index} className="flex flex-wrap gap-2 text-text-secondary">
                <span className="font-medium text-text-primary">
                  {statusLabel(entry.status)}
                </span>
                <span>{formatDateTime(entry.changedAt)}</span>
                <span>{entry.changedBy}</span>
                {entry.note !== undefined && <span>{entry.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {checking && open && (
        <DifferenceDialog
          tenantId={tenantId}
          stocktake={head}
          open={checking}
          onClose={() => setChecking(false)}
          onPosted={() => {
            setChecking(false)
            refresh()
            void queryClient.invalidateQueries({
              queryKey: [...stocktakeKey(tenantId, stocktakeId), 'trail'],
            })
          }}
        />
      )}
    </>
  )
}

/**
 * Whether there is room for the table of lines.
 *
 * <p>Asked in JavaScript and not with a `hidden sm:block` pair in CSS, because the answer
 * decides which view is <b>mounted</b>. Both at once would give every line two quantity
 * fields with the same name: `Enter` would carry the focus into the one nobody can see, and a
 * screen reader would read the list twice. It is the same mechanism the sidebar uses for the
 * same reason (`layout/useSidebarCollapsed.ts`).
 *
 * @returns true from `sm` up, and while nothing can be asked
 */
function useWideEnoughForTheTable(): boolean {
  const [wide, setWide] = useState(matchesTableWidth)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(WIDE_ENOUGH_FOR_THE_TABLE)
    const update = (event: MediaQueryListEvent) => setWide(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}

/**
 * What the browser says about the width right now.
 *
 * <p>A renderer without `matchMedia` gets the table: that is the view this mask had before the
 * cards existed, and a missing media query is no reason to hand a desktop the phone layout.
 */
function matchesTableWidth(): boolean {
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia(WIDE_ENOUGH_FOR_THE_TABLE).matches
}

/**
 * Which lines are on screen and how to reach the rest.
 *
 * <p>Reads like the pager of `DataTable`, down to the range sentence and the two labels, and
 * for the same reason: this is the same control on a different table. It is written out here
 * because the counting mask does not use `DataTable` — one of its columns is typed into, which
 * is the same argument the position table of a document makes.
 *
 * <p>Shown under both layouts of the mask. Which one is drawn depends on the width; how many
 * lines there are does not.
 *
 * @param page the page of lines as the server answered it
 * @param onPageChange asks for another page, counted from zero
 */
function LinePager({
  page,
  onPageChange,
}: {
  page: Page<StocktakeLine>
  onPageChange: (page: number) => void
}) {
  if (page.totalPages <= 1) return null
  const { first, last } = pageRange(page)

  return (
    <nav
      aria-label="Seiten"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3"
    >
      <p className="text-[12px] text-text-secondary" aria-live="polite">
        <span className="font-mono tabular-nums">
          {formatCount(first)}–{formatCount(last)}
        </span>{' '}
        von <span className="font-mono tabular-nums">{formatCount(page.totalElements)}</span>
      </p>
      <span className="flex items-center gap-1">
        <PagerStep
          label="Vorherige Seite"
          disabled={page.page <= 0}
          onClick={() => onPageChange(page.page - 1)}
        >
          <ChevronLeft size={15} aria-hidden />
        </PagerStep>
        <span className="px-2 text-[12px] text-text-secondary">
          Seite <span className="font-mono tabular-nums">{page.page + 1}</span> von{' '}
          <span className="font-mono tabular-nums">{page.totalPages}</span>
        </span>
        <PagerStep
          label="Nächste Seite"
          disabled={page.page >= page.totalPages - 1}
          onClick={() => onPageChange(page.page + 1)}
        >
          <ChevronRight size={15} aria-hidden />
        </PagerStep>
      </span>
    </nav>
  )
}

/** One arrow of the pager; named for a screen reader, since it carries only an icon. */
function PagerStep({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-text-secondary transition-colors hover:bg-sunken hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * What booking the count list left in the stock: one row per movement it wrote.
 *
 * <p>A sum alone would not say what happened — «Differenz insgesamt -3» over a single link
 * leaves open which article moved which way, and that is the whole point of booking a count.
 * So every movement stands here with its article, its lot and its signed quantity, and every
 * one of them leads into the journal narrowed to that article at that location, the same way
 * every number in the stock list does.
 *
 * <p>Bounded on purpose: a count over a whole location can differ on hundreds of lines, and a
 * panel is not a journal. What does not fit is named as a count and left to the link.
 *
 * @param movements the page the journal answered with, undefined while it is on its way
 * @param error set when the journal did not answer
 * @param loading true while the first answer is still out
 * @param stocktakeNumber the number of the booked list, which is what the journal is asked for
 */
function BookedMovements({
  movements,
  error,
  loading,
  stocktakeNumber,
}: {
  movements: Page<StockMovement> | undefined
  error: unknown
  loading: boolean
  stocktakeNumber: string
}) {
  if (error) return <ErrorNotice error={error} />
  if (loading) return <LoadingBlock />

  const page = movements ?? emptyPage<StockMovement>()
  if (page.content.length === 0) {
    return (
      <p className="text-[13px] text-text-secondary">
        Diese Inventur hat nichts bewegt. Jede gezählte Zeile stimmte mit dem Bestand überein.
      </p>
    )
  }

  const { last } = pageRange(page)
  return (
    <>
      <ul className="grid gap-2 text-[13px]">
        {page.content.map((movement) => (
          <li key={movement.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="w-[86px] shrink-0 truncate font-mono text-[12px] text-text-tertiary">
              {movement.productNumber ?? '-'}
            </span>
            <Link
              to={`${STOCK_MOVEMENT_PATH}?${listQuery({
                produkt: movement.productId,
                lagerort: movement.locationId,
              })}`}
              className="font-medium text-accent-text underline-offset-2 hover:underline"
            >
              {movement.productName}
            </Link>
            {movement.lotNumber !== undefined && (
              <span className="font-mono text-[12px] text-text-secondary">
                {movement.lotNumber}
              </span>
            )}
            {/* Signed: a correction reads as a direction, and the sign is the whole message. */}
            <span
              className={`font-mono tabular-nums ${
                movement.quantity < 0 ? 'text-danger' : 'text-accent-text'
              }`}
            >
              {movement.quantity > 0 ? '+' : ''}
              {formatQuantity(movement.quantity)}
              {movement.unitShortName === undefined ? '' : ` ${movement.unitShortName}`}
            </span>
            <span className="text-[12px] text-text-tertiary">{formatDate(movement.bookedOn)}</span>
          </li>
        ))}
      </ul>

      {page.totalElements > last && (
        <p className="mt-2 text-[12px] text-text-tertiary">
          {`… und ${formatCount(page.totalElements - last)} weitere im Journal`}
        </p>
      )}

      <p className="mt-3 text-[13px]">
        <Link
          to={`${STOCK_MOVEMENT_PATH}?${listQuery({ suche: stocktakeNumber })}`}
          className="text-accent-text underline-offset-2 hover:underline"
        >
          Alle Bewegungen dieser Inventur im Journal
        </Link>
      </p>
    </>
  )
}

/** One labelled figure of the head. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[12px] text-text-tertiary">{label}</dt>
      <dd className="text-[13px]">{value}</dd>
    </div>
  )
}
