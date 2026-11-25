import type { ReactNode } from 'react'

/** How loudly the badge speaks, not what it says. */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'muted'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-text-secondary',
  accent: 'bg-accent/12 text-accent-text',
  success: 'bg-success/14 text-success',
  danger: 'bg-danger/14 text-danger',
  muted: 'border border-line text-text-tertiary',
}

/**
 * The shape of a badge whose text may run onto a second line.
 *
 * <p>The radius is larger than half the height of one line, so the browser scales it down to a
 * pill while the text fits; on two lines it becomes a box with calm corners instead of a stretched
 * capsule. Breaking is only allowed below `sm`: wider, the column is wide enough for one line.
 */
const WRAPPING_SHAPE = 'justify-center rounded-[var(--radius-lg)] text-center sm:whitespace-nowrap'

/**
 * A short status word next to a record, for example the state of a document.
 *
 * @param wraps lets a longer text, such as a state with a document number, break in a narrow
 *   window, centred and without a stretched pill
 */
export function Badge({
  tone = 'neutral',
  wraps = false,
  children,
}: {
  tone?: BadgeTone
  wraps?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 text-caption font-medium ${
        wraps ? WRAPPING_SHAPE : 'rounded-[var(--radius-full)]'
      } ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
