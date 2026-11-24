import { CopyPlus, Play, Trash2, Unlink } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '../../components/IconButton'
import { Tooltip } from '../../components/Tooltip'
import { formatDurationShort } from '../../lib/duration'
import type { OriginState } from '../../lib/origin'
import { entryServiceText, entryTargetText, timeRangeText } from '../../lib/timetracking'
import type { TimeEntry } from '../../lib/types'
import { TimeEntryStateBadge } from '../../timetracking/TimeEntryStateBadge'

/** The columns of a row from the width of a tablet on; below it the cells wrap. */
const ROW_LAYOUT =
  'flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left md:grid md:grid-cols-[6.5rem_3.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] md:items-center'

/**
 * The entries of one day, the way the week bar chose it.
 *
 * <p>A click on a row opens it in the same line form it was recorded in, right where it stands.
 * «Fortsetzen» starts the stopwatch on the same work, «Auf heute kopieren» writes the same work
 * again for today, «Löschen» asks first. An entry that can only be read — billed, or on a project
 * that can only be read — offers neither change nor delete; a lock says why, in the backend's
 * sentence (backend ADR-0160, ADR-0161, ADR-0163).
 *
 * <p>An entry on an invoice links its badge to the invoice, and one on a draft offers «Vom
 * Entwurf lösen» where the session may (frontend ADR-0085).
 *
 * @param editingId the entry open in the line form, if any
 * @param editor the line form for that entry, drawn in place of its row
 * @param mayWrite whether this session may change these times at all
 * @param copyingId the entry a copy is on its way for
 * @param onContinue starts the stopwatch on an entry; absent where the times are somebody
 *   else's, because the stopwatch is one's own
 * @param continuingId the entry the stopwatch is being started on
 * @param onRelease takes an entry off its draft; offered only where `mayRelease` says so
 * @param invoiceOrigin where the invoice behind a badge leads back to
 */
export function DayEntries({
  entries,
  editingId,
  editor,
  mayWrite,
  copyingId,
  continuingId,
  onEdit,
  onCopy,
  onContinue,
  onDelete,
  mayRelease,
  onRelease,
  invoiceOrigin,
}: {
  entries: readonly TimeEntry[]
  editingId: number | null
  editor: ReactNode
  mayWrite: boolean
  copyingId: number | null
  continuingId: number | null
  onEdit: (entry: TimeEntry) => void
  onCopy: (entry: TimeEntry) => void
  onContinue?: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
  mayRelease: (entry: TimeEntry) => boolean
  onRelease: (entry: TimeEntry) => void
  invoiceOrigin?: OriginState
}) {
  return (
    <ul aria-label="Einträge des Tages">
      {entries.map((entry) => (
        <li
          key={entry.id}
          // The panel around does not clip, so the lists of the open row can reach past it; the
          // tint of that row takes the rounded corner itself when it is the last one.
          className={`border-b border-line-subtle last:border-b-0 ${
            entry.id === editingId ? 'bg-sunken/50 last:rounded-b-[var(--radius-lg)]' : ''
          }`}
        >
          {entry.id === editingId ? (
            <div className="px-5 py-4">{editor}</div>
          ) : (
            <EntryRow
              entry={entry}
              mayWrite={mayWrite}
              copying={copyingId === entry.id}
              continuing={continuingId === entry.id}
              onEdit={onEdit}
              onCopy={onCopy}
              onContinue={onContinue}
              onDelete={onDelete}
              onRelease={mayRelease(entry) ? onRelease : undefined}
              invoiceOrigin={invoiceOrigin}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

function EntryRow({
  entry,
  mayWrite,
  copying,
  continuing,
  onEdit,
  onCopy,
  onContinue,
  onDelete,
  onRelease,
  invoiceOrigin,
}: {
  entry: TimeEntry
  mayWrite: boolean
  copying: boolean
  continuing: boolean
  onEdit: (entry: TimeEntry) => void
  onCopy: (entry: TimeEntry) => void
  onContinue?: (entry: TimeEntry) => void
  onDelete: (entry: TimeEntry) => void
  /** Absent where the entry stands on no draft or the session may not take it off. */
  onRelease?: (entry: TimeEntry) => void
  invoiceOrigin?: OriginState
}) {
  const changeable = mayWrite && entry.editable
  const short = `${formatDurationShort(entry.durationMinutes)} ${entryTargetText(entry)}`
  const cells = (
    <>
      <span className="text-small tabular-nums text-text-tertiary max-md:empty:hidden">
        {timeRangeText(entry)}
      </span>
      <span className="font-mono font-medium tabular-nums">
        {formatDurationShort(entry.durationMinutes)}
      </span>
      <span className="min-w-0 text-text-primary md:truncate">{entryTargetText(entry)}</span>
      <span className="min-w-0 text-text-secondary md:truncate">{entryServiceText(entry)}</span>
      <span className="min-w-0 text-text-secondary max-md:empty:hidden md:truncate">
        {entry.description ?? ''}
      </span>
      {/* Inside the row button no link can live; an entry that opens is never on an invoice. */}
      <TimeEntryStateBadge entry={entry} linked={!changeable} origin={invoiceOrigin} />
    </>
  )
  const locked = !entry.editable && Boolean(entry.readOnlyReason)

  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-2">
        {changeable ? (
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className={`${ROW_LAYOUT} rounded-[var(--radius-sm)] text-body transition-colors hover:text-accent-text`}
          >
            <span className="sr-only">Bearbeiten: </span>
            {cells}
          </button>
        ) : (
          <div className={`${ROW_LAYOUT} text-body`}>{cells}</div>
        )}
        {(mayWrite || onRelease || locked) && (
          <div className="flex shrink-0 items-center gap-0.5">
            {onRelease && (
              <IconButton label={`${short} vom Entwurf lösen`} onClick={() => onRelease(entry)}>
                <Unlink size={15} aria-hidden />
              </IconButton>
            )}
            {mayWrite && onContinue && entry.editable && (
              <IconButton
                label={`${short} fortsetzen`}
                onClick={() => onContinue(entry)}
                disabled={continuing}
              >
                <Play size={15} aria-hidden />
              </IconButton>
            )}
            {mayWrite && (
              <IconButton
                label={`${short} auf heute kopieren`}
                onClick={() => onCopy(entry)}
                disabled={copying}
              >
                <CopyPlus size={15} aria-hidden />
              </IconButton>
            )}
            {mayWrite && entry.editable && (
              <IconButton label={`${short} löschen`} tone="danger" onClick={() => onDelete(entry)}>
                <Trash2 size={15} aria-hidden />
              </IconButton>
            )}
            {/* In place of change and delete: why the entry can only be read. */}
            {locked && (
              <span className="grid size-icon-button place-items-center">
                <Tooltip icon="lock" label={`${short}: gesperrt`} text={entry.readOnlyReason} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
