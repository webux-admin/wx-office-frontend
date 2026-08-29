import { Check, Minus } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string
  /** One line under the label saying what turning it on means. */
  hint?: ReactNode
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
  labelHidden = false,
  indeterminate = false,
  className = '',
  ...rest
}: CheckboxFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const marked = indeterminate || rest.checked === true

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <span className="relative mt-px grid h-[18px] w-[18px] shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          ref={(element) => {
            if (element) element.indeterminate = indeterminate
          }}
          aria-describedby={hint && !labelHidden ? hintId : undefined}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden
          className={`pointer-events-none grid h-[18px] w-[18px] place-items-center rounded-[5px] border bg-surface text-on-accent transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text peer-disabled:opacity-50 ${
            marked
              ? 'border-accent bg-accent'
              : 'border-line peer-checked:border-accent peer-checked:bg-accent'
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
          <label htmlFor={id} className="cursor-pointer text-[13px] text-text-primary">
            {label}
          </label>
          {hint && (
            <span id={hintId} className="mt-0.5 block text-[12px] text-text-secondary">
              {hint}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
