import type { ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DataTable, type Column } from '../../components/DataTable'
import { api } from '../../lib/api'
import { formatDurationShort } from '../../lib/duration'
import { formatCount } from '../../lib/format'
import {
  GROUP_HEADERS,
  drillDown,
  evaluationGroupsKey,
  evaluationGroupsUrl,
  evaluationPath,
  groupDetail,
  groupKey,
  groupLabel,
  type TimeEvaluationFilter,
} from '../../lib/timeEvaluation'
import type { TimeGroup, TimeGrouping, TimeSummary } from '../../lib/types'

/**
 * The sums of the evaluation, one row per person, project, customer, service, week or month.
 *
 * <p>Every row is a link to the entries of exactly that group: the filter narrowed to its id, to
 * «ohne …», or to the days of the week or month inside the range. A link and not a button, so it
 * opens in a new tab and the back button returns to the sums (frontend ADR-0086).
 *
 * <p>The sums are the backend's, row by row; the table adds no line «Total» of its own — the
 * tiles above carry the sum over the filter.
 *
 * @param filter the filter as the requests go out, with both days
 * @param grouping what the rows are
 * @param empty what the table says while the filter holds no entry
 */
export function EvaluationGroups({
  tenantId,
  filter,
  grouping,
  empty,
}: {
  tenantId: number
  filter: TimeEvaluationFilter
  grouping: TimeGrouping
  empty: ReactNode
}) {
  const groups = useQuery({
    queryKey: evaluationGroupsKey(tenantId, grouping, filter),
    queryFn: () => api.get<TimeGroup[]>(evaluationGroupsUrl(tenantId, grouping, filter)),
    placeholderData: keepPreviousData,
  })
  const entriesOf = (group: TimeGroup) => evaluationPath(drillDown(filter, grouping, group), 'entries')

  const columns: Column<TimeGroup>[] = [
    {
      key: 'group',
      header: GROUP_HEADERS[grouping],
      render: (group) => {
        const detail = groupDetail(group, grouping)
        return (
          <Link
            to={entriesOf(group)}
            className={`grid hover:text-accent-text ${group.id == null && group.period == null ? 'text-text-tertiary' : 'font-medium'}`}
          >
            <span>{groupLabel(group, grouping)}</span>
            {detail !== null && (
              <span className="text-small font-normal text-text-tertiary tabular-nums">{detail}</span>
            )}
          </Link>
        )
      },
    },
    {
      key: 'entries',
      header: 'Einträge',
      align: 'right',
      width: 'w-column-xs',
      hideBelow: 'sm',
      render: (group) => formatCount(group.totals.entries),
    },
    minutesColumn('total', 'Total', (totals) => totals.totalMinutes),
    minutesColumn('billable', 'Verrechenbar', (totals) => totals.billableMinutes, true),
    minutesColumn('open', 'Offen', (totals) => totals.openMinutes),
    minutesColumn('inDraft', 'Im Entwurf', (totals) => totals.inDraftMinutes, true),
    minutesColumn('billed', 'Verrechnet', (totals) => totals.billedMinutes, true),
    minutesColumn('notBillable', 'Nicht verrechenbar', (totals) => totals.notBillableMinutes, true),
  ]

  return (
    <DataTable
      columns={columns}
      rows={groups.data ?? []}
      keyOf={groupKey}
      rowTo={entriesOf}
      loading={groups.isPending}
      error={groups.error}
      empty={empty}
    />
  )
}

function minutesColumn(
  key: string,
  header: string,
  minutesOf: (totals: TimeSummary) => number,
  hidesOnPhone = false,
): Column<TimeGroup> {
  return {
    key,
    header,
    align: 'right',
    width: 'w-column-xs',
    hideBelow: hidesOnPhone ? 'sm' : undefined,
    render: (group) => formatDurationShort(minutesOf(group.totals)),
  }
}
