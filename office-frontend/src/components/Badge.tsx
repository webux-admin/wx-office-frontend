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

/** A short status word next to a record, for example the state of a document. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
