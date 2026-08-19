import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string
  /** One line under the label saying what turning it on means. */
  hint?: ReactNode
}

/**
 * A labelled switch for a yes or no decision.
 *
 * <p>The native checkbox stays in the tree and only becomes invisible: it carries focus, the
 * keyboard and the label association, while the drawn box next to it is what the user sees.
 */
export function CheckboxField({ label, hint, className = '', ...rest }: CheckboxFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <span className="relative mt-px grid h-[18px] w-[18px] shrink-0 place-items-center">
        <input
          id={id}
          type="checkbox"
          aria-describedby={hint ? hintId : undefined}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden
          className="pointer-events-none grid h-[18px] w-[18px] place-items-center rounded-[5px] border border-line bg-surface text-white transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text peer-disabled:opacity-50"
        >
          <motion.span
            initial={false}
            animate={{ scale: rest.checked ? 1 : 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="grid place-items-center"
          >
            <Check size={12} strokeWidth={3} />
          </motion.span>
        </span>
      </span>

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
    </div>
  )
}
