import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, ReceiptText } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { LinkButton } from '../../components/LinkButton'
import { EmptyState, ErrorNotice, LoadingBlock, WarningNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SegmentedControl } from '../../components/SegmentedControl'
import { TextField } from '../../components/TextField'
import { useFieldErrors } from '../../components/useFieldErrors'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { isToldByFields } from '../../lib/fieldErrors'
import { formatDateTime } from '../../lib/format'
import { originState } from '../../lib/origin'
import { PROJECT_PATH, isProjectEditable } from '../../lib/project'
import { billingHandoverState, timeBillingPathOf } from '../../lib/timeBilling'
import {
  BILLING_MODES,
  BILLING_MODE_HINTS,
  BILLING_MODE_LABELS,
  TIMETRACKING_PATH,
  TIMETRACKING_RIGHTS,
  hourlyRateText,
  openEntriesStayText,
  projectTargetOf,
  projectTermsChanged,
  projectTermsComplaints,
  projectTermsKey,
  projectTermsUrl,
  recordOnState,
  takesNewTime,
  termsSavedText,
  timeTermsKey,
  toProjectTermsForm,
  toProjectTermsRequest,
  type ProjectTermsForm,
  type TimesOf,
} from '../../lib/timetracking'
import type { Project, ProjectTerms, ProjectTermsRequest } from '../../lib/types'
import { TimeEntryTable } from '../../timetracking/TimeEntryTable'
import { TimeSummaryFacts } from '../../timetracking/TimeSummaryFacts'

/**
 * The register «Zeiten» of a project: its hours by state, how it is billed, and its entries.
 *
 * <p>Shown only with the module switched on and `TIME_READ`, which the mask decides. Abrechnung
 * and Projektsatz belong to the time tracking, not to the project (backend ADR-0162): they are
 * changed in a dialog of their own and saved on their own, without closing the mask.
 *
 * <p>«Zeit erfassen» opens «Meine Zeiten» with the project in the quick line — with `TIME_TRACK`,
 * and only while the project takes new time. «Abrechnen» opens the billing of the project with
 * `TIME_BILL`, in every status: a completed project is still billed (backend ADR-0163, frontend
 * ADR-0085).
 */
export function ProjectTimes({ tenantId, project }: { tenantId: number; project: Project }) {
  const { can } = useAuth()
  const of: TimesOf = { kind: 'PROJECT', projectId: project.id }
  const mayRecord = can(TIMETRACKING_RIGHTS.track) && takesNewTime(project.status)
  const mayBill = can(TIMETRACKING_RIGHTS.bill)
  // The billing mask and an invoice opened from a badge lead back to this project.
  const back = originState(
    `${PROJECT_PATH}/${project.id}`,
    `${project.projectNumber} ${project.name}`,
  )
  const record = (label: string) => (
    <LinkButton
      to={TIMETRACKING_PATH}
      state={recordOnState(projectTargetOf(project))}
      variant="secondary"
    >
      <Plus size={15} aria-hidden />
      {label}
    </LinkButton>
  )

  return (
    <div className="grid gap-6">
      <TimeSummaryFacts tenantId={tenantId} of={of} />
      <ProjectTermsPanel tenantId={tenantId} project={project} />
      <Panel
        title="Einträge"
        description="Die Zeiten aller Personen auf diesem Projekt, der späteste Tag zuerst."
        padded={false}
        action={
          mayRecord || mayBill ? (
            <span className="flex flex-wrap justify-end gap-2">
              {mayBill && (
                <LinkButton
                  to={timeBillingPathOf(of)}
                  state={billingHandoverState({}, back.origin)}
                  variant="secondary"
                >
                  <ReceiptText size={15} aria-hidden />
                  Abrechnen
                </LinkButton>
              )}
              {mayRecord && record('Zeit erfassen')}
            </span>
          ) : undefined
        }
      >
        <TimeEntryTable
          tenantId={tenantId}
          of={of}
          origin={back}
          showsProject={false}
          empty={
            <EmptyState
              title="Noch keine Zeiten"
              description="Auf diesem Projekt ist noch keine Zeit erfasst."
            >
              {mayRecord && record('Erste Zeit erfassen')}
            </EmptyState>
          }
        />
      </Panel>
    </div>
  )
}

/**
 * How the project is billed: the mode and the project rate, read with `TIME_READ`, changed with
 * `TIME_WRITE` while the project is not archived — the backend refuses it then with 409, like
 * the project itself.
 */
function ProjectTermsPanel({ tenantId, project }: { tenantId: number; project: Project }) {
  const { can } = useAuth()
  const terms = useQuery({
    queryKey: projectTermsKey(tenantId, project.id),
    queryFn: () => api.get<ProjectTerms>(projectTermsUrl(tenantId, project.id)),
  })
  const [editing, setEditing] = useState(false)
  // Counts the openings, so each one starts from the terms as they stand; closing keeps the
  // dialog mounted for its fade.
  const [openings, setOpenings] = useState(0)
  // What the last save did, in one line under the terms.
  const [status, setStatus] = useState<string | null>(null)
  const archived = !isProjectEditable(project.status)
  const mayChange = can(TIMETRACKING_RIGHTS.write) && !archived

  return (
    <Panel
      title="Abrechnung"
      action={
        mayChange && terms.data !== undefined ? (
          <Button
            variant="secondary"
            onClick={() => {
              setStatus(null)
              setOpenings((count) => count + 1)
              setEditing(true)
            }}
          >
            Ändern
          </Button>
        ) : undefined
      }
    >
      {terms.isPending ? (
        <LoadingBlock label="Abrechnung wird geladen" />
      ) : terms.isError ? (
        <ErrorNotice error={terms.error} />
      ) : (
        <div className="grid gap-3">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-overline text-text-tertiary">Abrechnungsart</dt>
              <dd className="mt-0.5 text-body text-text-primary">
                {BILLING_MODE_LABELS[terms.data.billingMode]}
              </dd>
              <dd className="mt-0.5 text-small text-text-secondary">
                {BILLING_MODE_HINTS[terms.data.billingMode]}
              </dd>
            </div>
            <div>
              <dt className="text-overline text-text-tertiary">Projektsatz</dt>
              <dd className="mt-0.5 font-mono text-body tabular-nums text-text-primary">
                {hourlyRateText(terms.data)}
              </dd>
              <dd className="mt-0.5 text-small text-text-secondary">
                {terms.data.hourlyRate == null
                  ? 'Ohne Projektsatz gilt der Preis jeder Leistung für diesen Kunden.'
                  : 'Gilt für alle Leistungen des Projekts.'}
              </dd>
            </div>
          </dl>
          {archived && can(TIMETRACKING_RIGHTS.write) && (
            <p className="text-small text-text-secondary">
              Das Projekt ist archiviert; seine Abrechnung lässt sich nur lesen.
            </p>
          )}
          {terms.data.changedAt && (
            <p className="text-small text-text-tertiary">
              Geändert {formatDateTime(terms.data.changedAt)}
              {terms.data.changedBy ? ` von ${terms.data.changedBy}` : ''}
            </p>
          )}
          <p role="status" aria-live="polite" className="text-small text-text-secondary">
            {status !== null && (
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-accent-text" aria-hidden />
                {status}
              </span>
            )}
          </p>
        </div>
      )}

      {terms.data !== undefined && (
        <ProjectTermsDialog
          key={openings}
          tenantId={tenantId}
          project={project}
          terms={terms.data}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(before, saved) => {
            setStatus(termsSavedText(before, saved))
            setEditing(false)
          }}
        />
      )}
    </Panel>
  )
}

/**
 * The dialog «Abrechnung ändern»: the mode as a choice of three, and the rate per hour.
 *
 * <p>Changing the mode leaves the entries already recorded as they are; the dialog says how
 * many open billable ones that concerns before it is saved, and the panel says it again from
 * the answer (backend ADR-0162).
 */
function ProjectTermsDialog({
  tenantId,
  project,
  terms,
  open,
  onClose,
  onSaved,
}: {
  tenantId: number
  project: Project
  terms: ProjectTerms
  open: boolean
  onClose: () => void
  /** Receives the terms the change was made to and the terms as stored. */
  onSaved: (before: ProjectTerms, saved: ProjectTerms) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ProjectTermsForm>(() => toProjectTermsForm(terms))

  // Terms read anew while the dialog is open — after a refusal because somebody else changed
  // them — fill it anew: the backend asks to reload and repeat, so the dialog shows what stands.
  const basis = terms.lockVersion ?? null
  const [shownBasis, setShownBasis] = useState(basis)
  if (basis !== shownBasis) {
    setShownBasis(basis)
    setForm(toProjectTermsForm(terms))
  }

  const save = useMutation({
    mutationFn: ({ body }: { before: ProjectTerms; body: ProjectTermsRequest }) =>
      api.put<ProjectTerms>(projectTermsUrl(tenantId, project.id), body),
    onSuccess: (saved, { before }) => {
      queryClient.setQueryData(projectTermsKey(tenantId, project.id), saved)
      // The default of «verrechenbar» follows the mode, in the quick line and the stopwatch.
      void queryClient.invalidateQueries({ queryKey: timeTermsKey(tenantId) })
      onSaved(before, saved)
    },
    // 409: changed elsewhere meanwhile, or archived. The terms as they stand now are read anew.
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: projectTermsKey(tenantId, project.id) }),
  })

  const checks = useFieldErrors(() => projectTermsComplaints(form), save.error)
  const changed = projectTermsChanged(form, terms)
  const modeChanged = form.billingMode !== terms.billingMode

  const submit = () => {
    if (save.isPending) return
    save.reset()
    if (!changed) {
      onClose()
      return
    }
    if (checks.check()) save.mutate({ before: terms, body: toProjectTermsRequest(form, terms) })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Abrechnung ändern"
      description={`${project.projectNumber} ${project.name}`}
      dirty={changed}
      onSubmit={submit}
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {save.error !== null && !isToldByFields(save.error, ['hourlyRate']) && (
          <ErrorNotice error={save.error} />
        )}
        <div>
          <SegmentedControl
            label="Abrechnungsart"
            options={BILLING_MODES.map((mode) => ({ value: mode, label: BILLING_MODE_LABELS[mode] }))}
            value={form.billingMode}
            onChange={(billingMode) => setForm((current) => ({ ...current, billingMode }))}
          />
          <p className="mt-1.5 text-small text-text-secondary">
            {BILLING_MODE_HINTS[form.billingMode]}
          </p>
        </div>
        {modeChanged && terms.openEntries > 0 && (
          <WarningNotice>
            Die Abrechnungsart gilt für neue Zeit: {openEntriesStayText(terms.openEntries)}
          </WarningNotice>
        )}
        <TextField
          label="Projektsatz pro Stunde"
          value={form.hourlyRate}
          onChange={(event) => {
            const hourlyRate = event.target.value
            setForm((current) => ({ ...current, hourlyRate }))
          }}
          inputMode="decimal"
          numeric
          placeholder="Preis der Leistung"
          action={
            terms.currency ? (
              <span className="pr-3 text-small text-text-tertiary">{terms.currency}</span>
            ) : undefined
          }
          error={checks.errors.hourlyRate}
          tooltip="Gilt für alle Leistungen des Projekts, in der Währung des Mandanten. Leer heisst: der Preis der Leistung für diesen Kunden gilt. 0.00 ist ein Satz."
        />
      </div>
    </Dialog>
  )
}
