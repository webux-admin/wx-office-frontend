import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { ChoiceField } from '../../components/ChoiceField'
import { Panel } from '../../components/Panel'
import { QuickSearchField } from '../../components/QuickSearch'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import type { Choice } from '../../lib/choices'
import type { FieldErrors } from '../../lib/fieldErrors'
import { isCompleteIsoDate } from '../../lib/format'
import {
  RANGE_PRESETS,
  TIME_ENTRY_STATES,
  TIME_SEARCH_MAX_LENGTH,
  evaluationGroupsKey,
  evaluationGroupsUrl,
  hasWholeRange,
  isAtStart,
  isNarrowed,
  narrowingOf,
  narrowingOptions,
  narrowingValue,
  presetOf,
  presetRange,
  rangeOnly,
  startingView,
  withState,
  type Narrowing,
  type NarrowingOption,
  type TimeEvaluationFilter,
} from '../../lib/timeEvaluation'
import { TIME_ENTRY_STATE_LABELS, colleaguesKey, colleaguesUrl } from '../../lib/timetracking'
import type { TimeColleague, TimeGroup } from '../../lib/types'

/** The value of «ohne Projekt» and its kin in a field, as the address writes it. */
const WITHOUT_VALUE = narrowingValue('NONE')

/** One filter that holds, as a chip that takes it out. */
type ActiveFilter = { key: string; text: string; remove: () => void }

/**
 * The filter of the evaluation, in three groups: the range, who and on what, and state and text.
 * Below them the filters that hold, each to be taken out on its own, and «Filter zurücksetzen».
 *
 * <p>Every field writes the address at once; nothing waits for a button. People, project,
 * customer and service are search fields over lists the browser holds already, so a few hundred
 * entries are found by typing (#138). The people come from the colleagues of the time tracking,
 * which `TIME_READ` reads. Project, customer and service offer what has time in the range, read
 * from the rows by group — the lookups of the quick line ask for `TIME_TRACK` and know only what
 * still takes new time (frontend ADR-0086).
 *
 * @param filter the filter as on screen
 * @param today the day it is, for the presets
 * @param projectsOn without projects there is no field «Projekt»
 * @param errors what the backend refused, by field: `from`, `to` and `search` stand at theirs
 * @param onChange takes the whole filter after a change
 * @param onSearch takes what was typed into the search
 */
export function EvaluationFilters({
  tenantId,
  filter,
  today,
  projectsOn,
  errors,
  onChange,
  onSearch,
}: {
  tenantId: number
  filter: TimeEvaluationFilter
  today: string
  projectsOn: boolean
  errors: FieldErrors
  onChange: (next: TimeEvaluationFilter) => void
  onSearch: (value: string) => void
}) {
  const colleagues = useQuery({
    queryKey: colleaguesKey(tenantId),
    queryFn: () => api.get<TimeColleague[]>(colleaguesUrl(tenantId)),
  })
  // The choices hang on the range alone, so they do not shrink with every other field.
  const range = rangeOnly(filter)
  const projectGroups = useChoices(tenantId, 'project', range, projectsOn).data ?? []
  const customerGroups = useChoices(tenantId, 'customer', range, true).data ?? []
  const serviceGroups = useChoices(tenantId, 'service', range, true).data ?? []
  const projects = narrowingOptions(projectGroups, 'project', filter.project)
  const customers = narrowingOptions(customerGroups, 'customer', filter.customer)
  const services = narrowingOptions(serviceGroups, 'service', filter.service)

  const people = colleagues.data ?? []
  const addablePeople: Choice[] = people
    .filter((colleague) => !filter.userIds.includes(colleague.userId))
    .map((colleague) => ({
      value: String(colleague.userId),
      label: colleague.name,
      detail: colleague.active ? undefined : 'deaktiviert',
      quiet: !colleague.active,
    }))
  const preset = presetOf(filter, today)

  const active: ActiveFilter[] = [
    ...filter.userIds.map((userId) => ({
      key: `person-${userId}`,
      text:
        people.find((colleague) => colleague.userId === userId)?.name ?? `Benutzer ${userId}`,
      remove: () =>
        onChange({ ...filter, userIds: filter.userIds.filter((other) => other !== userId) }),
    })),
    ...narrowingChip('project', projectsOn ? filter.project : null, projects, () =>
      onChange({ ...filter, project: null }),
    ),
    ...narrowingChip('customer', filter.customer, customers, () =>
      onChange({ ...filter, customer: null }),
    ),
    ...narrowingChip('service', filter.service, services, () =>
      onChange({ ...filter, service: null }),
    ),
    ...filter.states.map((state) => ({
      key: `state-${state}`,
      text: TIME_ENTRY_STATE_LABELS[state],
      remove: () => onChange(withState(filter, state, false)),
    })),
    ...(filter.search.trim() === ''
      ? []
      : [
          {
            key: 'search',
            text: `«${filter.search.trim()}»`,
            remove: () => onChange({ ...filter, search: '' }),
          },
        ]),
  ]

  return (
    <Panel clipped={false}>
      <div className="grid divide-y divide-line-subtle">
        <FilterGroup title="Zeitraum">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Von"
              type="date"
              value={filter.from}
              onChange={(event) => onChange({ ...filter, from: event.target.value })}
              error={dayError(filter.from, errors.from)}
              className="w-full sm:w-column-lg"
            />
            <TextField
              label="Bis"
              type="date"
              value={filter.to}
              onChange={(event) => onChange({ ...filter, to: event.target.value })}
              error={dayError(filter.to, errors.to)}
              tooltip="Beide Tage zählen mit. Ein Zeitraum umfasst höchstens 366 Tage."
              className="w-full sm:w-column-lg"
            />
            <div role="group" aria-label="Zeitraum wählen" className="flex flex-wrap gap-1.5 pb-1">
              {RANGE_PRESETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={preset === option.value}
                  onClick={() => onChange({ ...filter, ...presetRange(option.value, today) })}
                  className={`rounded-[var(--radius-full)] border px-3 py-1 text-small transition-colors ${
                    preset === option.value
                      ? 'border-accent bg-accent/12 font-medium text-accent-text'
                      : 'border-line bg-surface text-text-secondary hover:border-text-tertiary hover:text-text-primary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </FilterGroup>

        <FilterGroup title="Wer und worauf">
          <div
            className={`grid gap-3 sm:grid-cols-2 ${projectsOn ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}
          >
            <ChoiceField
              label="Mitarbeitende"
              choices={addablePeople}
              onChoose={(value) =>
                onChange({ ...filter, userIds: [...filter.userIds, Number(value)] })
              }
              placeholder={filter.userIds.length === 0 ? 'Alle' : 'Weitere hinzufügen'}
              emptyText="Alle Personen sind gewählt."
              disabled={people.length === 0}
              tooltip={
                colleagues.isError ? 'Die Liste der Personen konnte nicht geladen werden.' : undefined
              }
            />
            {projectsOn && (
              <NarrowingField
                label="Projekt"
                all="Alle Projekte"
                value={filter.project}
                options={projects}
                onChange={(project) => onChange({ ...filter, project })}
              />
            )}
            <NarrowingField
              label="Kunde"
              all="Alle Kunden"
              value={filter.customer}
              options={customers}
              onChange={(customer) => onChange({ ...filter, customer })}
            />
            <NarrowingField
              label="Leistung"
              all="Alle Leistungen"
              value={filter.service}
              options={services}
              onChange={(service) => onChange({ ...filter, service })}
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Zustand und Text">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div role="group" aria-label="Zustand" className="flex flex-wrap gap-x-4 gap-y-2 pb-2.5">
              {TIME_ENTRY_STATES.map((state) => (
                <CheckboxField
                  key={state}
                  label={TIME_ENTRY_STATE_LABELS[state]}
                  checked={filter.states.includes(state)}
                  onChange={(event) => onChange(withState(filter, state, event.target.checked))}
                />
              ))}
            </div>
            <QuickSearchField
              label="Suche im Text"
              value={filter.search}
              onChange={onSearch}
              placeholder="Was gemacht wurde"
              maxLength={TIME_SEARCH_MAX_LENGTH}
              error={errors.search}
            />
          </div>
        </FilterGroup>
      </div>

      {/* The chips stand in the starting view as well: the sums hold for the whole filter, and a
          missing «verrechnet» has to be seen to read a smaller total right (#144). */}
      {(isNarrowed(filter) || !isAtStart(filter)) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle pt-4">
          <span className="w-full text-overline text-text-tertiary sm:w-auto">Aktive Filter</span>
          {/* Every state and nothing else narrowed: no chip to take away, only the way back. */}
          {active.length === 0 ? (
            <span className="text-small text-text-secondary sm:min-w-0 sm:flex-1">Alle Zustände</span>
          ) : (
            <ul aria-label="Aktive Filter" className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:min-w-0 sm:flex-1">
              {active.map((chip) => (
                <li key={chip.key} className="min-w-0">
                  <button
                    type="button"
                    aria-label={`${chip.text} aus dem Filter nehmen`}
                    onClick={chip.remove}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-full)] border border-line bg-sunken px-3 py-1 text-small text-text-primary transition-colors hover:border-text-tertiary"
                  >
                    <span className="truncate">{chip.text}</span>
                    <X size={12} aria-hidden className="shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!isAtStart(filter) && (
            <Button variant="ghost" onClick={() => onChange(startingView(filter))}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}

/**
 * One group of the filter: a short title on the left of a wide screen, above the fields on a
 * narrow one.
 */
function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-2 py-4 first:pt-0 last:pb-0 lg:grid-cols-[var(--spacing-column-md)_minmax(0,1fr)] lg:gap-4"
    >
      <h3 id={titleId} className="text-overline text-text-tertiary lg:pt-7">
        {title}
      </h3>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/**
 * «Projekt», «Kunde» or «Leistung» as a search field: all, each one with time in the range, and
 * the row «ohne …» where there is one.
 */
function NarrowingField({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string
  all: string
  value: Narrowing
  options: readonly NarrowingOption[]
  onChange: (next: Narrowing) => void
}) {
  const choices: Choice[] = [
    { value: '', label: all, quiet: true },
    ...options.map((option) => ({ ...option, quiet: option.value === WITHOUT_VALUE })),
  ]
  return (
    <ChoiceField
      label={label}
      choices={choices}
      value={narrowingValue(value)}
      onChoose={(next) => onChange(narrowingOf(next))}
      placeholder={all}
    />
  )
}

/**
 * The chip of a narrowing that holds: the label of its choice, «ohne …» included; none for «all».
 */
function narrowingChip(
  key: string,
  narrowing: Narrowing,
  options: readonly NarrowingOption[],
  remove: () => void,
): ActiveFilter[] {
  if (narrowing === null) return []
  const value = narrowingValue(narrowing)
  const text = options.find((option) => option.value === value)?.label ?? value
  return [{ key, text, remove }]
}

/**
 * What has time in the range, by one grouping, for the choices of a field. Without a whole
 * range there is nothing to ask.
 */
function useChoices(
  tenantId: number,
  grouping: 'project' | 'customer' | 'service',
  range: TimeEvaluationFilter,
  enabled: boolean,
) {
  return useQuery({
    queryKey: evaluationGroupsKey(tenantId, grouping, range),
    queryFn: () => api.get<TimeGroup[]>(evaluationGroupsUrl(tenantId, grouping, range)),
    enabled: enabled && hasWholeRange(range),
  })
}

/**
 * @param value the field as it stands
 * @param refused what the backend said about it
 * @returns «Einen Tag wählen.» for an empty or half typed day, else the backend's sentence
 */
function dayError(value: string, refused: string | undefined): string | undefined {
  if (!isCompleteIsoDate(value)) return 'Einen Tag wählen.'
  return refused
}
