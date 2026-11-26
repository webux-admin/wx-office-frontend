import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Square } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { ErrorNotice, WarningNotice } from '../components/Notice'
import { RichTextField } from '../components/RichTextField'
import { TextField } from '../components/TextField'
import { useFieldErrors } from '../components/useFieldErrors'
import { ApiError, api } from '../lib/api'
import { formatDurationShort } from '../lib/duration'
import { toIsoDate } from '../lib/format'
import { onMac, submitShortcutTitle } from '../lib/shortcuts'
import { useRunsModule } from '../lib/modules'
import { PROJECT_MODULE } from '../lib/project'
import {
  TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
  emptyTimerForm,
  isTimerTooLong,
  isToldByTimer,
  recentTargetsKey,
  recentTargetsUrl,
  startedText,
  stoppedText,
  timeEntriesKey,
  timerChanged,
  timerComplaints,
  timerErrors,
  timerKey,
  timerSinceText,
  timerStopUrl,
  timerUrl,
  toTimerChangeRequest,
  toTimerForm,
  toTimerRequest,
  toTimerStopRequest,
  withRecentTarget,
  type TimerField,
  type TimerForm,
  type TimerIntent,
} from '../lib/timetracking'
import type {
  RunningTimer,
  TimeEntry,
  TimeRecentTarget,
  TimerChangeRequest,
  TimerRequest,
  TimerStart,
  TimerStopRequest,
} from '../lib/types'
import { BillableField, ServiceField, TargetField } from './AssignmentFields'
import { RecentChips } from './RecentChips'
import { enterSubmits } from './enterSubmits'
import { useBillableDefault } from './useBillableDefault'

/** What the field shows of a stopwatch that runs; start and end come with it. */
const RUNNING_FIELDS: readonly TimerField[] = ['target', 'service', 'description', 'start', 'end']

/** What the field shows for a new start. */
const START_FIELDS: readonly TimerField[] = ['target', 'service', 'description']

/** Said where a refusal of more than 24 hours came before the backend's notice did. */
const END_REQUIRED_NOTICE =
  'Die Stoppuhr läuft länger als 24 Stunden. Zum Anhalten das echte Ende angeben.'

/**
 * The small field behind the stopwatch button: what the stopwatch runs on, and the steps.
 *
 * <p>Nothing runs: project or customer, service, text and «verrechenbar» with «Start» — all of
 * them optional, so an empty field and Enter start on internal time. A stopwatch runs: the same
 * fields filled in, its start, «Verwerfen», «Speichern» and «Stopp»; the focus is on «Stopp».
 * From twelve hours on the backend's notice stands above a field for the real end, which is
 * required after 24 hours (backend ADR-0161, frontend ADR-0083).
 *
 * <p>«verrechenbar» takes its default and its lock from the server for the target, like the quick
 * line: on a project set to «Nicht verrechenbar» it cannot be switched on (backend ADR-0162,
 * frontend ADR-0084).
 *
 * <p><b>The field follows the stopwatch.</b> Another device may start, change or stop it while
 * the field is open; each step that finds out reads it anew, and the field shows what runs now.
 *
 * @param timer the running stopwatch, `null` while none runs
 * @param minutes how long it runs, as the button counts it
 * @param onDone receives what a step did, in a sentence for the screen reader
 */
export function TimerDialog({
  tenantId,
  open,
  onClose,
  timer,
  minutes,
  onDone,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  timer: RunningTimer | null
  minutes: number
  onDone: (sentence: string) => void
}) {
  const queryClient = useQueryClient()
  const runs = useRunsModule()
  const projectsOn = runs(PROJECT_MODULE)

  // What the field shows. Held still while the box fades out, so a stop does not turn it into
  // the start field in front of the eyes.
  const [held, setHeld] = useState(timer)
  if (open && held !== timer) setHeld(timer)

  // A new state of the stopwatch fills the field anew. A real end typed in stays: a stop that
  // saved a change first still needs it after a refusal.
  const basis = held === null ? null : `${held.id}:${held.lockVersion}`
  const [shownBasis, setShownBasis] = useState(basis)
  const [initial, setInitial] = useState<TimerForm>(() => formOf(held, projectsOn))
  const [form, setForm] = useState<TimerForm>(initial)
  const [intent, setIntent] = useState<TimerIntent>(held === null ? 'start' : 'stop')
  if (basis !== shownBasis) {
    const next = formOf(held, projectsOn)
    setShownBasis(basis)
    setInitial(next)
    setForm((current) =>
      held === null
        ? next
        : { ...next, endDate: current.endDate || next.endDate, endTime: current.endTime },
    )
    // What the field asked of the stopwatch before does not hold for the one it shows now.
    setIntent(held === null ? 'start' : 'change')
  }

  const [raceLost, setRaceLost] = useState(false)
  const [tooLong, setTooLong] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const focusTarget = useRef<HTMLElement | null>(null)

  const recent = useQuery({
    queryKey: recentTargetsKey(tenantId),
    queryFn: () => api.get<TimeRecentTarget[]>(recentTargetsUrl(tenantId)),
    enabled: open,
  })

  // --- the steps -------------------------------------------------------------------

  const refreshEntries = () =>
    void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })
  const showTimer = (next: RunningTimer | null) =>
    queryClient.setQueryData(timerKey(tenantId), next)

  // 404 and 409 say the stopwatch moved on elsewhere: read it and what it wrote anew.
  const noteRefusal = (error: unknown) => {
    if (isTimerTooLong(error)) setTooLong(true)
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      void queryClient.invalidateQueries({ queryKey: timerKey(tenantId) })
      refreshEntries()
    }
  }

  const start = useMutation({
    mutationFn: (body: TimerRequest) => api.post<TimerStart>(timerUrl(tenantId), body),
    onSuccess: (answer) => {
      showTimer(answer.timer)
      refreshEntries()
      onDone(startedText(answer))
      if (answer.started) onClose()
      else setRaceLost(true)
    },
    onError: noteRefusal,
  })

  const change = useMutation({
    mutationFn: (body: TimerChangeRequest) => api.put<RunningTimer>(timerUrl(tenantId), body),
    onSuccess: (changed) => {
      showTimer(changed)
      onDone('Stoppuhr geändert.')
      onClose()
    },
    onError: noteRefusal,
  })

  // A change still in the field is saved first, so the entry carries what the field shows — the
  // service picked after a stop was refused for want of one, above all.
  const stop = useMutation({
    mutationFn: async ({
      changeBody,
      stopBody,
    }: {
      changeBody: TimerChangeRequest | null
      stopBody: TimerStopRequest
    }) => {
      if (changeBody !== null) {
        showTimer(await api.put<RunningTimer>(timerUrl(tenantId), changeBody))
      }
      return api.post<TimeEntry[]>(timerStopUrl(tenantId), stopBody)
    },
    onSuccess: (entries) => {
      showTimer(null)
      refreshEntries()
      onDone(stoppedText(entries))
      onClose()
    },
    onError: noteRefusal,
  })

  const discard = useMutation({
    mutationFn: () => api.delete<void>(timerUrl(tenantId)),
    onSuccess: () => {
      showTimer(null)
      refreshEntries()
      onDone('Stoppuhr verworfen. Es wurde nichts gespeichert.')
      setDiscarding(false)
      onClose()
    },
    onError: noteRefusal,
  })

  const failure = start.error ?? change.error ?? stop.error ?? null
  // The field is required once the backend said so, in the stopwatch or in a refusal. The own
  // check asks only on the flag: after a refusal its sentence, which names the start, stands.
  const endRequired = (held?.endRequired ?? false) || tooLong
  const endAsked = held?.endRequired ?? false
  const rule = useBillableDefault(tenantId, form.target, open)
  const checks = useFieldErrors(() => timerComplaints(form, intent, endAsked, rule), failure)
  const errors = timerErrors(checks.errors)
  const busy = start.isPending || change.isPending || stop.isPending
  const changed = timerChanged(form, initial)

  // The complaints follow the step asked for; the check that shows them runs with it.
  const attempt = (next: TimerIntent): boolean => {
    if (busy) return false
    start.reset()
    change.reset()
    stop.reset()
    setRaceLost(false)
    setIntent(next)
    checks.check()
    return Object.keys(timerComplaints(form, next, endAsked, rule)).length === 0
  }

  const startNow = () => {
    if (attempt('start')) start.mutate(toTimerRequest(form))
  }

  const save = () => {
    if (held === null || !changed) return
    if (attempt('change')) {
      change.mutate(toTimerChangeRequest(form, initial, held.lockVersion, rule))
    }
  }

  const stopNow = () => {
    if (held === null || !attempt('stop')) return
    stop.mutate({
      changeBody: changed ? toTimerChangeRequest(form, initial, held.lockVersion, rule) : null,
      stopBody: toTimerStopRequest(form),
    })
  }

  // --- the field -------------------------------------------------------------------

  const running = held !== null
  const submit = running ? save : startNow
  const showsEnd = held !== null && (held.longRunning || endRequired)
  const set = <K extends keyof TimerForm>(key: K, value: TimerForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={held === null ? 'Stoppuhr starten' : `Stoppuhr · ${formatDurationShort(minutes)}`}
        description={held === null ? undefined : timerSinceText(held.startedAt, toIsoDate())}
        dirty={changed}
        onSubmit={submit}
        initialFocus={focusTarget}
        // Wide enough for a project and its customer in the field and in the list (#134).
        wide
        footer={
          held === null ? (
            <>
              <DialogCancelButton />
              <Button
                onClick={startNow}
                busy={start.isPending}
                title={submitShortcutTitle('Start', onMac())}
              >
                <Play size={14} aria-hidden />
                Start
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                className="mr-auto"
                onClick={() => {
                  discard.reset()
                  setDiscarding(true)
                }}
                disabled={busy}
              >
                Verwerfen
              </Button>
              <Button
                variant="secondary"
                onClick={save}
                disabled={!changed || stop.isPending}
                busy={change.isPending}
                shortcut
              >
                Speichern
              </Button>
              <Button
                ref={(element) => {
                  focusTarget.current = element
                }}
                onClick={stopNow}
                disabled={change.isPending}
                busy={stop.isPending}
              >
                <Square size={12} fill="currentColor" aria-hidden />
                Stopp
              </Button>
            </>
          )
        }
      >
        <form
          aria-label="Stoppuhr"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) submit()
          }}
          onKeyDown={enterSubmits(submit, busy)}
          className="grid gap-4"
        >
          {raceLost && (
            <WarningNotice>
              Auf einem anderen Gerät wurde gleichzeitig eine Stoppuhr gestartet. Hier steht jetzt
              diese.
            </WarningNotice>
          )}
          {failure !== null && !isToldByTimer(failure, running ? RUNNING_FIELDS : START_FIELDS) && (
            <ErrorNotice error={failure} />
          )}

          <RecentChips
            targets={recent.data ?? []}
            failed={recent.isError}
            onPick={(target) => setForm((current) => withRecentTarget(current, target, projectsOn))}
          />
          <TargetField
            tenantId={tenantId}
            form={form}
            onChange={setForm}
            projectsOn={projectsOn}
            suggestServices
            error={errors.target}
            inputRef={
              running
                ? undefined
                : (element) => {
                    focusTarget.current = element
                  }
            }
          />
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <ServiceField tenantId={tenantId} form={form} onChange={setForm} error={errors.service} />
            {/* Without a label of its own the box starts where the input beside it does. */}
            <div className="flex h-control items-center sm:mt-6">
              <BillableField form={form} onChange={setForm} rule={rule} projectsOn={projectsOn} />
            </div>
          </div>
          <RichTextField
            label="Text"
            value={form.description}
            onChange={(description) => set('description', description)}
            placeholder="Was wird gemacht?"
            maxLength={TIME_ENTRY_DESCRIPTION_MAX_LENGTH}
            error={errors.description}
            enterKey="form"
            tooltip="Fett, kursiv und Listen über die Leiste oben, mit Strg+B und Strg+I oder «- » am Zeilenanfang. Enter startet oder speichert, Umschalt+Enter beginnt eine neue Zeile."
          />

          {running && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Gestartet am"
                type="date"
                value={form.startDate}
                onChange={(event) => set('startDate', event.target.value)}
                required
                error={errors.start}
              />
              <TextField
                label="Gestartet um"
                type="time"
                value={form.startTime}
                onChange={(event) => set('startTime', event.target.value)}
                required
                invalid={errors.start !== undefined}
                tooltip="Früher stellen, wenn die Arbeit schon vorher begann. Nie nach jetzt."
              />
            </div>
          )}

          {showsEnd && (
            <>
              <WarningNotice>{held.notice ?? END_REQUIRED_NOTICE}</WarningNotice>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Ende am"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => set('endDate', event.target.value)}
                  required={endRequired}
                  invalid={errors.end !== undefined}
                />
                <TextField
                  label="Ende um"
                  type="time"
                  value={form.endTime}
                  onChange={(event) => set('endTime', event.target.value)}
                  required={endRequired}
                  error={errors.end}
                  tooltip={
                    endRequired
                      ? 'Wann die Arbeit wirklich endete. Ohne Ende lässt sich die Stoppuhr nicht anhalten.'
                      : 'Wann die Arbeit wirklich endete. Leer hält jetzt an.'
                  }
                />
              </div>
            </>
          )}
        </form>
      </Dialog>

      <ConfirmDialog
        open={discarding}
        title="Stoppuhr verwerfen?"
        confirmLabel="Verwerfen"
        tone="danger"
        onConfirm={() => discard.mutate()}
        onCancel={() => {
          discard.reset()
          setDiscarding(false)
        }}
        busy={discard.isPending}
        error={discard.error}
      >
        <p>
          Die Stoppuhr läuft seit {formatDurationShort(minutes)}. Verworfen wird kein Eintrag
          geschrieben; das lässt sich nicht rückgängig machen.
        </p>
      </ConfirmDialog>
    </>
  )
}

function formOf(timer: RunningTimer | null, projectsOn: boolean): TimerForm {
  return timer === null ? emptyTimerForm() : toTimerForm(timer, projectsOn)
}
