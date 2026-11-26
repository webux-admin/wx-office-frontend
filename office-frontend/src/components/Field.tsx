import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Tooltip } from './Tooltip'

/**
 * What every labelled control adds to its own props, the same for a text field, a dropdown
 * and a text area.
 */
export type FieldExtras = {
  /** Marks the field as one that must be filled; the label carries a visible star. */
  required?: boolean
  /**
   * The message for this field, drawn under it in the error colour and announced. Marks the
   * field as wrong as well.
   */
  error?: string
  /** Explains the field behind an icon next to the label. See {@link Tooltip}. */
  tooltip?: ReactNode
  /**
   * Shows a lock next to the label, with this sentence behind it. For a value that is fixed
   * once the record exists, so nobody wonders why the field does not take input.
   */
  locked?: string
}

type FieldProps = FieldExtras & {
  label: string
  /** Id of the control inside, so the label points at it. */
  htmlFor: string
  /**
   * Id of the label, for a control the label cannot point at with `for` — an editable box names
   * it in `aria-labelledby` instead.
   */
  labelId?: string
  /** What a click on the label does where the browser does nothing: focus such a control. */
  onLabelClick?: () => void
  /** Id the control names in `aria-describedby` for the hint or the error under it. */
  hintId?: string
  /** Id the control names in `aria-describedby` for the tooltip text. */
  tooltipId?: string
  hint?: ReactNode
  invalid?: boolean
  /** Drawn while the control inside has focus. */
  focused?: boolean
  className?: string
  children: ReactNode
}

/**
 * The frame every form control of the design system sits in: label above, box around,
 * message below.
 *
 * <p>An error wins over a hint: when something is wrong, that is the one line worth reading
 * under the field.
 *
 * <p>The focus state is drawn as a line growing from the centre rather than an outline that
 * appears at once: it points at the field that just took focus without adding a second box to
 * the form. Keyboard users keep the browser ring through `:focus-visible` on the control.
 */
export function Field({
  label,
  htmlFor,
  labelId,
  onLabelClick,
  hintId,
  tooltipId,
  hint,
  invalid = false,
  focused = false,
  required = false,
  error,
  tooltip,
  locked,
  className = '',
  children,
}: FieldProps) {
  const wrong = invalid || error !== undefined
  const below = error ?? hint

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1">
        <label
          id={labelId}
          htmlFor={htmlFor}
          onClick={onLabelClick}
          className="text-small font-medium text-text-secondary"
        >
          {label}
        </label>
        {/* Beside the label rather than in it: the accessible name stays the plain label, and
            `aria-required` on the control already tells a screen reader. */}
        {required && (
          <span aria-hidden className="-ml-0.5 text-small text-danger">
            *
          </span>
        )}
        {locked !== undefined && (
          <Tooltip text={locked} label={`${label}: nicht änderbar`} icon="lock" />
        )}
        {tooltip !== undefined && (
          <Tooltip text={tooltip} label={`Hinweis zu ${label}`} id={tooltipId} />
        )}
      </div>

      <div
        className={`relative flex items-center overflow-hidden rounded-[var(--radius-md)] border bg-surface transition-colors duration-150 ${
          wrong
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
          className={`absolute inset-x-0 bottom-0 h-0.5 origin-center ${
            wrong ? 'bg-danger' : 'bg-accent'
          }`}
        />
      </div>

      {below !== undefined && below !== null && below !== false && (
        <p
          id={hintId}
          aria-live={error !== undefined ? 'polite' : undefined}
          className={`mt-1.5 text-small ${wrong ? 'text-danger' : 'text-text-secondary'}`}
        >
          {below}
        </p>
      )}
    </div>
  )
}
