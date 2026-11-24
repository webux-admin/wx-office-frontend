import { useQuery } from '@tanstack/react-query'
import { FactList } from '../components/FactList'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { api } from '../lib/api'
import {
  entryCountText,
  hoursText,
  timeSummaryFigures,
  timeSummaryKey,
  timeSummaryUrl,
  type TimeSummaryFigure,
  type TimesOf,
} from '../lib/timetracking'
import type { TimeSummary } from '../lib/types'

/**
 * The tiles of a register «Zeiten»: total, open billable, on a draft, billed and not billable,
 * in hours of the clock.
 *
 * <p>The minutes are the backend's, counted over every user; the screen adds nothing up
 * (backend ADR-0162). On a draft and billed come from the billing rows (backend ADR-0163).
 *
 * @param of the project or the customer whose times are counted
 */
export function TimeSummaryFacts({ tenantId, of }: { tenantId: number; of: TimesOf }) {
  const summary = useQuery({
    queryKey: timeSummaryKey(tenantId, of),
    queryFn: () => api.get<TimeSummary>(timeSummaryUrl(tenantId, of)),
  })

  if (summary.isPending) return <LoadingBlock label="Stunden werden gezählt" />
  if (summary.isError) return <ErrorNotice error={summary.error} />

  return <TimeFigureFacts figures={timeSummaryFigures(summary.data)} />
}

/**
 * Tiles of minutes in hours of the clock, with the count of entries where a tile carries one.
 * The registers «Zeiten» and the evaluation draw theirs alike.
 *
 * @param figures the tiles, in the order they stand
 */
export function TimeFigureFacts({ figures }: { figures: readonly TimeSummaryFigure[] }) {
  return (
    <FactList
      facts={figures.map((figure) => ({
        label: figure.label,
        value: (
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-control font-semibold tabular-nums">
              {hoursText(figure.minutes)}
            </span>
            {figure.entries !== undefined && (
              <span className="text-small text-text-secondary">
                {entryCountText(figure.entries)}
              </span>
            )}
          </span>
        ),
      }))}
    />
  )
}
