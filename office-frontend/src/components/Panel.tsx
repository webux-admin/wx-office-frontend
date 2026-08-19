import type { ReactNode } from 'react'

/**
 * A titled card grouping fields or a table that belong together.
 *
 * <p>The heading is a `h2`, so a screen reader can walk a long mask by its sections instead
 * of reading every field in turn.
 */
export function Panel({
  title,
  description,
  action,
  padded = true,
  children,
  className = '',
}: {
  title?: string
  description?: string
  /** Control in the top right, for example "Adresse hinzufügen". */
  action?: ReactNode
  /** Off for a panel holding a table, which brings its own spacing. */
  padded?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-line-subtle bg-surface ${className}`}
    >
      {title && (
        <header className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold tracking-[-0.2px]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12px] text-text-secondary">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}
