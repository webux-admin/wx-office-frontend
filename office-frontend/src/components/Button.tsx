import { motion, type HTMLMotionProps } from 'motion/react'
import type { ReactNode } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:hover:bg-accent',
  secondary:
    'bg-surface text-text-primary border border-line hover:bg-sunken disabled:hover:bg-surface',
  ghost: 'text-text-secondary hover:bg-sunken hover:text-text-primary',
}

/**
 * Props of {@link Button}.
 *
 * <p>Built on `HTMLMotionProps` rather than `ButtonHTMLAttributes`, because motion replaces
 * a handful of DOM handlers such as `onDrag` with its own gesture callbacks.
 */
type ButtonProps = HTMLMotionProps<'button'> & {
  variant?: Variant
  /** Replaces the label with a spinner and blocks further clicks. */
  busy?: boolean
  /** Stretches the button to the width of its container. */
  block?: boolean
  children: ReactNode
}

/**
 * The three button variants of the design system.
 *
 * <p>While `busy` the label stays in the layout as invisible text, so the button keeps its
 * width and the surrounding form does not jump when a request starts.
 */
export function Button({
  variant = 'primary',
  busy = false,
  block = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled || busy ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      disabled={disabled || busy}
      aria-busy={busy}
      className={`relative inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      <span className={busy ? 'invisible inline-flex items-center gap-2' : 'inline-flex items-center gap-2'}>
        {children}
      </span>
      {busy && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} label="Wird gesendet" />
        </span>
      )}
    </motion.button>
  )
}
