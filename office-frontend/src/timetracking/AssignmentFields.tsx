import { useQueryClient } from '@tanstack/react-query'
import type { Ref } from 'react'
import { CheckboxField } from '../components/CheckboxField'
import { LookupField, MarkedText } from '../components/LookupField'
import { api } from '../lib/api'
import {
  billableLocked,
  billableTooltip,
  defaultServiceKey,
  effectiveBillable,
  fetchSuggestedService,
  serviceLookupUrl,
  targetKey,
  targetLookupUrl,
  timeLookupsKey,
  withService,
  withServiceTerm,
  withSuggestedService,
  withTarget,
  withTargetTerm,
  type AssignmentForm,
} from '../lib/timetracking'
import type { TimeBillableDefault, TimeServiceChoice, TimeTargetChoice } from '../lib/types'

/**
 * The fields the quick line and the stopwatch share: project or customer, service and
 * «verrechenbar». One search, one suggestion and one rule for the box, wherever time is recorded
 * (frontend ADR-0082, ADR-0083).
 *
 * <p>The fields hold no state of their own. They take the form and hand back an update of it,
 * because the suggested service arrives after the click that asked for it, when the form may
 * have moved on.
 */

/** What every field of the module gets: the form and how to change it. */
type AssignmentFieldProps<F extends AssignmentForm> = {
  tenantId: number
  form: F
  onChange: (update: (current: F) => F) => void
  /** The message for this field, drawn under it. */
  error?: string
}

/**
 * «Projekt oder Kunde»: one search over `/lookups/targets`, empty for internal time. Without the
 * projects it searches customers and is called «Kunde».
 *
 * @param suggestServices asks the server for the service last taken on a picked target. Only for
 *   one's own times: the suggestion is the signed in user's (backend ADR-0160)
 */
export function TargetField<F extends AssignmentForm>({
  tenantId,
  form,
  onChange,
  error,
  projectsOn,
  suggestServices,
  inputRef,
}: AssignmentFieldProps<F> & {
  /** Whether the tenant runs the projects. */
  projectsOn: boolean
  suggestServices: boolean
  /** Lets the caller put the focus here. */
  inputRef?: Ref<HTMLInputElement>
}) {
  const queryClient = useQueryClient()

  const suggest = (target: TimeTargetChoice) => {
    void queryClient
      .fetchQuery({
        queryKey: defaultServiceKey(tenantId, target),
        queryFn: () => fetchSuggestedService(tenantId, target),
      })
      .then((service) => onChange((current) => withSuggestedService(current, target, service)))
      // A suggestion that cannot be read suggests nothing; the field stays as it is.
      .catch(() => undefined)
  }

  return (
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
      renderHit={(target, term) => <TargetHit target={target} term={term} projectsOn={projectsOn} />}
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
      error={error}
      inputRef={inputRef}
    />
  )
}

/** «Leistung»: a product of the type service, from `/lookups/services`. */
export function ServiceField<F extends AssignmentForm>({
  tenantId,
  form,
  onChange,
  error,
}: AssignmentFieldProps<F>) {
  return (
    <ServiceLookup
      tenantId={tenantId}
      term={form.serviceTerm}
      onTerm={(term) => onChange((current) => withServiceTerm(current, term))}
      chosen={form.service !== null}
      onChoose={(service) => onChange((current) => withService(current, service))}
      error={error}
    />
  )
}

/**
 * The search over the active services, on its own: for a form that is not a quick line, such as
 * the default service of a user. The same list and the same rows as «Leistung» in the quick line.
 */
export function ServiceLookup({
  tenantId,
  term,
  onTerm,
  chosen,
  onChoose,
  error,
  label = 'Leistung',
  inputRef,
}: {
  tenantId: number
  /** What stands in the field, held by the caller. */
  term: string
  onTerm: (term: string) => void
  /** True while the field names a service that was taken over. */
  chosen: boolean
  onChoose: (service: TimeServiceChoice) => void
  error?: string
  label?: string
  /** Lets the caller put the focus here. */
  inputRef?: Ref<HTMLInputElement>
}) {
  return (
    <LookupField<TimeServiceChoice>
      label={label}
      term={term}
      onTerm={onTerm}
      chosen={chosen}
      onChoose={onChoose}
      queryKey={[...timeLookupsKey(tenantId), 'services']}
      load={(search) => api.get<TimeServiceChoice[]>(serviceLookupUrl(tenantId, search))}
      keyOf={(service) => service.productId}
      renderHit={(service, search) => <ServiceHit service={service} term={search} />}
      listLabel="Leistungen"
      emptyText="Es gibt noch keine aktive Leistung. Eine Leistung ist ein Produkt vom Typ Leistung."
      failureText="Die Leistungen konnten nicht gelesen werden."
      error={error}
      inputRef={inputRef}
    />
  )
}

/**
 * «verrechenbar»: its default and its lock come from the server (`lookups/default-billable`).
 * On a project the billing mode decides; on «Nicht verrechenbar» and for internal time the box
 * cannot be switched on, and its tooltip says why (backend ADR-0162).
 *
 * @param rule the default of the server for the target, `undefined` while unknown: the box then
 *   shows yes for a target and stays open, and the server applies its own default anyway
 * @param projectsOn whether the tenant runs the projects, for the words of the tooltip
 */
export function BillableField<F extends AssignmentForm>({
  form,
  onChange,
  rule,
  projectsOn,
}: Pick<AssignmentFieldProps<F>, 'form' | 'onChange'> & {
  rule: TimeBillableDefault | undefined
  projectsOn: boolean
}) {
  return (
    <CheckboxField
      label="verrechenbar"
      checked={effectiveBillable(form, rule)}
      disabled={billableLocked(form, rule)}
      onChange={(event) => {
        const billable = event.target.checked
        onChange((current) => ({ ...current, billable }))
      }}
      tooltip={billableTooltip(form, rule, projectsOn)}
    />
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
