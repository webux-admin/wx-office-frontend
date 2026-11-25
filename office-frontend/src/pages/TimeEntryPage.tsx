import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DiscardQuestion } from '../components/Dialog'
import { IconButton } from '../components/IconButton'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { useFieldErrors } from '../components/useFieldErrors'
import { useLeaveGuard } from '../components/useLeaveGuard'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDuration, formatDurationShort, readDuration } from '../lib/duration'
import { toIsoDate } from '../lib/format'
import { useRunsModule } from '../lib/modules'
import { originState } from '../lib/origin'
import { PROJECT_MODULE } from '../lib/project'
import {
  TIMETRACKING_MODULE,
  TIMETRACKING_PATH,
  TIMETRACKING_RIGHTS,
  colleaguesKey,
  colleaguesUrl,
  continueEntryUrl,
  dayTotalText,
  defaultServiceKey,
  emptyTimeEntryForm,
  entryTargetText,
  fetchSuggestedService,
  formChanged,
  hasLaterWeek,
  hasLineInput,
  isToldByLine,
  lineErrors,
  nextEntryForm,
  recentTargetsKey,
  recentTargetsUrl,
  recordOnTargetOf,
  startedText,
  timeEntriesKey,
  timeEntryComplaints,
  timeEntryCopyUrl,
  timeEntryUrl,
  timeEntryWriteUrl,
  timeSheetKey,
  timeSheetUrl,
  timerKey,
  toTimeEntryForm,
  toTimeEntryRequest,
  weekStep,
  withRecentTarget,
  withSuggestedService,
  withTarget,
  type SheetOwner,
  type TimeEntryForm,
} from '../lib/timetracking'
import type {
  TimeColleague,
  TimeEntry,
  TimeEntryRequest,
  TimeRecentTarget,
  TimeSheet,
  TimerStart,
} from '../lib/types'
import { addDays, dayTitle, mondayOf, weekDays, weekLabel } from '../lib/week'
import { RecentChips } from '../timetracking/RecentChips'
import { useBillableDefault } from '../timetracking/useBillableDefault'
import { useReleaseFromDraft } from '../timetracking/useReleaseFromDraft'
import { DayEntries } from './timetracking/DayEntries'
import { TimeEntryLine } from './timetracking/TimeEntryLine'
import { WeekBar } from './timetracking/WeekBar'

/** Where an invoice opened from a badge leads back to. */
const INVOICE_ORIGIN = originState(TIMETRACKING_PATH, 'Meine Zeiten')

/**
 * «Meine Zeiten»: a week bar, the quick line, and the entries of the chosen day.
 *
 * <p>Recording costs no more than a note on paper: project or customer, service, duration, text
 * and Enter. Project and service stay for the next entry, and the focus goes back to the
 * duration (#124, backend ADR-0160, frontend ADR-0082). «Fortsetzen» at an own entry starts the
 * stopwatch on the same work (#125, backend ADR-0161, frontend ADR-0083).
 *
 * <p>With `TIME_READ` the same screen shows the week of a colleague, and with `TIME_WRITE` the
 * line records for them. Their times are personal data about how somebody works (OR Art. 328b),
 * which is why the choice appears only with the right — the backend refuses it anyway.
 *
 * <p>«Zeit erfassen» on a project opens this screen with the project in the quick line, its
 * suggested service beside it and the focus on «Dauer». The default and the lock of
 * «verrechenbar» come from the server for every target (#126, backend ADR-0162, frontend
 * ADR-0084).
 *
 * <p>A billed entry can only be read: its badge leads to the draft or the invoice with
 * `INVOICE_READ`, and one on a draft offers «Vom Entwurf lösen» with `TIME_BILL` (#127, backend
 * ADR-0163, frontend ADR-0085).
 */
export function TimeEntryPage() {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.track} module={TIMETRACKING_MODULE}>
      {(tenantId) => <TimeSheetScreen tenantId={tenantId} />}
    </RequireTenant>
  )
}

function TimeSheetScreen({ tenantId }: { tenantId: number }) {
  const { can, user } = useAuth()
  const runs = useRunsModule()
  const queryClient = useQueryClient()
  const projectsOn = runs(PROJECT_MODULE)
  const mayReadOthers = can(TIMETRACKING_RIGHTS.read)
  const mayWriteOthers = can(TIMETRACKING_RIGHTS.write)
  const today = toIsoDate()

  const [day, setDay] = useState(today)
  const [owner, setOwner] = useState<SheetOwner>('mine')
  // What the last write did, in one line under the quick line.
  const [status, setStatus] = useState<string | null>(null)
  const mayWrite = owner === 'mine' || mayWriteOthers
  const monday = mondayOf(day)
  const sunday = addDays(monday, 6)

  const sheet = useQuery({
    queryKey: timeSheetKey(tenantId, owner, monday, sunday),
    queryFn: () => api.get<TimeSheet>(timeSheetUrl(tenantId, owner, monday, sunday)),
  })
  // The chips and the suggested service are the signed in user's; the backend has them under
  // /mine only, so the week of a colleague goes without them.
  const recent = useQuery({
    queryKey: recentTargetsKey(tenantId),
    queryFn: () => api.get<TimeRecentTarget[]>(recentTargetsUrl(tenantId)),
    enabled: owner === 'mine',
  })
  const colleagues = useQuery({
    queryKey: colleaguesKey(tenantId),
    queryFn: () => api.get<TimeColleague[]>(colleaguesUrl(tenantId)),
    enabled: mayReadOthers,
  })

  const me = colleagues.data?.find((colleague) => colleague.userId === user?.userId)
  const others = (colleagues.data ?? []).filter((colleague) => colleague.userId !== user?.userId)
  const ownerName =
    owner === 'mine'
      ? null
      : (others.find((colleague) => colleague.userId === owner)?.name ??
        sheet.data?.userName ??
        `Benutzer ${owner}`)

  const totals = new Map((sheet.data?.days ?? []).map((total) => [total.date, total.totalMinutes]))
  const dayEntries = (sheet.data?.entries ?? []).filter((entry) => entry.workDate === day)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })

  // --- the line for a new entry ----------------------------------------------------

  // «Zeit erfassen» on a project hands it over in the router state; read once, when the screen
  // opens, so a later change of the line is not undone by it.
  const location = useLocation()
  const [handedOver] = useState(() => recordOnTargetOf(location.state))
  const [createForm, setCreateForm] = useState<TimeEntryForm>(() =>
    handedOver === null
      ? emptyTimeEntryForm()
      : withTarget(emptyTimeEntryForm(), handedOver, projectsOn),
  )
  const createFormRef = useRef<HTMLFormElement>(null)
  const createDurationRef = useRef<HTMLInputElement>(null)
  const createRule = useBillableDefault(tenantId, createForm.target, mayWrite)

  // The service of a handed over project, as picking it from the list would suggest it: the one
  // taken there last, else the user's default service (backend ADR-0162).
  const handedOverService = useQuery({
    queryKey: defaultServiceKey(tenantId, handedOver),
    queryFn: () => fetchSuggestedService(tenantId, handedOver),
    enabled: handedOver !== null,
  })
  const [suggestionTaken, setSuggestionTaken] = useState(false)
  if (!suggestionTaken && handedOverService.data !== undefined) {
    setSuggestionTaken(true)
    setCreateForm((current) => withSuggestedService(current, handedOver, handedOverService.data))
  }

  // The project is chosen already; what is left to type is how long.
  useEffect(() => {
    if (handedOver !== null) createDurationRef.current?.focus()
  }, [handedOver])

  const record = useMutation({
    mutationFn: (body: TimeEntryRequest) =>
      api.post<TimeEntry>(timeEntryWriteUrl(tenantId, owner), body),
    onSuccess: (saved) => {
      setCreateForm(nextEntryForm)
      setStatus(`Gespeichert: ${formatDuration(saved.durationMinutes)} am ${dayTitle(saved.workDate)}.`)
      refresh()
      createDurationRef.current?.focus()
    },
  })
  const createChecks = useFieldErrors(
    () => timeEntryComplaints(createForm, createRule),
    record.error,
  )

  const submitCreate = () => {
    if (record.isPending) return
    record.reset()
    if (!createChecks.check()) return
    const reading = readDuration(createForm.duration)
    if (reading.state !== 'read') return
    // The next entry starts silent again: its complaints wait for its own first attempt.
    record.mutate(toTimeEntryRequest(createForm, reading.duration, day), {
      onSuccess: () => createChecks.reset(),
    })
  }

  const clearCreate = () => {
    setCreateForm(emptyTimeEntryForm())
    createChecks.reset()
    record.reset()
  }

  const pickRecent = (target: TimeRecentTarget) => {
    setCreateForm((current) => withRecentTarget(current, target, projectsOn))
    createDurationRef.current?.focus()
  }

  // --- changing an entry in its row -----------------------------------------------

  const [editing, setEditing] = useState<{ entry: TimeEntry; initial: TimeEntryForm } | null>(
    null,
  )
  const [editForm, setEditForm] = useState<TimeEntryForm>(emptyTimeEntryForm)
  const editDurationRef = useRef<HTMLInputElement>(null)

  const change = useMutation({
    mutationFn: ({ entry, body }: { entry: TimeEntry; body: TimeEntryRequest }) =>
      api.put<TimeEntry>(timeEntryUrl(tenantId, owner, entry.id), body),
    onSuccess: (saved) => {
      setEditing(null)
      setStatus(`Geändert: ${formatDuration(saved.durationMinutes)}, ${entryTargetText(saved)}.`)
      refresh()
    },
  })
  const editRule = useBillableDefault(tenantId, editForm.target, editing !== null)
  const editChecks = useFieldErrors(() => timeEntryComplaints(editForm, editRule), change.error)
  const editDirty = editing !== null && formChanged(editForm, editing.initial)

  const openEdit = (entry: TimeEntry) => {
    const initial = toTimeEntryForm(entry, projectsOn)
    change.reset()
    editChecks.reset()
    setEditForm(initial)
    setEditing({ entry, initial })
  }

  const closeEdit = () => {
    setEditing(null)
    change.reset()
    editChecks.reset()
  }

  const submitEdit = () => {
    if (editing === null || change.isPending) return
    change.reset()
    if (!editChecks.check()) return
    const reading = readDuration(editForm.duration)
    if (reading.state !== 'read') return
    const { entry } = editing
    change.mutate({
      entry,
      body: toTimeEntryRequest(
        editForm,
        reading.duration,
        entry.workDate,
        entry.lockVersion,
        editRule,
      ),
    })
  }

  // The duration is what is corrected most; the row opens with the focus there.
  const editingId = editing?.entry.id ?? null
  useEffect(() => {
    if (editingId !== null) editDurationRef.current?.focus()
  }, [editingId])

  // Another day, week or person takes the row out of view; changes in it are asked about first.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const leaveEdit = (then: () => void) => {
    if (editDirty) {
      setPendingLeave(() => then)
      return
    }
    if (editing !== null) closeEdit()
    then()
  }

  const chooseDay = (next: string) =>
    leaveEdit(() => {
      setDay(next)
      setStatus(null)
    })

  const chooseOwner = (next: SheetOwner) =>
    leaveEdit(() => {
      setOwner(next)
      setStatus(null)
    })

  // --- copying and deleting --------------------------------------------------------

  const copy = useMutation({
    mutationFn: (entry: TimeEntry) =>
      api.post<TimeEntry>(timeEntryCopyUrl(tenantId, owner, entry.id)),
    onSuccess: (saved) => {
      setStatus(`Kopiert: ${formatDuration(saved.durationMinutes)}, ${entryTargetText(saved)}.`)
      refresh()
    },
  })

  // «Fortsetzen» starts one's own stopwatch, so the button in the sidebar shows it at once; a
  // stopwatch that ran is turned into entries, which this week may show.
  const resume = useMutation({
    mutationFn: (entry: TimeEntry) => api.post<TimerStart>(continueEntryUrl(tenantId, entry.id)),
    onSuccess: (start) => {
      queryClient.setQueryData(timerKey(tenantId), start.timer)
      setStatus(startedText(start))
      refresh()
    },
    // Refused because the stopwatch that runs could not be stopped: read it anew, its state
    // is what the refusal is about.
    onError: () => void queryClient.invalidateQueries({ queryKey: timerKey(tenantId) }),
  })

  // «Vom Entwurf lösen» with TIME_BILL, for an entry whose position left its draft (#127).
  const release = useReleaseFromDraft(tenantId, setStatus)

  const [deleting, setDeleting] = useState<TimeEntry | null>(null)
  const remove = useMutation({
    mutationFn: (entry: TimeEntry) => api.delete<void>(timeEntryUrl(tenantId, owner, entry.id)),
    onSuccess: (_, entry) => {
      setDeleting(null)
      setEditing((current) => (current?.entry.id === entry.id ? null : current))
      setStatus(`Gelöscht: ${formatDuration(entry.durationMinutes)}, ${entryTargetText(entry)}.`)
      refresh()
    },
  })

  // --- the keyboard ----------------------------------------------------------------

  // Escape closes the row being changed, or empties the line; with something typed it asks.
  const { question } = useLeaveGuard(
    editing !== null ? editDirty : hasLineInput(createForm),
    () => (editing !== null ? closeEdit() : clearCreate()),
  )

  // Ctrl+S saves the line the focus is in; outside both lines, the row being changed.
  useSubmitShortcut(
    mayWrite
      ? () => {
          const inCreate = createFormRef.current?.contains(document.activeElement) ?? false
          if (editing !== null && !inCreate) submitEdit()
          else submitCreate()
        }
      : undefined,
  )

  // --- the screen ------------------------------------------------------------------

  const lineTitle =
    ownerName === null ? `Erfassen für ${dayTitle(day)}` : `Erfassen für ${ownerName}, ${dayTitle(day)}`

  return (
    <>
      <PageHeader title={ownerName === null ? 'Meine Zeiten' : `Zeiten von ${ownerName}`}>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Woche">
          <IconButton label="Vorherige Woche" onClick={() => chooseDay(weekStep(day, -1, today))}>
            <ChevronLeft size={16} aria-hidden />
          </IconButton>
          <span aria-live="polite" className="min-w-[13.5rem] px-1 text-center text-body tabular-nums">
            {weekLabel(monday)}
          </span>
          <IconButton
            label="Nächste Woche"
            onClick={() => chooseDay(weekStep(day, 1, today))}
            disabled={!hasLaterWeek(day, today)}
          >
            <ChevronRight size={16} aria-hidden />
          </IconButton>
          <Button
            type="button"
            variant="secondary"
            className="ml-1"
            onClick={() => chooseDay(today)}
            disabled={day === today}
          >
            Heute
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {mayReadOthers && (
          <div className="sm:max-w-[20rem]">
            <SelectField
              label="Zeiten von"
              value={owner === 'mine' ? '' : String(owner)}
              onChange={(event) =>
                chooseOwner(event.target.value === '' ? 'mine' : Number(event.target.value))
              }
            >
              <option value="">{me ? `${me.name} (ich)` : 'Ich'}</option>
              {others.map((colleague) => (
                <option key={colleague.userId} value={colleague.userId}>
                  {colleague.name}
                  {colleague.active ? '' : ' (deaktiviert)'}
                </option>
              ))}
            </SelectField>
          </div>
        )}

        <WeekBar
          days={weekDays(monday)}
          totals={totals}
          weekTotal={sheet.data?.totalMinutes}
          selected={day}
          today={today}
          onSelect={chooseDay}
        />

        {mayWrite ? (
          <Panel title={lineTitle} clipped={false}>
            <div className="grid gap-4">
              {owner === 'mine' && (
                <RecentChips
                  targets={recent.data ?? []}
                  failed={recent.isError}
                  onPick={pickRecent}
                />
              )}
              {record.error !== null && !isToldByLine(record.error) && (
                <ErrorNotice error={record.error} />
              )}
              <TimeEntryLine
                tenantId={tenantId}
                form={createForm}
                onChange={setCreateForm}
                projectsOn={projectsOn}
                billableDefault={createRule}
                errors={lineErrors(createChecks.errors)}
                busy={record.isPending}
                suggestServices={owner === 'mine'}
                onSubmit={submitCreate}
                label="Neuer Eintrag"
                durationRef={createDurationRef}
                formRef={createFormRef}
              />
              <p role="status" aria-live="polite" className="text-small text-text-secondary">
                {status !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Check size={13} className="text-accent-text" aria-hidden />
                    {status}
                  </span>
                )}
              </p>
            </div>
          </Panel>
        ) : (
          <>
            <p className="rounded-[var(--radius-md)] border border-line-subtle bg-surface px-4 py-3 text-body text-text-secondary">
              Diese Zeiten lassen sich nur lesen. Zum Erfassen und Ändern für andere fehlt das Recht{' '}
              <span className="font-mono text-small">{TIMETRACKING_RIGHTS.write}</span>.
            </p>
            {/* «Vom Entwurf lösen» goes with TIME_BILL, also on times that can only be read. */}
            {status !== null && (
              <p role="status" aria-live="polite" className="text-small text-text-secondary">
                {status}
              </p>
            )}
          </>
        )}

        {copy.error !== null && <ErrorNotice error={copy.error} />}
        {resume.error !== null && <ErrorNotice error={resume.error} />}

        <Panel
          title={dayTitle(day)}
          padded={false}
          clipped={false}
          action={
            <span className="font-mono text-control font-semibold tabular-nums">
              {sheet.data === undefined ? '' : dayTotalText(day, totals.get(day) ?? 0)}
            </span>
          }
        >
          {sheet.isPending ? (
            <LoadingBlock label="Zeiten werden geladen" />
          ) : sheet.isError ? (
            <div className="p-5">
              <ErrorNotice error={sheet.error} />
            </div>
          ) : dayEntries.length === 0 ? (
            <EmptyState
              title="Keine Zeiten an diesem Tag"
              description={
                ownerName !== null
                  ? `${ownerName} hat an diesem Tag keine Zeit erfasst.`
                  : 'Oben erfassen: Projekt oder Kunde, Dauer, Text und Enter.'
              }
            />
          ) : (
            <DayEntries
              entries={dayEntries}
              editingId={editingId}
              mayWrite={mayWrite}
              copyingId={copy.isPending ? (copy.variables?.id ?? null) : null}
              continuingId={resume.isPending ? (resume.variables?.id ?? null) : null}
              onEdit={(entry) => leaveEdit(() => openEdit(entry))}
              onCopy={(entry) => copy.mutate(entry)}
              onContinue={
                owner === 'mine'
                  ? (entry) => {
                      resume.reset()
                      resume.mutate(entry)
                    }
                  : undefined
              }
              onDelete={(entry) => {
                remove.reset()
                setDeleting(entry)
              }}
              mayRelease={release.mayRelease}
              onRelease={(entry) => {
                setStatus(null)
                release.ask(entry)
              }}
              invoiceOrigin={INVOICE_ORIGIN}
              editor={
                editing !== null && (
                  <div className="grid gap-3">
                    {change.error !== null && !isToldByLine(change.error) && (
                      <ErrorNotice error={change.error} />
                    )}
                    <TimeEntryLine
                      tenantId={tenantId}
                      form={editForm}
                      onChange={setEditForm}
                      projectsOn={projectsOn}
                      billableDefault={editRule}
                      errors={lineErrors(editChecks.errors)}
                      busy={change.isPending}
                      suggestServices={owner === 'mine'}
                      onSubmit={submitEdit}
                      onCancel={() => leaveEdit(() => undefined)}
                      label="Eintrag bearbeiten"
                      durationRef={editDurationRef}
                    />
                  </div>
                )
              }
            />
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Zeiteintrag löschen?"
        confirmLabel="Löschen"
        tone="danger"
        onConfirm={() => {
          if (deleting !== null) remove.mutate(deleting)
        }}
        onCancel={() => {
          remove.reset()
          setDeleting(null)
        }}
        busy={remove.isPending}
        error={remove.error}
      >
        {deleting !== null && (
          <p>
            {formatDurationShort(deleting.durationMinutes)} {entryTargetText(deleting)} vom{' '}
            {dayTitle(deleting.workDate)} wird gelöscht. Das lässt sich nicht rückgängig machen.
          </p>
        )}
      </ConfirmDialog>

      {release.question}

      <DiscardQuestion
        open={pendingLeave !== null}
        onKeep={() => setPendingLeave(null)}
        onDiscard={() => {
          const then = pendingLeave
          setPendingLeave(null)
          closeEdit()
          then?.()
        }}
      />

      {question}
    </>
  )
}
