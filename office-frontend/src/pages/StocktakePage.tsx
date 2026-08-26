import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from 'react-router-dom'
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
import { formatDate, formatDateTime, formatQuantity } from '../lib/format'
import {
  countLineUrl,
  countProgress,
  countProgressText,
  INVENTORY_RIGHTS,
  STOCK_MOVEMENT_PATH,
  STOCKTAKE_PATH,
  stocktakeKey,
  stocktakeLinesKey,
  stocktakeOpen,
  stocktakeUrl,
} from '../lib/inventory'
import { originOf } from '../lib/origin'
import { emptyPage, listQuery } from '../lib/paging'
import type {
  Page,
  Stocktake,
  StocktakeLine,
  StocktakeStatusEntry,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { DifferenceDialog } from './stocktake/DifferenceDialog'
import { StocktakeLinesTable } from './stocktake/StocktakeLinesTable'
import { StocktakeProtocol } from './stocktake/StocktakeProtocol'

/** How many lines one page of the counting mask holds. */
const LINES_PER_PAGE = 100

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
              onChange={search.setValue}
              placeholder="Nummer, EAN oder Charge"
            />
          </div>
        }
      >
        {/* Announced rather than only drawn: whoever counts with the keyboard never looks at
            the corner of the screen. */}
        <p aria-live="polite" className="mb-3 text-[12px] text-text-secondary">
          {countProgressText(head.countedCount, head.lineCount)}
        </p>

        {head.status === 'DRAFT' ? (
          <EmptyState
            title="Noch nicht zum Zählen geöffnet"
            description="Beim Öffnen wird die Sollmenge jeder Zeile eingefroren."
          />
        ) : lines.isError ? (
          <ErrorNotice error={lines.error} />
        ) : (
          <StocktakeLinesTable
            lines={result.content}
            blind={blind}
            editable={counting && mayCount}
            onCount={(line, quantity) => count.mutateAsync({ line, quantity })}
          />
        )}
        {count.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={count.error} />
          </div>
        )}
      </Panel>

      {head.postedAt !== undefined && (
        <Panel title="Buchungen" description="Was diese Inventur im Lager bewegt hat.">
          <p className="text-[13px]">
            <Link
              to={`${STOCK_MOVEMENT_PATH}?${listQuery({ suche: head.stocktakeNumber })}`}
              className="text-accent-text underline-offset-2 hover:underline"
            >
              Bewegungen dieser Inventur im Journal
            </Link>
          </p>
          <p className="mt-2 text-[12px] text-text-tertiary">
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

/** One labelled figure of the head. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[12px] text-text-tertiary">{label}</dt>
      <dd className="text-[13px]">{value}</dd>
    </div>
  )
}
