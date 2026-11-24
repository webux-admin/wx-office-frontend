import { AlertTriangle, Play, Square } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../auth/useAuth'
import { useTenantId } from '../layout/useTenantId'
import { formatDurationShort } from '../lib/duration'
import { useRunsModule } from '../lib/modules'
import {
  TIMETRACKING_MODULE,
  TIMETRACKING_RIGHTS,
  recentTargetLabel,
  timerText,
} from '../lib/timetracking'
import { TimerDialog } from './TimerDialog'
import {
  useMinutesRunning,
  useReloadOnReturn,
  useRunningTimer,
  useTimerTabTitle,
} from './useRunningTimer'

/**
 * Where the button stands: in the open sidebar, in the folded rail as a symbol only, or in the
 * bar above the page on a phone.
 */
type TimerPlace = 'sidebar' | 'rail' | 'bar'

/** The look of the button, by where it stands and whether a stopwatch runs. */
const LOOKS: Record<TimerPlace, { shape: string; idle: string; running: string }> = {
  sidebar: {
    shape: 'mt-2 flex h-button w-full min-w-0 items-center gap-2 px-2.5',
    idle: 'text-text-inverse-muted hover:bg-ink-hover hover:text-text-inverse',
    running: 'bg-accent text-on-accent hover:bg-accent-hover',
  },
  rail: {
    shape: 'mt-1 grid size-button shrink-0 place-items-center',
    idle: 'text-text-inverse-muted hover:bg-ink-hover hover:text-text-inverse',
    running: 'bg-accent text-on-accent hover:bg-accent-hover',
  },
  bar: {
    shape: 'ml-auto flex h-control min-w-0 items-center gap-2 px-3',
    idle: 'border border-line text-text-primary hover:bg-sunken',
    running: 'bg-accent text-on-accent hover:bg-accent-hover',
  },
}

/**
 * The stopwatch on every page: «▶ Zeit starten», or «■ 0:42 · P-00012 Website · Konzeption»
 * while one runs. A click opens the field to start, change, stop or discard it.
 *
 * <p>Only where the tenant runs the time tracking and the user holds `TIME_TRACK` — the backend
 * refuses the stopwatch otherwise, and a button that only leads to a refusal is no button
 * (backend ADR-0161, frontend ADR-0083).
 *
 * <p>The time is counted on in the browser from the start; the stopwatch is read anew when the
 * tab comes back, so a stop on the phone arrives here. While it runs, the tab title starts with
 * the time.
 */
export function TimerButton({ place }: { place: TimerPlace }) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const tenantId = useTenantId()
  if (tenantId === null || !runs(TIMETRACKING_MODULE) || !can(TIMETRACKING_RIGHTS.track)) {
    return null
  }
  return <Stopwatch tenantId={tenantId} place={place} />
}

function Stopwatch({ tenantId, place }: { tenantId: number; place: TimerPlace }) {
  const timer = useRunningTimer(tenantId)
  const running = timer.data ?? null
  const minutes = useMinutesRunning(running?.startedAt ?? null)
  useReloadOnReturn(tenantId)
  useTimerTabTitle(minutes)

  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  // Each opening is a new field, filled from the stopwatch as it stands then.
  const [session, setSession] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  // The field opens on the stopwatch read anew: the notice of a long one is only as fresh as
  // the last answer, and another device may have stopped it since. A failed reading opens on
  // what was read before.
  const openField = () => {
    if (opening) return
    setOpening(true)
    void timer.refetch().finally(() => {
      setSession((count) => count + 1)
      setOpen(true)
      setOpening(false)
    })
  }

  const look = LOOKS[place]
  const base = `${look.shape} rounded-[var(--radius-md)] text-body transition-colors`
  const showsText = place !== 'rail'

  // A failed reading anew keeps the stopwatch that was read before on the button.
  const face = timer.data === undefined && !timer.isError ? (
    <button
      type="button"
      disabled
      className={`${base} ${look.idle} cursor-wait`}
      aria-label={showsText ? undefined : 'Stoppuhr wird geladen'}
      title={showsText ? undefined : 'Stoppuhr wird geladen'}
    >
      <Spinner size={14} label="Stoppuhr wird geladen" />
      {showsText && <span className="truncate">Stoppuhr</span>}
    </button>
  ) : timer.data === undefined ? (
    <button
      type="button"
      onClick={() => void timer.refetch()}
      className={`${base} ${look.idle}`}
      aria-label={showsText ? undefined : 'Stoppuhr nicht geladen, neu laden'}
      title={`${timer.error?.message ?? 'Fehler.'} Ein Klick lädt sie neu.`}
    >
      <AlertTriangle size={15} aria-hidden className="shrink-0" />
      {showsText && <span className="truncate">Stoppuhr nicht geladen</span>}
    </button>
  ) : running === null ? (
    <button
      type="button"
      onClick={openField}
      aria-busy={opening || undefined}
      aria-haspopup="dialog"
      aria-label={showsText ? undefined : 'Zeit starten'}
      title={showsText ? undefined : 'Zeit starten'}
      className={`${base} ${look.idle}`}
    >
      <Play size={15} aria-hidden className="shrink-0" />
      {showsText && <span className="truncate">Zeit starten</span>}
    </button>
  ) : (
    <button
      type="button"
      onClick={openField}
      aria-busy={opening || undefined}
      aria-haspopup="dialog"
      aria-label={showsText ? undefined : `Stoppuhr läuft: ${timerText(running, minutes ?? 0)}`}
      title={`Stoppuhr läuft: ${timerText(running, minutes ?? 0)}`}
      className={`${base} ${look.running}`}
    >
      <Square size={13} fill="currentColor" aria-hidden className="shrink-0" />
      {showsText && (
        <>
          <span className="sr-only">Stoppuhr läuft: </span>
          <span className="shrink-0 font-mono font-medium tabular-nums">
            {formatDurationShort(minutes ?? 0)}
          </span>
          <span className="min-w-0 truncate">· {recentTargetLabel(running)}</span>
        </>
      )}
    </button>
  )

  return (
    <>
      {face}
      {/* Mounted for as long as the button is, with changing text: a region inserted together
          with its text is not announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {/* Into the body: the sidebar and the bar of the phone are layers of their own, and a
          dialog inside them would sit under whatever the page puts above them. */}
      {createPortal(
        <TimerDialog
          key={session}
          tenantId={tenantId}
          open={open}
          onClose={() => setOpen(false)}
          timer={running}
          minutes={minutes ?? 0}
          onDone={setAnnouncement}
        />,
        document.body,
      )}
    </>
  )
}
