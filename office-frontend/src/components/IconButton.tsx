import type { ReactNode } from 'react'

/**
 * A small square button that only shows an icon, for the actions at the end of a table row.
 *
 * <p>The label is required: without text on the button it is the only thing a screen reader
 * can announce, and it shows as the tooltip of the mouse as well. `danger` tints the hover for
 * an action that removes something.
 */
export function IconButton({
  label,
  onClick,
  tone = 'neutral',
  children,
}: {
  /** What the button does to which row, for example «Adresse Hauptsitz entfernen». */
  label: string
  onClick: () => void
  tone?: 'neutral' | 'danger'
  /** The icon. */
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-icon-button place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors ${
        tone === 'danger'
          ? 'hover:bg-danger/12 hover:text-danger'
          : 'hover:bg-sunken hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}
