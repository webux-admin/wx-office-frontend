import { motion } from 'motion/react'
import type { ReactNode } from 'react'

type FieldProps = {
  label: string
  /** Id of the control inside, so the label points at it. */
  htmlFor: string
  /** Id the control names in `aria-describedby`; only used when there is a hint. */
  hintId?: string
  hint?: ReactNode
  invalid?: boolean
  /** Drawn while the control inside has focus. */
  focused?: boolean
  className?: string
  children: ReactNode
}

/**
 * The frame every form control of the design system sits in: label above, box around,
 * explanation below.
 *
 * <p>The focus state is drawn as a line growing from the centre rather than an outline that
 * appears at once: it points at the field that just took focus without adding a second box to
 * the form. Keyboard users keep the browser ring through `:focus-visible` on the control.
 */
export function Field({
  label,
  htmlFor,
  hintId,
  hint,
  invalid = false,
  focused = false,
  className = '',
  children,
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-text-secondary">
        {label}
      </label>

      <div
        className={`relative flex items-center overflow-hidden rounded-[var(--radius-md)] border bg-surface transition-colors duration-150 ${
          invalid
            ? 'border-danger'
            : focused
              ? 'border-accent'
              : 'border-line hover:border-text-tertiary'
        }`}
      >
        {children}

        <motion.span
          aria-hidden
          initial={false}
          animate={{ scaleX: focused ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute inset-x-0 bottom-0 h-[2px] origin-center ${
            invalid ? 'bg-danger' : 'bg-accent'
          }`}
        />
      </div>

      {hint && (
        <p id={hintId} className={`mt-1.5 text-[12px] ${invalid ? 'text-danger' : 'text-text-secondary'}`}>
          {hint}
        </p>
      )}
    </div>
  )
}
