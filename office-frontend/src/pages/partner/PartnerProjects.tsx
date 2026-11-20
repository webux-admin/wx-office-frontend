import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { emptyPage } from '../../lib/paging'
import {
  PROJECT_PATH,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  partnerProjectsUrl,
  projectPeriod,
  projectsKey,
} from '../../lib/project'
import type { Page, Project } from '../../lib/types'

/**
 * The projects of one customer, archived ones included.
 *
 * <p>Unlike the project list this one keeps the archive: on the customer the projects are what
 * was done for them, and a deactivated customer keeps its projects too.
 */
export function PartnerProjects({
  tenantId,
  partnerId,
}: {
  tenantId: number
  partnerId: number
}) {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('projectNumber,desc')
  // A project opened from a row names this mask as the way back.
  const origin = originState(useLocation().pathname, 'Kunde')

  const projects = useQuery({
    queryKey: [...projectsKey(tenantId), 'partner', partnerId, page, sort],
    queryFn: () => api.get<Page<Project>>(partnerProjectsUrl(tenantId, partnerId, page, sort)),
    placeholderData: keepPreviousData,
  })
  const result = projects.data ?? emptyPage<Project>()

  const columns: Column<Project>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-column-sm',
      sortKey: 'projectNumber',
      render: (project) => (
        <span className="font-mono text-small text-text-tertiary">{project.projectNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Projekt',
      sortKey: 'name',
      render: (project) => (
        <Link
          to={`${PROJECT_PATH}/${project.id}`}
          state={origin}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {project.name}
        </Link>
      ),
    },
    {
      key: 'period',
      header: 'Zeitraum',
      width: 'w-column-xl',
      sortKey: 'startDate',
      render: (project) => (
        <span className="text-text-secondary tabular-nums">
          {projectPeriod(project.startDate, project.endDate, formatDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-column-md',
      render: (project) => (
        <Badge tone={PROJECT_STATUS_TONES[project.status]}>
          {PROJECT_STATUS_LABELS[project.status]}
        </Badge>
      ),
    },
  ]

  return (
    <Panel title="Projekte" padded={false}>
      <DataTable
        columns={columns}
        rows={result.content}
        keyOf={(project) => project.id}
        rowTo={(project) => `${PROJECT_PATH}/${project.id}`}
        rowState={origin}
        page={result}
        onPageChange={setPage}
        sort={sort}
        onSortChange={(next) => {
          setSort(next)
          setPage(0)
        }}
        loading={projects.isPending}
        error={projects.error}
        empty={
          <EmptyState
            title="Noch keine Projekte"
            description="Für diesen Kunden ist noch kein Projekt erfasst."
          />
        }
      />
    </Panel>
  )
}
