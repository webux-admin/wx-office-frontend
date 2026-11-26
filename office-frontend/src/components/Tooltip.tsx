import { Info, Lock } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { remInPixels } from '../lib/dropdownPlacement'

type TooltipProps = {
  /** What the tooltip explains. A sentence that tells something, not the field name again. */
  text: ReactNode
  /** What the little icon stands for, read out instead of the icon. */
  label: string
  /** `lock` for a value that can no longer be changed, `info` for everything else. */
  icon?: 'info' | 'lock'
  /**
   * Id under which the text is reachable for `aria-describedby`, so the field it belongs to
   * reads it out when it takes focus. Without it, a generated one is used.
   */
  id?: string
}

/** How far the bubble keeps from the icon and from the edge of the window, in rem. */
const GAP_REM = 0.375

/**
 * A small icon next to a label that explains the field on hover or focus.
 *
 * <p>For the hint that really helps — a format, a business meaning, a consequence — and only
 * for that. The text sits in the tree at all times, hidden, so a field can name it in
 * `aria-describedby` and a screen reader reads it with the field.
 *
 * <p>The bubble is drawn into `body` rather than next to the icon: panels clip what overflows
 * them, and a dialog is transformed while it animates, which would carry a fixed bubble along.
 * Escape closes the bubble and nothing else — the dialog around it stays open.
 */
export function Tooltip({ text, label, icon = 'info', id }: TooltipProps) {
  const generated = useId()
  const textId = id ?? `${generated}-tooltip`
  const trigger = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const box = trigger.current?.getBoundingClientRect()
    if (!box) return
    const gap = GAP_REM * remInPixels()
    setPosition({ top: box.bottom + gap, left: Math.max(gap, box.left - gap) })
  }
  const hide = () => setPosition(null)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || position === null) return
    // Taken here, so the dialog or mask around does not read the same press as «cancel».
    event.preventDefault()
    event.stopPropagation()
    hide()
  }

  const Icon = icon === 'lock' ? Lock : Info

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-describedby={textId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={onKeyDown}
        // A click on a touch screen is the only way to get the bubble there.
        onClick={() => (position === null ? show() : hide())}
        className="inline-grid size-4 place-items-center rounded-[var(--radius-full)] align-middle text-text-tertiary transition-colors hover:text-text-primary"
      >
        <Icon className="size-3" aria-hidden />
      </button>
      <span id={textId} hidden>
        {text}
      </span>
      {position !== null &&
        createPortal(
          <span
            aria-hidden
            style={{ top: position.top, left: position.left }}
            className="pointer-events-none fixed z-[60] block max-w-tooltip rounded-[var(--radius-sm)] bg-ink px-2.5 py-1.5 text-small font-normal text-text-inverse shadow-card"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}
