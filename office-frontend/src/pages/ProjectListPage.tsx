import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge, type BadgeTone } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import {
  PROJECT_MODULE,
  PROJECT_PATH,
  PROJECT_RIGHTS,
  PROJECT_STATUS_LABELS,
  isProjectStatus,
  projectPeriod,
  projectsKey,
  projectsUrl,
} from '../lib/project'
import type { Page, Project, ProjectStatus } from '../lib/types'

/** Where the mask returns to, and what its back link says. */
const ORIGIN = originState(PROJECT_PATH, 'Projekte')

/** Work under way stands out, work put away steps back. */
const STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  OPEN: 'neutral',
  ACTIVE: 'accent',
  COMPLETED: 'success',
  ARCHIVED: 'muted',
}

/**
 * The projects of the tenant, newest number first.
 *
 * <p>The search looks into number, name and the name of the customer — the last one is
 * answered by the backend, which asks the partner module, so this screen never sifts rows.
 */
export function ProjectListPage() {
  return (
    <RequireTenant permission={PROJECT_RIGHTS.read} module={PROJECT_MODULE}>
      {(tenantId) => <ProjectList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ProjectList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const search = useQuickSearch()
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('projectNumber,desc')
  const mayWrite = can(PROJECT_RIGHTS.write)

  const query = listQuery({ search: search.term, status, page, size: PAGE_SIZE, sort })
  const projects = useQuery({
    queryKey: [...projectsKey(tenantId), 'list', query],
    queryFn: () => api.get<Page<Project>>(`${projectsUrl(tenantId)}?${query}`),
    placeholderData: keepPreviousData,
  })

  const result = projects.data ?? emptyPage<Project>()
  const filtered = search.term !== '' || status !== ''

  const columns: Column<Project>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-[110px]',
      sortKey: 'projectNumber',
      render: (project) => (
        <span className="font-mono text-[12px] text-text-tertiary">{project.projectNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Projekt',
      sortKey: 'name',
      render: (project) => (
        <Link
          to={`${PROJECT_PATH}/${project.id}`}
          state={ORIGIN}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {project.name}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Kunde',
      render: (project) => (
        <span className="text-text-secondary">{project.customerName ?? '-'}</span>
      ),
    },
    {
      key: 'responsible',
      header: 'Verantwortlich',
      width: 'w-[170px]',
      render: (project) => (
        <span className="text-text-secondary">{project.responsibleName ?? '-'}</span>
      ),
    },
    {
      key: 'period',
      header: 'Zeitraum',
      width: 'w-[200px]',
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
      width: 'w-[130px]',
      render: (project) => (
        <Badge tone={STATUS_TONES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Projekte"
        subtitle={`${formatCount(result.totalElements)} Projekte`}
      >
        {mayWrite && (
          <LinkButton to={`${PROJECT_PATH}/neu`} state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Projekt
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Nummer, Projekt oder Kunde"
              maxLength={120}
            />
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => {
                const value = event.target.value
                setStatus(isProjectStatus(value) ? value : '')
                setPage(0)
              }}
            >
              <option value="">Alle</option>
              {Object.entries(PROJECT_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(project) => project.id}
            rowTo={(project) => `${PROJECT_PATH}/${project.id}`}
            rowState={ORIGIN}
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
                title={filtered ? 'Nichts gefunden' : 'Noch keine Projekte'}
                description={
                  filtered
                    ? 'Für diese Suche gibt es kein Projekt. Ein anderer Begriff oder ein anderer Status hilft vielleicht.'
                    : 'Ein Projekt hält fest, woran für welchen Kunden gearbeitet wird.'
                }
              >
                {!filtered && mayWrite && (
                  <LinkButton to={`${PROJECT_PATH}/neu`} state={ORIGIN}>
                    <Plus size={15} aria-hidden />
                    Erstes Projekt anlegen
                  </LinkButton>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>
    </>
  )
}
