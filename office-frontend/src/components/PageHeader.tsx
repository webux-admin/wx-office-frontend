import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { MouseEvent, ReactNode } from 'react'

/**
 * The top of a screen: where the user is, and what they can do here.
 *
 * <p>The way back is a link rather than a button, so it can be opened in a new tab and the
 * browser history keeps working.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  onBack,
  children,
}: {
  title: string
  subtitle?: ReactNode
  /** Route and wording of the way back, for a mask that was opened from a list. */
  back?: { to: string; label: string }
  /**
   * Called on a plain click on the way back, before the link is followed. A mask with unsaved
   * changes calls `preventDefault` there and asks first.
   */
  onBack?: (event: MouseEvent<HTMLAnchorElement>) => void
  /** Actions on the right, usually one primary button. */
  children?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-8 pb-6 pt-7">
      <div className="min-w-0">
        {back && (
          <Link
            to={back.to}
            onClick={onBack}
            className="mb-1.5 inline-flex items-center gap-1 text-small text-text-secondary transition-colors hover:text-text-primary"
          >
            <ChevronLeft size={14} aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="truncate text-title font-semibold leading-7 tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-body text-text-secondary">{subtitle}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  )
}
