import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

/** One entry of the menu behind the arrow. */
export type SplitButtonAction = {
  /** Stable key, also used to tell the entries apart. */
  id: string
  label: string
  /** One line under the label saying what the entry does. */
  hint?: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /**
   * Draws a rule **above** this entry, to set a group off from the one before it.
   *
   * <p>A rule on an entry and not an entry of its own. A `{kind: 'separator'}` inside `actions`
   * would have to be skipped by `items.current`, by `actions.length` and by both pieces of
   * arrow-key arithmetic — four places for an off-by-one, in exchange for a line. This way the
   * whole calculation stays untouched.
   */
  separatorBefore?: boolean
}

type SplitButtonProps = {
  /** What the left half does — the way most people take. */
  children: ReactNode
  onClick: () => void
  /** The other ways, shown behind the arrow. */
  actions: SplitButtonAction[]
  /** What a screen reader calls the arrow, for example «Weitere Wege zum Auftrag». */
  menuLabel: string
  /** Switches both halves off. */
  disabled?: boolean
  /**
   * Switches only the left half off; the arrow and its menu stay live.
   *
   * <p>For the case where the usual way has nothing to work on yet while the menu behind the
   * arrow still holds the way to get there. The entry mask is the one it was built for: with no
   * posting template there is nothing to apply, but «Als Vorlage speichern …» sits behind the
   * arrow and is the only way to a first one. A wholly disabled button would bolt the mask shut.
   */
  primaryDisabled?: boolean
  /**
   * One line at the head of the menu, for what an empty menu has to say for itself.
   *
   * <p>A `<p role="presentation">` and no entry: it takes no focus, is not in `items.current`
   * and the arrow keys walk straight past it. A disabled entry would not do — the menu moves the
   * focus onto the highlighted entry, a disabled button takes none, and the walk would stick.
   */
  note?: string
  busy?: boolean
}

const MENU = { duration: 0.15, ease: [0.16, 1, 0.3, 1] as const }

/**
 * One primary action with the rarer ways to the same goal behind an arrow.
 *
 * <p>Used where a screen has three ways to do one thing and only one of them is the usual
 * one. Three buttons side by side would claim three times the attention and leave the reader
 * to work out which is the normal case; a dialog in front of every one of them would slow the
 * common way down as well. So: the common way stays a single click, the others cost a second.
 *
 * <p>The menu is operated the way a menu is expected to be: arrow keys walk it, Enter picks,
 * Escape closes and hands focus back to the arrow, and a click elsewhere closes it too.
 */
export function SplitButton({
  children,
  onClick,
  actions,
  menuLabel,
  disabled = false,
  primaryDisabled = false,
  note,
  busy = false,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  // Focus follows the highlighted entry, so the screen reader announces what the arrow keys
  // move over instead of staying on the button that opened the menu.
  useEffect(() => {
    if (open) items.current[active]?.focus()
  }, [open, active])

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) toggle.current?.focus()
  }

  const openAt = (index: number) => {
    setActive(index)
    setOpen(true)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % actions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + actions.length) % actions.length)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActive(actions.length - 1)
    }
  }

  const pick = (action: SplitButtonAction) => {
    close(false)
    action.onSelect()
  }

  return (
    <div ref={box} className="relative inline-flex">
      <Button
        onClick={onClick}
        disabled={disabled || primaryDisabled}
        busy={busy}
        // The two halves read as one control: the seam between them is a rule, not a gap.
        className="rounded-r-none"
      >
        {children}
      </Button>

      <button
        ref={toggle}
        type="button"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openAt(0)
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(actions.length - 1)
          }
        }}
        className="inline-flex h-9 items-center justify-center rounded-r-[var(--radius-md)] border-l border-on-accent/25 bg-accent px-2 text-on-accent transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-accent"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          initial={false}
          transition={reduceMotion ? { duration: 0 } : MENU}
          className="grid place-items-center"
        >
          <ChevronDown size={15} aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={menuLabel}
            onKeyDown={onMenuKeyDown}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : MENU}
            className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[260px] overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-[var(--shadow-card)]"
          >
            {note !== undefined && (
              // role="presentation" and not a heading: it is neither a step of the menu nor a
              // title over the entries, only a sentence saying why there are so few of them.
              <p
                role="presentation"
                className="px-3 py-2 text-[12px] text-text-secondary"
              >
                {note}
              </p>
            )}
            {actions.map((action, index) => (
              <button
                key={action.id}
                ref={(element) => {
                  items.current[index] = element
                }}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                data-separator={action.separatorBefore ? 'true' : undefined}
                onClick={() => pick(action)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.separatorBefore ? 'mt-1 border-t border-line-subtle pt-2.5' : ''
                } ${index === active ? 'bg-sunken' : ''}`}
              >
                {action.icon && (
                  <span className="mt-px shrink-0 text-text-tertiary" aria-hidden>
                    {action.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-[13px] text-text-primary">{action.label}</span>
                  {action.hint && (
                    <span className="mt-0.5 block text-[12px] text-text-secondary">
                      {action.hint}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
