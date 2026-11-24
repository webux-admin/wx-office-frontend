import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Check, Download } from 'lucide-react'
import { Button } from '../components/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { useDebouncedValue } from '../components/useDebouncedValue'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { fieldErrorsOf, isToldByFields } from '../lib/fieldErrors'
import { downloadFile } from '../lib/files'
import { toIsoDate } from '../lib/format'
import { useRunsModule } from '../lib/modules'
import { originState } from '../lib/origin'
import { PROJECT_MODULE } from '../lib/project'
import {
  evaluationExportUrl,
  evaluationFigures,
  evaluationPath,
  evaluationTotalsKey,
  evaluationTotalsUrl,
  evaluationViews,
  hasWholeRange,
  isNarrowed,
  type TimeEvaluationFilter,
} from '../lib/timeEvaluation'
import { TIMETRACKING_MODULE, TIMETRACKING_RIGHTS } from '../lib/timetracking'
import type { TimeSummary } from '../lib/types'
import { TimeFigureFacts } from '../timetracking/TimeSummaryFacts'
import { EvaluationEntries } from './timetracking/EvaluationEntries'
import { EvaluationFilters } from './timetracking/EvaluationFilters'
import { EvaluationGroups } from './timetracking/EvaluationGroups'
import { useEvaluationAddress } from './timetracking/useEvaluationAddress'

/** The fields of the filter that show a refusal of the backend at themselves. */
const FILTER_FIELDS: readonly string[] = ['from', 'to', 'search']

/** How long the search stands still before it is asked: a request per word, not per letter. */
const SEARCH_DELAY_MS = 300

/**
 * «Auswertung»: every time of the tenant, filtered, summed, grouped and as a CSV file for Excel.
 *
 * <p>With `TIME_READ`, because these are the times of others (OR Art. 328b); «Meine Zeiten» stays
 * with `TIME_TRACK`. The filter stands in the address, so an evaluation goes on as a link (#128,
 * backend ADR-0164, frontend ADR-0086).
 *
 * <p>The screen counts nothing itself. The tiles are the sums of the backend over the whole
 * filter, the rows by group are its sums per group, and a click on a group asks for its entries.
 * «Als CSV herunterladen» takes the same filter; more than 50’000 entries the backend refuses with
 * 422, and its sentence stands under the head.
 */
export function TimeEvaluationPage() {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.read} module={TIMETRACKING_MODULE}>
      {(tenantId) => <Evaluation tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Evaluation({ tenantId }: { tenantId: number }) {
  const runs = useRunsModule()
  const projectsOn = runs(PROJECT_MODULE)
  const [today] = useState(() => toIsoDate())
  const address = useEvaluationAddress(today, projectsOn)
  const { filter, view } = address

  // Everything but the search goes out at once; the search waits until the typing stops.
  const search = useDebouncedValue(filter.search.trim(), SEARCH_DELAY_MS)
  const asked: TimeEvaluationFilter = { ...filter, search }
  const whole = hasWholeRange(asked)

  const totals = useQuery({
    queryKey: evaluationTotalsKey(tenantId, asked),
    queryFn: () => api.get<TimeSummary>(evaluationTotalsUrl(tenantId, asked)),
    enabled: whole,
    placeholderData: keepPreviousData,
  })
  const refusal = totals.error
  const toldByFields = isToldByFields(refusal, FILTER_FIELDS)

  // The file of the filter on screen. Its answer belongs to that filter: a sentence about too
  // many entries is gone once the range is narrower.
  const exportUrl = evaluationExportUrl(tenantId, asked)
  const exporting = useMutation({
    mutationFn: async (url: string) => {
      const file = await api.file(url)
      downloadFile(file)
      return file.fileName
    },
  })
  const exportShown = exporting.variables === exportUrl

  // An invoice opened from a badge leads back to this very evaluation.
  const origin = originState(evaluationPath(filter, view), 'Auswertung')

  const empty = !whole ? (
    <EmptyState
      title="Kein Zeitraum"
      description="Von und Bis wählen, dann zeigt die Auswertung die Zeiten dazwischen."
    />
  ) : toldByFields ? (
    <EmptyState
      title="Filter prüfen"
      description="Am markierten Feld steht, was der Server so nicht annimmt."
    />
  ) : (
    <EmptyState
      title="Keine Zeiten"
      description={
        isNarrowed(filter)
          ? 'Mit diesem Filter ist im Zeitraum keine Zeit erfasst.'
          : 'Im Zeitraum ist keine Zeit erfasst.'
      }
    />
  )

  return (
    <>
      <PageHeader
        title="Auswertung"
        subtitle="Die Zeiten aller Personen, gefiltert und summiert. Die Datei öffnet Excel ohne Import-Assistent."
      >
        <Button
          variant="secondary"
          busy={exporting.isPending}
          disabled={!whole}
          onClick={() => exporting.mutate(exportUrl)}
        >
          <Download size={15} aria-hidden />
          Als CSV herunterladen
        </Button>
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {exportShown && exporting.isError && <ErrorNotice error={exporting.error} />}
        {exportShown && exporting.isSuccess && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 text-small text-text-secondary"
          >
            <Check size={13} className="text-accent-text" aria-hidden />
            Heruntergeladen: {exporting.data}
          </p>
        )}

        <EvaluationFilters
          tenantId={tenantId}
          filter={filter}
          today={today}
          projectsOn={projectsOn}
          errors={fieldErrorsOf(refusal)}
          onChange={address.setFilter}
          onSearch={address.setSearch}
        />

        {whole && totals.isPending && <LoadingBlock label="Stunden werden gezählt" />}
        {whole && totals.isError && !toldByFields && <ErrorNotice error={refusal} />}
        {whole && totals.data !== undefined && (
          <TimeFigureFacts figures={evaluationFigures(totals.data)} />
        )}

        <section aria-label="Zeiten">
          <Tabs
            tabs={evaluationViews(projectsOn)}
            active={view}
            onChange={address.setView}
            label="Darstellung der Zeiten"
          />
          <Panel padded={false}>
            {/* No table while the filter cannot be asked: a table would keep the rows of the
                last answer standing under a question that has none. */}
            {!whole || toldByFields ? (
              empty
            ) : view === 'entries' ? (
              <EvaluationEntries
                tenantId={tenantId}
                filter={asked}
                projectsOn={projectsOn}
                origin={origin}
                empty={empty}
              />
            ) : (
              // One table per grouping: carried over, the rows of the last one would stand
              // under the headings of the next until its answer arrives.
              <EvaluationGroups
                key={view}
                tenantId={tenantId}
                filter={asked}
                grouping={view}
                empty={empty}
              />
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}
