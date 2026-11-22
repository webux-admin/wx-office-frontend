import {
  Keyboard,
  Maximize,
  PanelLeftOpen,
  PanelRightOpen,
  QrCode,
  Ruler as RulerIcon,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { PageView } from '../../printlayout/paper'
import { formatZoom, ZOOM_MAX, ZOOM_MIN } from '../../printlayout/zoom'
import { onMac } from '../../lib/shortcuts'

type CanvasToolbarProps = {
  view: PageView
  onViewChange: (view: PageView) => void
  zoom: number
  /** Whether the sheet is being kept fitted to the window. */
  fitted: boolean
  onZoomStep: (direction: 1 | -1) => void
  onFit: () => void
  showGuides: boolean
  onShowGuidesChange: (shown: boolean) => void
  showPaymentPart: boolean
  onShowPaymentPartChange: (shown: boolean) => void
  /** On a narrow screen the two side panes are drawers; these open them. */
  onOpenPalette?: () => void
  onOpenInspector?: () => void
}

/**
 * The strip above the sheet: which page is shown, how large, and what is drawn on top.
 *
 * <p>Nothing here changes the form. That is the line between this strip and the inspector:
 * what is set here is how the designer looks, not what the printer prints.
 */
export function CanvasToolbar({
  view,
  onViewChange,
  zoom,
  fitted,
  onZoomStep,
  onFit,
  showGuides,
  onShowGuidesChange,
  showPaymentPart,
  onShowPaymentPartChange,
  onOpenPalette,
  onOpenInspector,
}: CanvasToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Ansicht des Blatts"
      // A container, so the buttons can shed their wording by the room the toolbar has —
      // which depends on the side panes, not on the window.
      className="@container flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-subtle bg-surface px-3 py-2"
    >
      {onOpenPalette !== undefined && (
        <ToolButton onClick={onOpenPalette} label="Elemente und Felder öffnen">
          <PanelLeftOpen size={15} aria-hidden />
          Elemente
        </ToolButton>
      )}

      <div
        role="group"
        aria-label="Seite"
        className="inline-flex rounded-[var(--radius-md)] border border-line bg-sunken p-0.5"
      >
        <Segment pressed={view === 'first'} onClick={() => onViewChange('first')}>
          Seite 1
        </Segment>
        <Segment pressed={view === 'following'} onClick={() => onViewChange('following')}>
          Folgeseite
        </Segment>
      </div>

      <div role="group" aria-label="Zoom" className="flex items-center gap-0.5">
        <ToolButton
          onClick={() => onZoomStep(-1)}
          label="Verkleinern"
          disabled={zoom <= ZOOM_MIN}
          square
        >
          <ZoomOut size={15} aria-hidden />
        </ToolButton>
        <span
          aria-live="off"
          className="w-[3.25rem] text-center font-mono text-small tabular-nums text-text-secondary"
        >
          {formatZoom(zoom)}
        </span>
        <ToolButton
          onClick={() => onZoomStep(1)}
          label="Vergrössern"
          disabled={zoom >= ZOOM_MAX}
          square
        >
          <ZoomIn size={15} aria-hidden />
        </ToolButton>
        <ToolButton onClick={onFit} label="Ganzes Blatt einpassen" pressed={fitted}>
          <Maximize size={15} aria-hidden />
          <Wording sheds="first">Einpassen</Wording>
        </ToolButton>
      </div>

      <ToolButton
        onClick={() => onShowGuidesChange(!showGuides)}
        label="Hilfslinien: Ränder zeigen und beim Ziehen an Kanten einrasten"
        pressed={showGuides}
      >
        <RulerIcon size={15} aria-hidden />
        <Wording sheds="last">Hilfslinien</Wording>
      </ToolButton>

      <ToolButton
        onClick={() => onShowPaymentPartChange(!showPaymentPart)}
        label="QR-Zahlteil zeigen. Offerten, Aufträge und Lieferscheine haben keinen."
        pressed={showPaymentPart}
      >
        <QrCode size={15} aria-hidden />
        <Wording sheds="last">QR-Zahlteil zeigen</Wording>
      </ToolButton>

      <span className="ml-auto flex items-center gap-2">
        <ShortcutsPopover />
        {onOpenInspector !== undefined && (
          <ToolButton onClick={onOpenInspector} label="Einstellungen öffnen">
            <PanelRightOpen size={15} aria-hidden />
            Einstellungen
          </ToolButton>
        )}
      </span>
    </div>
  )
}

/**
 * The wording of a toolbar button, which gives way to the icon alone before the toolbar would
 * break onto a second row.
 *
 * <p>The words stay in the tree for a screen reader, and the button carries them as its
 * tooltip; only the room they take is given back. What matters least goes first: «Einpassen»
 * and «Tastenkürzel» say little their icons do not, while «Hilfslinien» and «QR-Zahlteil
 * zeigen» are the two switches somebody has to find by reading.
 */
function Wording({ sheds, children }: { sheds: 'first' | 'last'; children: string }) {
  return (
    <span className={sheds === 'first' ? '@max-5xl:sr-only' : '@max-2xl:sr-only'}>{children}</span>
  )
}

function Segment({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-[var(--radius-sm)] px-3 py-1 text-body transition-colors ${
        pressed
          ? 'bg-surface font-medium text-text-primary shadow-card'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A button of the toolbar. With `pressed` it is a switch and says so to a screen reader; the
 * long `label` is its tooltip, the short text inside what is read on the strip.
 */
function ToolButton({
  onClick,
  label,
  pressed,
  disabled = false,
  square = false,
  children,
}: {
  onClick: () => void
  label: string
  pressed?: boolean
  disabled?: boolean
  /** An icon alone: the label becomes the accessible name. */
  square?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={square ? label : undefined}
      title={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border text-body transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        square ? 'w-8 justify-center' : 'px-2.5'
      } ${
        pressed === true
          ? 'border-accent/40 bg-accent/10 text-accent-text'
          : 'border-transparent text-text-secondary hover:bg-sunken hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

/** The keys the sheet answers to, in the order somebody needs them. */
function shortcutsFor(mac: boolean): readonly (readonly [string, string])[] {
  const mod = mac ? '⌘' : 'Strg+'
  return [
    ['Tab', 'Zum nächsten Element'],
    ['Pfeiltasten', 'Um 0.5 mm verschieben'],
    ['Umschalt+Pfeil', 'Um 5 mm verschieben'],
    ['Alt+Pfeil', 'Um 0.1 mm verschieben'],
    ['Umschalt+Klick', 'Zur Auswahl hinzufügen'],
    ['Alt beim Ziehen', 'Ohne Einrasten'],
    ['Umschalt beim Ziehen', 'Fest auf dem Blatt lassen'],
    ['Entf', 'Löschen'],
    [`${mod}D`, 'Duplizieren'],
    [`${mod}C / ${mod}V`, 'Kopieren / Einfügen'],
    [`${mod}Z`, 'Rückgängig'],
    [mac ? '⌘⇧Z' : 'Strg+Y', 'Wiederholen'],
    [`${mod}S`, 'Speichern'],
    ['Esc', 'Auswahl aufheben'],
  ]
}

/**
 * The list of keys, behind a button.
 *
 * <p>A popover and not a dialog: it is something to glance at while working, and it must not
 * take the keyboard away from the sheet it describes. Escape and a click elsewhere close it.
 */
function ShortcutsPopover() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Taken here, so the same press does not also deselect or leave the designer.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && wrapper.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title="Tastenkürzel"
        onClick={() => setOpen(!open)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 text-body transition-colors ${
          open
            ? 'bg-sunken text-text-primary'
            : 'text-text-secondary hover:bg-sunken hover:text-text-primary'
        }`}
      >
        <Keyboard size={15} aria-hidden />
        <Wording sheds="first">Tastenkürzel</Wording>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Tastenkürzel"
          className="absolute right-0 top-full z-40 mt-1.5 w-[21rem] max-w-[90vw] rounded-[var(--radius-md)] border border-line bg-surface p-3 shadow-card"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-small">
            {shortcutsFor(onMac()).map(([keys, meaning]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded-[var(--radius-xs)] border border-line bg-sunken px-1.5 py-0.5 font-mono text-caption text-text-primary">
                    {keys}
                  </kbd>
                </dt>
                <dd className="self-center text-text-secondary">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
