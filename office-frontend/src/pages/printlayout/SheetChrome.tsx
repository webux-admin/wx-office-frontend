import { AlertTriangle, Copy, Trash2 } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { LayoutRepeat } from '../../lib/types'
import type { ResizeHandle } from '../../printlayout/geometry'

/** Where each grip sits on the outline, and the cursor that says which way it pulls. */
const HANDLE_PLACES: Record<ResizeHandle, CSSProperties> = {
  n: { left: '50%', top: 0, cursor: 'ns-resize' },
  ne: { left: '100%', top: 0, cursor: 'nesw-resize' },
  e: { left: '100%', top: '50%', cursor: 'ew-resize' },
  se: { left: '100%', top: '100%', cursor: 'nwse-resize' },
  s: { left: '50%', top: '100%', cursor: 'ns-resize' },
  sw: { left: 0, top: '100%', cursor: 'nesw-resize' },
  w: { left: 0, top: '50%', cursor: 'ew-resize' },
  nw: { left: 0, top: 0, cursor: 'nwse-resize' },
}

/**
 * The grips of a selected object.
 *
 * <p>Pointer only, and hidden from a screen reader: width and height are typed in the
 * inspector, which is the way that needs no dragging (WCAG 2.2 SC 2.5.7).
 */
export function ResizeHandles({ handles }: { handles: readonly ResizeHandle[] }) {
  return (
    <>
      {handles.map((handle) => (
        <span
          key={handle}
          aria-hidden
          data-handle={handle}
          className="sheet-handle z-[4]"
          style={HANDLE_PLACES[handle]}
        />
      ))}
    </>
  )
}

/**
 * The small bar floating at a selected object: what it is, and the two or three things most
 * often done to it.
 *
 * <p>The buttons carry `data-action`; the sheet listens for the click, so the bar needs no
 * callbacks and the object it belongs to stays cheap to re-render.
 *
 * @param label what the object is called
 * @param repeat for a page element: where it prints, shown as a two-way switch
 * @param below draws the bar under the object, for one too close to the top of the sheet
 * @param alignRight anchors the bar to the right edge, for an object in the right half
 */
export function ActionBar({
  label,
  repeat,
  below = false,
  alignRight = false,
}: {
  label: string
  repeat?: LayoutRepeat
  below?: boolean
  alignRight?: boolean
}) {
  const gap = 'calc(var(--sheet-px) * 8)'
  return (
    <div
      data-action-bar
      className="sheet-chrome absolute z-[6] flex w-max items-center gap-0.5 rounded-[var(--radius-sm)] bg-ink p-0.5 text-text-inverse shadow-card"
      style={{
        [below ? 'top' : 'bottom']: '100%',
        [alignRight ? 'right' : 'left']: 0,
        [below ? 'marginTop' : 'marginBottom']: gap,
        transformOrigin: `${below ? 'top' : 'bottom'} ${alignRight ? 'right' : 'left'}`,
      }}
    >
      <span className="max-w-[12rem] truncate px-1.5 font-medium">{label}</span>
      {repeat !== undefined && (
        <span
          role="group"
          aria-label="Erscheint auf"
          className="mx-0.5 flex rounded-[var(--radius-xs)] bg-ink-hover p-px"
        >
          <BarToggle action="repeat-first" pressed={repeat === 'FIRST_PAGE'}>
            Nur Seite 1
          </BarToggle>
          <BarToggle action="repeat-every" pressed={repeat === 'EVERY_PAGE'}>
            Jede Seite
          </BarToggle>
        </span>
      )}
      <BarButton action="duplicate" label={`${label} duplizieren`}>
        <Copy size={13} aria-hidden />
      </BarButton>
      <BarButton action="remove" label={`${label} löschen`}>
        <Trash2 size={13} aria-hidden />
      </BarButton>
    </div>
  )
}

function BarToggle({
  action,
  pressed,
  children,
}: {
  action: string
  pressed: boolean
  children: string
}) {
  return (
    <button
      type="button"
      data-action={action}
      aria-pressed={pressed}
      className={`rounded-[var(--radius-xs)] px-1.5 py-0.5 transition-colors ${
        pressed ? 'bg-text-inverse text-ink' : 'text-text-inverse-muted hover:text-text-inverse'
      }`}
    >
      {children}
    </button>
  )
}

function BarButton({
  action,
  label,
  children,
}: {
  action: string
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-action={action}
      aria-label={label}
      title={label}
      className="grid size-6 place-items-center rounded-[var(--radius-xs)] text-text-inverse-muted transition-colors hover:bg-ink-hover hover:text-text-inverse"
    >
      {children}
    </button>
  )
}

/**
 * The name of a section, shown at its corner while the pointer is over it.
 *
 * <p>A table on paper does not say what it is; on the sheet it has to, or nobody finds the
 * «MwSt-Aufstellung» among four grey blocks.
 */
export function ObjectTag({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      className="sheet-chrome sheet-tag pointer-events-none absolute bottom-full left-0 z-[3] w-max origin-bottom-left rounded-t-[var(--radius-xs)] bg-sheet-selection px-1.5 text-on-accent"
    >
      {label}
    </span>
  )
}

/**
 * A mark on an object that will not print as it looks: a field nobody offers any more, or an
 * element the payment part will cover.
 *
 * <p>An icon and a sentence, never the colour alone. The sentence is the tooltip of the mark
 * and part of the accessible name of the object it sits on.
 */
export function WarningMark({ text }: { text: string }) {
  return (
    <span
      title={text}
      data-warning
      className="sheet-chrome absolute right-0 top-0 z-[3] grid size-4 origin-top-right place-items-center rounded-[var(--radius-full)] bg-sheet-warning text-on-accent"
      style={{ margin: 'calc(var(--sheet-px) * -6)' }}
    >
      <AlertTriangle size={10} aria-hidden />
    </span>
  )
}
