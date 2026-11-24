import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Panel } from '../../components/Panel'
import { QuickSearchField } from '../../components/QuickSearch'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import type { FieldErrors } from '../../lib/fieldErrors'
import { isCompleteIsoDate } from '../../lib/format'
import {
  RANGE_PRESETS,
  TIME_ENTRY_STATES,
  TIME_SEARCH_MAX_LENGTH,
  evaluationGroupsKey,
  evaluationGroupsUrl,
  hasWholeRange,
  isNarrowed,
  narrowingOf,
  narrowingOptions,
  narrowingValue,
  presetOf,
  presetRange,
  withState,
  withoutNarrowing,
  type Narrowing,
  type TimeEvaluationFilter,
} from '../../lib/timeEvaluation'
import { TIME_ENTRY_STATE_LABELS, colleaguesKey, colleaguesUrl } from '../../lib/timetracking'
import type { TimeColleague, TimeGroup } from '../../lib/types'

/**
 * The filter bar of the evaluation: the range with its presets, people, project, customer,
 * service, state and a search in the text.
 *
 * <p>Every field writes the address at once; nothing waits for a button. The people come from
 * the colleagues of the time tracking, which `TIME_READ` reads. Project, customer and service
 * offer what has time in the range, read from the rows by group — the lookups of the quick line
 * ask for `TIME_TRACK` and know only what still takes new time (frontend ADR-0086).
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
  const range = withoutNarrowing(filter)
  const projects = useChoices(tenantId, 'project', range, projectsOn)
  const customers = useChoices(tenantId, 'customer', range, true)
  const services = useChoices(tenantId, 'service', range, true)

  const people = colleagues.data ?? []
  const chosenPeople = filter.userIds.map((userId) => ({
    userId,
    name: people.find((colleague) => colleague.userId === userId)?.name ?? `Benutzer ${userId}`,
  }))
  const addablePeople = people.filter((colleague) => !filter.userIds.includes(colleague.userId))
  const preset = presetOf(filter, today)

  return (
    <Panel clipped={false}>
      <div className="grid gap-4">
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
                    ? 'border-accent bg-sunken font-medium text-text-primary'
                    : 'border-line bg-surface text-text-secondary hover:border-text-tertiary hover:text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Mitarbeitende"
            value=""
            onChange={(event) => {
              const userId = Number(event.target.value)
              if (userId > 0) onChange({ ...filter, userIds: [...filter.userIds, userId] })
            }}
            disabled={addablePeople.length === 0}
            tooltip={colleagues.isError ? 'Die Liste der Personen konnte nicht geladen werden.' : undefined}
          >
            <option value="">{filter.userIds.length === 0 ? 'Alle' : 'Weitere hinzufügen …'}</option>
            {addablePeople.map((colleague) => (
              <option key={colleague.userId} value={colleague.userId}>
                {colleague.active ? colleague.name : `${colleague.name} (deaktiviert)`}
              </option>
            ))}
          </SelectField>
          {projectsOn && (
            <NarrowingField
              label="Projekt"
              all="Alle Projekte"
              value={filter.project}
              choices={narrowingOptions(projects.data ?? [], 'project', filter.project)}
              onChange={(project) => onChange({ ...filter, project })}
            />
          )}
          <NarrowingField
            label="Kunde"
            all="Alle Kunden"
            value={filter.customer}
            choices={narrowingOptions(customers.data ?? [], 'customer', filter.customer)}
            onChange={(customer) => onChange({ ...filter, customer })}
          />
          <NarrowingField
            label="Leistung"
            all="Alle Leistungen"
            value={filter.service}
            choices={narrowingOptions(services.data ?? [], 'service', filter.service)}
            onChange={(service) => onChange({ ...filter, service })}
          />
        </div>

        {chosenPeople.length > 0 && (
          <ul aria-label="Gewählte Personen" className="flex flex-wrap gap-1.5">
            {chosenPeople.map((person) => (
              <li key={person.userId}>
                <button
                  type="button"
                  aria-label={`${person.name} aus dem Filter nehmen`}
                  onClick={() =>
                    onChange({
                      ...filter,
                      userIds: filter.userIds.filter((userId) => userId !== person.userId),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border border-line bg-sunken px-3 py-1 text-small text-text-primary transition-colors hover:border-text-tertiary"
                >
                  {person.name}
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <fieldset className="pb-1">
            <legend className="mb-1.5 text-small font-medium text-text-secondary">Zustand</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {TIME_ENTRY_STATES.map((state) => (
                <CheckboxField
                  key={state}
                  label={TIME_ENTRY_STATE_LABELS[state]}
                  checked={filter.states.includes(state)}
                  onChange={(event) => onChange(withState(filter, state, event.target.checked))}
                />
              ))}
            </div>
          </fieldset>
          <QuickSearchField
            label="Suche im Text"
            value={filter.search}
            onChange={onSearch}
            placeholder="Was gemacht wurde"
            maxLength={TIME_SEARCH_MAX_LENGTH}
            error={errors.search}
          />
          {isNarrowed(filter) && (
            <Button variant="ghost" onClick={() => onChange(withoutNarrowing(filter))}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}

/**
 * A select «Projekt», «Kunde» or «Leistung»: all, each one with time in the range, and the row
 * «ohne …» where there is one.
 */
function NarrowingField({
  label,
  all,
  value,
  choices,
  onChange,
}: {
  label: string
  all: string
  value: Narrowing
  choices: readonly { value: string; label: string }[]
  onChange: (next: Narrowing) => void
}) {
  return (
    <SelectField
      label={label}
      value={narrowingValue(value)}
      onChange={(event) => onChange(narrowingOf(event.target.value))}
    >
      <option value="">{all}</option>
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </SelectField>
  )
}

/**
 * What has time in the range, by one grouping, for the choices of a select. Without a whole
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
