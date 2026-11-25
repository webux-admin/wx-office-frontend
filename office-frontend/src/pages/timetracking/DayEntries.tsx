import { CopyPlus, Play, Trash2, Unlink } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '../../components/IconButton'
import { Tooltip } from '../../components/Tooltip'
import { formatDurationShort } from '../../lib/duration'
import type { OriginState } from '../../lib/origin'
import { entryServiceText, entryTargetText, timeRangeText } from '../../lib/timetracking'
import type { TimeEntry } from '../../lib/types'
import { TimeEntryStateBadge } from '../../timetracking/TimeEntryStateBadge'

/**
 * The columns of a row from the width of a tablet on; below it the cells wrap.
 *
 * <p>Every column that does not share out the rest has a fixed width — the state too, wide enough
 * for «verrechnet RE-2026-0042» on one line — and the actions beside it always take three slots.
 * So every row leaves the same width to the three shared columns, and project, service and text
 * start at the same place on every row, whatever state and actions a row has.
 */
const ROW_LAYOUT =
  'flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-left md:grid md:grid-cols-[6.5rem_3.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.6fr)_var(--spacing-column-xl)] md:items-center'

/**
 * The actions of a row: three slots of one icon button each, in a fixed order — continue or take
 * off the draft, copy, then delete or the lock. A button a row does not offer leaves its slot
 * empty, so the buttons after it stay where they are.
 */
const ACTION_SLOTS = 'grid shrink-0 grid-cols-[repeat(3,var(--spacing-icon-button))] gap-0.5'

/**
 * The entries of one day, the way the week bar chose it.
 *
 * <p>A click on a row opens it in the same line form it was recorded in, right where it stands.
 * «Fortsetzen» starts the stopwatch on the same work, «Kopieren» writes the same work again on the
 * same day, directly under it (backend ADR-0167), «Löschen» asks first. An entry that can only be read — billed, or on a project
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
      {/* Inside the row button no link can live; an entry that opens is never on an invoice. The
          wrapper takes the width of the column, so the badge keeps its own. */}
      <span>
        <TimeEntryStateBadge entry={entry} linked={!changeable} origin={invoiceOrigin} />
      </span>
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
        {/* Below a tablet the row wraps freely, and a bar without a single button only takes room. */}
        <div
          data-testid="entry-actions"
          className={`${ACTION_SLOTS} ${mayWrite || onRelease || locked ? '' : 'max-md:hidden'}`}
        >
          {onRelease ? (
            <IconButton label={`${short} vom Entwurf lösen`} onClick={() => onRelease(entry)}>
              <Unlink size={15} aria-hidden />
            </IconButton>
          ) : mayWrite && onContinue && entry.editable ? (
            <IconButton
              label={`${short} fortsetzen`}
              onClick={() => onContinue(entry)}
              disabled={continuing}
            >
              <Play size={15} aria-hidden />
            </IconButton>
          ) : (
            <EmptySlot />
          )}
          {mayWrite ? (
            <IconButton
              label={`${short} kopieren`}
              onClick={() => onCopy(entry)}
              disabled={copying}
            >
              <CopyPlus size={15} aria-hidden />
            </IconButton>
          ) : (
            <EmptySlot />
          )}
          {mayWrite && entry.editable ? (
            <IconButton label={`${short} löschen`} tone="danger" onClick={() => onDelete(entry)}>
              <Trash2 size={15} aria-hidden />
            </IconButton>
          ) : locked ? (
            // In place of change and delete: why the entry can only be read.
            <span className="grid size-icon-button place-items-center">
              <Tooltip icon="lock" label={`${short}: gesperrt`} text={entry.readOnlyReason} />
            </span>
          ) : (
            <EmptySlot />
          )}
        </div>
      </div>
    </div>
  )
}

/** The place of a button a row does not offer, kept so the slots after it stay where they are. */
function EmptySlot() {
  return <span aria-hidden className="size-icon-button" />
}
