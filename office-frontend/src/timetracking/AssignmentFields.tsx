import { useQueryClient } from '@tanstack/react-query'
import type { Ref } from 'react'
import { CheckboxField } from '../components/CheckboxField'
import { LookupField, MarkedText } from '../components/LookupField'
import { api } from '../lib/api'
import {
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
  type AssignmentForm,
} from '../lib/timetracking'
import type { TimeServiceChoice, TimeTargetChoice } from '../lib/types'

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
        // 204 means «nothing to suggest»; a query may not hold undefined.
        queryFn: async () =>
          (await api.get<TimeServiceChoice | undefined>(defaultServiceUrl(tenantId, target))) ??
          null,
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
      error={error}
    />
  )
}

/** «verrechenbar»: on with a customer, off and locked without one. */
export function BillableField<F extends AssignmentForm>({
  form,
  onChange,
}: Pick<AssignmentFieldProps<F>, 'form' | 'onChange'>) {
  return (
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
