import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * The two arrows that move a row up or down in a list the user sorts by hand.
 *
 * <p>The name of the record goes into the label of each arrow, so a screen reader announces
 * "Stück nach oben" rather than "Schaltfläche" nine times in a row.
 *
 * <p>An arrow at the end of the list stays visible and is disabled rather than disappearing:
 * a control that vanishes moves everything else and costs the reader its place.
 */
export function RowOrderButtons({
  name,
  upDisabled,
  downDisabled,
  onUp,
  onDown,
}: {
  /** The record being moved, as it is named on screen. */
  name: string
  upDisabled: boolean
  downDisabled: boolean
  onUp: () => void
  onDown: () => void
}) {
  return (
    <span className="flex gap-0.5">
      <Arrow label={`${name} nach oben`} disabled={upDisabled} onClick={onUp}>
        <ChevronUp size={14} aria-hidden />
      </Arrow>
      <Arrow label={`${name} nach unten`} disabled={downDisabled} onClick={onDown}>
        <ChevronDown size={14} aria-hidden />
      </Arrow>
    </span>
  )
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-[var(--radius-sm)] p-0.5 text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
