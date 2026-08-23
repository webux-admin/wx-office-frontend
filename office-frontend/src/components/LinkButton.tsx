import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { OriginState } from '../lib/origin'

type Variant = 'primary' | 'secondary'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-text-primary border border-line hover:bg-sunken',
}

/**
 * A link that looks like a button.
 *
 * <p>Anything that opens another screen stays a link, even when it is the loudest control on
 * the page: only a link can be opened in a new tab, and only a link tells a screen reader
 * that the page is about to change.
 */
export function LinkButton({
  to,
  state,
  variant = 'primary',
  className = '',
  children,
}: {
  to: string
  /** Names the current screen as the one a mask behind this link returns to. */
  state?: OriginState
  variant?: Variant
  className?: string
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      state={state}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-[13px] font-medium transition-colors duration-150 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  )
}
