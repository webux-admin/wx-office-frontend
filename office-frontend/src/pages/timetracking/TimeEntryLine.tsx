import { useQueryClient } from '@tanstack/react-query'
import type { KeyboardEvent, Ref } from 'react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { LookupField, MarkedText } from '../../components/LookupField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatDuration, readDuration } from '../../lib/duration'
import {
  TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
  defaultServiceKey,
  defaultServiceUrl,
  effectiveBillable,
  serviceLookupUrl,
  targetKey,
  targetLookupUrl,
  timeLookupsKey,
  withService,
  withServiceTerm,
  withSuggestedService,
  withTarget,
  withTargetTerm,
  type TimeEntryForm,
  type TimeEntryLineField,
} from '../../lib/timetracking'
import type { TimeServiceChoice, TimeTargetChoice } from '../../lib/types'

/**
 * The quick line: project or customer, service, duration, text and «verrechenbar» in one row,
 * in that order, and on a phone the same fields one under the other.
 *
 * <p>Enter saves from every field, except while a list is open on a marked hit — then Enter
 * takes the hit. The same form records a new entry at the top of the screen and changes a
 * stored one in its row of the list (frontend ADR-0082).
 *
 * <p>The line holds no state of its own: what stands in it belongs to the screen, which knows
 * whether an Escape throws something away.
 *
 * @param onChange receives an update of the line rather than the line, because the suggested
 *   service arrives after the click that asked for it, when the line may have moved on
 */
export function TimeEntryLine({
  tenantId,
  form,
  onChange,
  projectsOn,
  errors,
  busy,
  suggestServices,
  onSubmit,
  onCancel,
  label,
  durationRef,
  formRef,
}: {
  tenantId: number
  form: TimeEntryForm
  onChange: (update: (current: TimeEntryForm) => TimeEntryForm) => void
  /** Whether the tenant runs the projects; without them the first field searches customers. */
  projectsOn: boolean
  /** The message for each field, already drawn from the line's own checks and the backend. */
  errors: Partial<Record<TimeEntryLineField, string>>
  /** True while the line is being saved; a second Enter then does nothing. */
  busy: boolean
  /**
   * Asks the server for the service last taken on a picked target. Only for one's own times:
   * the suggestion is the signed in user's (backend ADR-0160).
   */
  suggestServices: boolean
  onSubmit: () => void
  /** Present for a stored entry; it adds «Abbrechen». */
  onCancel?: () => void
  /** What the form is announced as, for example «Neuer Eintrag». */
  label: string
  /** Lets the screen put the focus on the duration, where the next entry starts. */
  durationRef?: Ref<HTMLInputElement>
  /** Lets the screen tell which line holds the focus. */
  formRef?: Ref<HTMLFormElement>
}) {
  const queryClient = useQueryClient()
  const reading = readDuration(form.duration)
  const durationHint =
    reading.state === 'read'
      ? `= ${formatDuration(reading.duration.minutes)}`
      : reading.state === 'refused'
        ? reading.message
        : undefined

  const suggest = (target: TimeTargetChoice) => {
    void queryClient
      .fetchQuery({
        queryKey: defaultServiceKey(tenantId, target),
        // 204 means «nothing to suggest»; a query may not hold undefined.
        queryFn: async () =>
          (await api.get<TimeServiceChoice | undefined>(defaultServiceUrl(tenantId, target))) ??
          null,
      })
      .then((service) => onChange((current) => withSuggestedService(current, target, service)))
      // A suggestion that cannot be read suggests nothing; the field stays as it is.
      .catch(() => undefined)
  }

  // Enter on a field saves. On a button it stays the button's: «Abbrechen» must not save.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    if (event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return
    event.preventDefault()
    if (!busy) onSubmit()
  }

  return (
    <form
      ref={formRef}
      aria-label={label}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSubmit()
      }}
      onKeyDown={onKeyDown}
      className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem_minmax(0,2fr)_auto_auto] lg:items-start lg:gap-3"
    >
      <LookupField<TimeTargetChoice>
        label={projectsOn ? 'Projekt oder Kunde' : 'Kunde'}
        term={form.targetTerm}
        onTerm={(term) => onChange((current) => withTargetTerm(current, term))}
        chosen={form.target !== null}
        onChoose={(target) => {
          onChange((current) => withTarget(current, target, projectsOn))
          if (suggestServices) suggest(target)
        }}
        queryKey={[...timeLookupsKey(tenantId), 'targets']}
        load={(term) => api.get<TimeTargetChoice[]>(targetLookupUrl(tenantId, term))}
        keyOf={targetKey}
        renderHit={(target, term) => (
          <TargetHit target={target} term={term} projectsOn={projectsOn} />
        )}
        listLabel={projectsOn ? 'Projekte und Kunden' : 'Kunden'}
        emptyText={
          projectsOn
            ? 'Es gibt kein offenes oder aktives Projekt und keinen aktiven Kunden.'
            : 'Es gibt noch keinen aktiven Kunden.'
        }
        failureText={
          projectsOn
            ? 'Projekte und Kunden konnten nicht gelesen werden.'
            : 'Die Kunden konnten nicht gelesen werden.'
        }
        placeholder="intern"
        tooltip={
          projectsOn
            ? 'Leer lassen für interne Zeit. Mit Projekt gilt der Kunde des Projekts.'
            : 'Leer lassen für interne Zeit.'
        }
        error={errors.target}
      />

      <LookupField<TimeServiceChoice>
        label="Leistung"
        term={form.serviceTerm}
        onTerm={(term) => onChange((current) => withServiceTerm(current, term))}
        chosen={form.service !== null}
        onChoose={(service) => onChange((current) => withService(current, service))}
        queryKey={[...timeLookupsKey(tenantId), 'services']}
        load={(term) => api.get<TimeServiceChoice[]>(serviceLookupUrl(tenantId, term))}
        keyOf={(service) => service.productId}
        renderHit={(service, term) => <ServiceHit service={service} term={term} />}
        listLabel="Leistungen"
        emptyText="Es gibt noch keine aktive Leistung. Eine Leistung ist ein Produkt vom Typ Leistung."
        failureText="Die Leistungen konnten nicht gelesen werden."
        error={errors.service}
      />

      <TextField
        ref={durationRef}
        label="Dauer"
        value={form.duration}
        onChange={(event) => {
          const duration = event.target.value
          onChange((current) => ({ ...current, duration }))
        }}
        placeholder="1:30"
        autoComplete="off"
        required
        hint={durationHint}
        error={errors.duration}
        tooltip="1:30, 1.5, 90m, 2h 15m oder 9-10:30. Eine Zahl ohne Einheit sind Stunden."
      />

      <TextField
        label="Text"
        value={form.description}
        onChange={(event) => {
          const description = event.target.value
          onChange((current) => ({ ...current, description }))
        }}
        placeholder="Was wurde gemacht?"
        maxLength={TIME_ENTRY_DESCRIPTION_MAX_LENGTH}
        autoComplete="off"
        error={errors.description}
      />

      {/* The two cells without a label start where the inputs do. */}
      <div className="flex h-control items-center lg:mt-6">
        <CheckboxField
          label="verrechenbar"
          checked={effectiveBillable(form)}
          disabled={form.target === null}
          onChange={(event) => {
            const billable = event.target.checked
            onChange((current) => ({ ...current, billable }))
          }}
          tooltip="Mit Kunde ist eine Zeit verrechenbar, ohne Kunde nie. Verrechenbar braucht eine Leistung."
        />
      </div>

      <div className="flex items-center gap-2 lg:mt-6">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
        <Button type="submit" busy={busy} shortcut>
          Speichern
        </Button>
      </div>
    </form>
  )
}

/** A project with its customer, or a customer on its own, as one row of the list. */
function TargetHit({
  target,
  term,
  projectsOn,
}: {
  target: TimeTargetChoice
  term: string
  projectsOn: boolean
}) {
  const number = target.kind === 'PROJECT' ? target.projectNumber : target.partnerNumber
  const customer = target.customerName ?? ''
  const text =
    target.kind === 'PROJECT'
      ? [target.projectName, customer].filter(Boolean).join(' · ')
      : projectsOn
        ? `${customer} (ohne Projekt)`
        : customer
  return (
    <>
      <span className="w-[5.375rem] shrink-0 truncate font-mono text-small text-text-tertiary">
        <MarkedText text={number ?? '–'} term={term} />
      </span>
      <span className="truncate text-body text-text-primary">
        <MarkedText text={text} term={term} />
      </span>
    </>
  )
}

function ServiceHit({ service, term }: { service: TimeServiceChoice; term: string }) {
  return (
    <>
      <span className="w-[5.375rem] shrink-0 truncate font-mono text-small text-text-tertiary">
        <MarkedText text={service.productNumber ?? '–'} term={term} />
      </span>
      <span className="truncate text-body text-text-primary">
        <MarkedText text={service.name} term={term} />
      </span>
    </>
  )
}
