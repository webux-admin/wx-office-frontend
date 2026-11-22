import { Check, Minus } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Tooltip } from './Tooltip'

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string
  /** One line under the label saying what turning it on means. */
  hint?: ReactNode
  /** Explains the switch behind an icon next to the label. See {@link Tooltip}. */
  tooltip?: ReactNode
  /**
   * Reads the label out but does not draw it.
   *
   * <p>For a box in a table row or a table head, where the column already says what is being
   * ticked and only a screen reader still needs the sentence — «Rechnung R-2026-0142
   * markieren». The label stays in the tree, so the association and the click target are the
   * same as everywhere else.
   */
  labelHidden?: boolean
  /**
   * Neither on nor off: some of what this box stands for is ticked.
   *
   * <p>A DOM property and never an attribute, so it is set on the element itself. Without it a
   * head box would have to claim «alle» or «keine» about a page where neither is true.
   */
  indeterminate?: boolean
}

/**
 * A labelled switch for a yes or no decision.
 *
 * <p>The native checkbox stays in the tree and only becomes invisible: it carries focus, the
 * keyboard and the label association, while the drawn box next to it is what the user sees.
 */
export function CheckboxField({
  label,
  hint,
  tooltip,
  labelHidden = false,
  indeterminate = false,
  className = '',
  ...rest
}: CheckboxFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const tooltipId = `${id}-tooltip`
  const marked = indeterminate || rest.checked === true

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <span className="relative mt-px grid size-checkbox shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          ref={(element) => {
            if (element) element.indeterminate = indeterminate
          }}
          aria-describedby={
            [hint && !labelHidden ? hintId : '', tooltip !== undefined ? tooltipId : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden
          // The fill is named once per state, never both: two background utilities on one
          // element are decided by their order in the stylesheet, and there `bg-surface` comes
          // after `bg-accent` — a ticked box came out white with a white tick on it.
          className={`pointer-events-none grid size-checkbox place-items-center rounded-[var(--radius-xs)] border text-on-accent transition-colors peer-focus-visible:outline peer-focus-visible:outline-[0.125rem] peer-focus-visible:outline-offset-[0.125rem] peer-focus-visible:outline-accent-text peer-disabled:opacity-50 ${
            marked
              ? 'border-accent bg-accent'
              : 'border-line bg-surface peer-checked:border-accent peer-checked:bg-accent'
          }`}
        >
          <motion.span
            initial={false}
            animate={{ scale: marked ? 1 : 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="grid place-items-center"
          >
            {indeterminate ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
          </motion.span>
        </span>
      </span>

      {labelHidden ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : (
        <span className="min-w-0">
          <label htmlFor={id} className="cursor-pointer text-body text-text-primary">
            {label}
          </label>
          {tooltip !== undefined && (
            <span className="ml-1">
              <Tooltip text={tooltip} label={`Hinweis zu ${label}`} id={tooltipId} />
            </span>
          )}
          {hint && (
            <span id={hintId} className="mt-0.5 block text-small text-text-secondary">
              {hint}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
