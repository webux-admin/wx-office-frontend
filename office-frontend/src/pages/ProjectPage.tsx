import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useDebouncedValue } from '../components/useDebouncedValue'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { originOf } from '../lib/origin'
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_MODULE,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_PATH,
  PROJECT_RIGHTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  PROJECT_STEP_LABELS,
  emptyProjectForm,
  isProjectDeletable,
  isProjectEditable,
  projectComplaint,
  projectContactsUrl,
  projectCustomerUrl,
  projectCustomersUrl,
  projectResponsiblesUrl,
  projectStepUrl,
  projectStepsFrom,
  projectUrl,
  projectsKey,
  projectsUrl,
  toProjectForm,
  toProjectRequest,
  type ProjectForm,
  type ProjectStep,
} from '../lib/project'
import type { Project, ProjectContact, ProjectCustomer, ProjectResponsible } from '../lib/types'

/** One project, new or stored: its customer, the people on it, its period. */
export function ProjectPage() {
  return (
    <RequireTenant permission={PROJECT_RIGHTS.read} module={PROJECT_MODULE}>
      {(tenantId) => <ProjectLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ProjectLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()
  const creating = id === 'neu'

  const project = useQuery({
    queryKey: [...projectsKey(tenantId), 'one', id],
    queryFn: () => api.get<Project>(projectUrl(tenantId, id ?? '')),
    enabled: !creating && id !== undefined,
  })

  if (creating) return <ProjectMask tenantId={tenantId} project={null} />
  if (project.isPending) return <LoadingBlock label="Projekt wird geladen" />
  if (project.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={project.error} />
      </div>
    )
  }
  // Keyed by the record, so opening another project resets the mask instead of carrying
  // values over.
  return <ProjectMask key={project.data.id} tenantId={tenantId} project={project.data} />
}

function ProjectMask({ tenantId, project }: { tenantId: number; project: Project | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, { from: PROJECT_PATH, label: 'Projekte' })

  const [form, setForm] = useState<ProjectForm>(project ? toProjectForm(project) : emptyProjectForm())
  const [complaint, setComplaint] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const mayWrite = can(PROJECT_RIGHTS.write)
  // An archived project is read only, also for whoever may write: it is taken out of the
  // archive first, and the backend refuses a change before that with 409.
  const editable = mayWrite && (project === null || isProjectEditable(project.status))
  const set = <K extends keyof ProjectForm>(field: K, value: ProjectForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = toProjectRequest(form)
      return project
        ? api.put<Project>(projectUrl(tenantId, project.id), body)
        : api.post<Project>(projectsUrl(tenantId), body)
    },
    // Saving finishes the mask and gives way to the list it came from. Replaced instead of
    // pushed: a saved mask is not a place to return to with the back button.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKey(tenantId) })
      void navigate(origin.from, { replace: true })
    },
  })

  // A step changes the status and nothing else: the mask stays open on the same project, and
  // what was typed but not saved stays in the fields.
  const step = useMutation({
    mutationFn: (next: ProjectStep) =>
      api.post<Project>(projectStepUrl(tenantId, project?.id ?? 0, next), {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKey(tenantId) })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete<void>(projectUrl(tenantId, project?.id ?? 0)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKey(tenantId) })
      void navigate(origin.from, { replace: true })
    },
  })

  const submit = () => {
    const problem = projectComplaint(form)
    setComplaint(problem)
    if (!problem) save.mutate()
  }

  useSubmitShortcut(editable && !save.isPending ? submit : undefined)

  const failure = save.error ?? step.error ?? (complaint === null ? null : new Error(complaint))

  return (
    <>
      <PageHeader
        title={project ? project.name : 'Neues Projekt'}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          project ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px]">{project.projectNumber}</span>
              <Badge tone={PROJECT_STATUS_TONES[project.status]}>
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
            </span>
          ) : (
            'Die Projektnummer wird beim Speichern vergeben.'
          )
        }
      >
        {project && mayWrite && isProjectDeletable(project.status) && (
          <Button variant="secondary" onClick={() => setDeleting(true)}>
            Löschen
          </Button>
        )}
        {project &&
          mayWrite &&
          projectStepsFrom(project.status).map((next) => (
            <Button
              key={next}
              variant="secondary"
              onClick={() => step.mutate(next)}
              busy={step.isPending && step.variables === next}
              disabled={step.isPending}
            >
              {PROJECT_STEP_LABELS[next]}
            </Button>
          ))}
        {editable && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {failure !== null && (
          <div className="mb-6" aria-live="polite">
            <ErrorNotice error={failure} />
          </div>
        )}

        {project && !isProjectEditable(project.status) && (
          <p className="mb-6 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-4 py-3 text-[13px] text-text-secondary">
            Dieses Projekt ist archiviert und lässt sich nur noch lesen.
            {mayWrite ? ' Zum Bearbeiten zuerst aus dem Archiv holen.' : ''}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Projekt">
            <div className="grid gap-4">
              <TextField
                label="Name"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                maxLength={PROJECT_NAME_MAX_LENGTH}
                disabled={!editable}
                required
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => set('startDate', event.target.value)}
                  disabled={!editable}
                />
                <TextField
                  label="Ende"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => set('endDate', event.target.value)}
                  disabled={!editable}
                  hint="Leer lassen, solange das Ende offen ist."
                />
              </div>
              <TextAreaField
                label="Beschreibung"
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                rows={5}
                disabled={!editable}
              />
            </div>
          </Panel>

          <Panel title="Beteiligte">
            <div className="grid gap-4">
              <CustomerChoice
                tenantId={tenantId}
                partnerId={form.partnerId}
                knownName={project?.customerName ?? null}
                disabled={!editable}
                // Another customer has other people: a contact chosen for the last one would
                // be refused by the backend, so it goes with the customer.
                onChange={(partnerId) =>
                  setForm((current) => ({ ...current, partnerId, contactPersonId: '' }))
                }
              />
              <ContactChoice
                tenantId={tenantId}
                partnerId={form.partnerId}
                contactPersonId={form.contactPersonId}
                disabled={!editable}
                onChange={(contactPersonId) => set('contactPersonId', contactPersonId)}
              />
              <ResponsibleChoice
                tenantId={tenantId}
                responsibleUserId={form.responsibleUserId}
                storedUserId={project?.responsibleUserId ?? null}
                disabled={!editable}
                onChange={(responsibleUserId) => set('responsibleUserId', responsibleUserId)}
              />
            </div>
          </Panel>
        </div>

        {project && (
          <p className="mt-6 text-[12px] text-text-tertiary">
            Angelegt {formatDateTime(project.createdAt)}
            {project.createdBy ? ` von ${project.createdBy}` : ''}
            {project.changedAt ? ` · geändert ${formatDateTime(project.changedAt)}` : ''}
            {project.changedBy ? ` von ${project.changedBy}` : ''}
          </p>
        )}
      </div>

      {project && (
        <Dialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title={`${project.projectNumber} löschen?`}
          description="Das Projekt verschwindet ganz. Seine Nummer wird nicht wieder vergeben."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleting(false)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={() => remove.mutate()} busy={remove.isPending}>
                Löschen
              </Button>
            </>
          }
        >
          {remove.error !== null && <ErrorNotice error={remove.error} />}
        </Dialog>
      )}
    </>
  )
}

/**
 * The customer of the project: a search, and the customers it finds.
 *
 * <p>A search in front of the list rather than one long list: a tenant with a few thousand
 * customers would otherwise scroll. The chosen customer always stays among the options, also
 * when the current search does not find it — or when it was deactivated since.
 */
function CustomerChoice({
  tenantId,
  partnerId,
  knownName,
  disabled,
  onChange,
}: {
  tenantId: number
  partnerId: string
  knownName: string | null
  disabled: boolean
  onChange: (partnerId: string) => void
}) {
  const [search, setSearch] = useState('')
  const term = useDebouncedValue(search.trim())

  const found = useQuery({
    queryKey: [...projectsKey(tenantId), 'customers', term],
    queryFn: () => api.get<ProjectCustomer[]>(projectCustomersUrl(tenantId, term)),
    enabled: !disabled,
  })
  const chosenId = partnerId === '' ? null : Number(partnerId)
  const listed = found.data ?? []
  const chosenListed = chosenId !== null && listed.some((entry) => entry.partnerId === chosenId)
  const chosen = useQuery({
    queryKey: [...projectsKey(tenantId), 'customer', chosenId],
    queryFn: () => api.get<ProjectCustomer>(projectCustomerUrl(tenantId, chosenId ?? 0)),
    enabled: chosenId !== null && !chosenListed && knownName === null,
  })

  const options: ProjectCustomer[] = [...listed]
  if (chosenId !== null && !chosenListed) {
    options.unshift(chosen.data ?? { partnerId: chosenId, name: knownName ?? `Kunde ${chosenId}` })
  }

  return (
    <div className="grid gap-2">
      {!disabled && (
        <TextField
          label="Kunde suchen"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name oder Nummer"
          maxLength={70}
        />
      )}
      <SelectField
        label="Kunde"
        value={partnerId}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required
        hint={
          found.isSuccess && listed.length === 0
            ? term === ''
              ? 'Es gibt noch keinen aktiven Kunden.'
              : `Kein aktiver Kunde passt zu «${term}».`
            : undefined
        }
      >
        <option value="">Bitte wählen</option>
        {options.map((customer) => (
          <option key={customer.partnerId} value={customer.partnerId}>
            {customer.partnerNumber ? `${customer.partnerNumber} · ` : ''}
            {customer.name}
          </option>
        ))}
      </SelectField>
      {found.error !== null && <ErrorNotice error={found.error} />}
    </div>
  )
}

/** Whom to talk to at the customer; the people of the chosen customer only. */
function ContactChoice({
  tenantId,
  partnerId,
  contactPersonId,
  disabled,
  onChange,
}: {
  tenantId: number
  partnerId: string
  contactPersonId: string
  disabled: boolean
  onChange: (contactPersonId: string) => void
}) {
  const chosenId = partnerId === '' ? null : Number(partnerId)
  const contacts = useQuery({
    queryKey: [...projectsKey(tenantId), 'contacts', chosenId],
    queryFn: () => api.get<ProjectContact[]>(projectContactsUrl(tenantId, chosenId ?? 0)),
    enabled: chosenId !== null,
  })
  const people = contacts.data ?? []

  return (
    <SelectField
      label="Kontaktperson"
      value={contactPersonId}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || chosenId === null}
      hint={
        chosenId === null
          ? 'Zuerst einen Kunden wählen.'
          : contacts.isSuccess && people.length === 0
            ? 'Bei diesem Kunden ist keine Kontaktperson erfasst.'
            : undefined
      }
    >
      <option value="">Keine</option>
      {people.map((person) => (
        <option key={person.contactId} value={person.contactId}>
          {person.name}
        </option>
      ))}
    </SelectField>
  )
}

/**
 * Who runs the project here.
 *
 * <p>Deactivated users are not offered — except the one the project already names, who
 * stays chosen until somebody picks another.
 */
function ResponsibleChoice({
  tenantId,
  responsibleUserId,
  storedUserId,
  disabled,
  onChange,
}: {
  tenantId: number
  responsibleUserId: string
  storedUserId: number | null
  disabled: boolean
  onChange: (responsibleUserId: string) => void
}) {
  const users = useQuery({
    queryKey: [...projectsKey(tenantId), 'responsibles'],
    queryFn: () => api.get<ProjectResponsible[]>(projectResponsiblesUrl(tenantId)),
  })
  const offered = (users.data ?? []).filter(
    (user) => user.active || user.userId === storedUserId,
  )

  return (
    <SelectField
      label="Verantwortlich"
      value={responsibleUserId}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">Noch niemand</option>
      {offered.map((user) => (
        <option key={user.userId} value={user.userId}>
          {user.name}
          {user.active ? '' : ' (deaktiviert)'}
        </option>
      ))}
    </SelectField>
  )
}
