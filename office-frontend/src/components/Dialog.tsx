import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react'
import { isCancelShortcut, isSubmitShortcut } from '../lib/shortcuts'
import { Button } from './Button'
import { DialogContext } from './dialogContext'
import { enterDialog } from './dialogStack'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /**
   * Buttons at the foot, on a rule. The cancel button is a {@link DialogCancelButton}, so it
   * asks before throwing changes away just like Escape does.
   */
  footer?: ReactNode
  /**
   * The primary action, bound to Ctrl+S and Ctrl+Enter while the box is open — the same
   * thing the primary button in the foot does. Left out where the box only asks something
   * and has nothing to save.
   */
  onSubmit?: () => void
  /**
   * Whether closing would throw away changes. Left out, the dialog finds out by itself: once
   * anything inside it has been typed, ticked or picked, it counts as changed. A caller that
   * knows better — a search box that holds nothing worth keeping — says so here.
   */
  dirty?: boolean
  /** Wider box for a dialog holding a form rather than a question. */
  wide?: boolean
  /**
   * Where the focus lands when the box opens. Without it the first field in the box takes it,
   * and where there is no field, the close button.
   */
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}

/** What can take the focus inside the box. */
const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]'

/** What a user types into, the first of which is where a form dialog opens. */
const FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'

/**
 * A window over the screen for a question or a short form.
 *
 * <p>Keeps the keyboard inside while it is open: focus moves into the box, Ctrl+S and
 * Ctrl+Enter run its primary action, and the element that opened it gets focus back
 * afterwards, because otherwise the next Tab would start again at the top of the page.
 *
 * <p><b>Cancelling asks when there is something to lose.</b> Escape, the close button, a click
 * on the backdrop and the {@link DialogCancelButton} all go the same way: with nothing changed
 * the box closes at once, with changes it first asks whether they should be thrown away. This
 * lives here and not in the masks, so every dialog of the application behaves the same.
 *
 * <p>Only the dialog on top hears the keyboard. A key that a control inside has already taken —
 * Escape closing an open list, for instance — is left alone: the control marks it with
 * `preventDefault`.
 *
 * <p>A box that is closing takes nothing any more. It stays on screen for the length of its
 * fade, and everything in it — buttons, fields, the backdrop — is locked for that whole time,
 * while the page underneath stays covered until the box is gone.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  onSubmit,
  dirty,
  wide = false,
  initialFocus,
  children,
}: DialogProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  // The box is on screen longer than `open` is true: it is still fading out afterwards. That
  // is state of its own, adjusted here during render rather than in an effect — an effect
  // would set it one frame after the frame that already has to draw the box, and the focus
  // below would then look for a panel that is not in the tree yet.
  const [showing, setShowing] = useState(open)
  if (open && !showing) setShowing(true)

  // Whether something inside was changed since the box opened, and whether the question about
  // throwing it away is on screen. Both start over each time the box opens.
  const [touched, setTouched] = useState(false)
  const [asking, setAsking] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setTouched(false)
      setAsking(false)
    }
  }

  const changed = dirty ?? touched

  // Held in refs rather than as dependencies of the effect below. A caller that builds its
  // handlers inline gives them a new identity on every render, and a mask whose form state
  // sits above the dialog re-renders on every keystroke — the effect would then tear down and
  // run again after each character, moving the focus out of the field.
  const close = useRef(onClose)
  const submit = useRef(onSubmit)
  const hasChanges = useRef(changed)
  useEffect(() => {
    close.current = onClose
    submit.current = onSubmit
    hasChanges.current = changed
  }, [onClose, onSubmit, changed])

  const context = useMemo(
    () => ({
      requestClose: () => {
        if (hasChanges.current) setAsking(true)
        else close.current()
      },
    }),
    [],
  )

  useEffect(() => {
    if (!open) return

    const layer = enterDialog()
    opener.current = document.activeElement as HTMLElement | null
    const first =
      initialFocus?.current ??
      panel.current?.querySelector('[data-dialog-body]')?.querySelector<HTMLElement>(FIELD) ??
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (!layer.isTop() || event.defaultPrevented) return
      if (isCancelShortcut(event)) {
        event.preventDefault()
        context.requestClose()
        return
      }
      // Ctrl+S would otherwise be the browser offering to save the page, so this both takes
      // the press and suppresses that.
      if (submit.current !== undefined && isSubmitShortcut(event)) {
        event.preventDefault()
        submit.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      // Without this the focus walks on into the page behind, which is still rendered.
      const stops = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (stops.length === 0) return
      const firstStop = stops[0]
      const lastStop = stops[stops.length - 1]
      if (event.shiftKey && document.activeElement === firstStop) {
        event.preventDefault()
        lastStop.focus()
      } else if (!event.shiftKey && document.activeElement === lastStop) {
        event.preventDefault()
        firstStop.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      layer.release()
      opener.current?.focus()
    }
  }, [open, initialFocus, context])

  // Anything typed, ticked or picked inside the box counts as a change. A dialog opened from
  // inside this one is its own business: its fields say nothing about this box.
  const noteChange = (event: SyntheticEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('[role="dialog"]') !== panel.current) return
    if (!touched) setTouched(true)
  }

  // Nothing at all once the fade is over: a dialog nobody opened leaves no element behind that
  // could catch a click, take the focus or stand in a layout.
  if (!showing) return null

  return (
    <DialogContext.Provider value={context}>
      {/* The lock sits outside AnimatePresence, and that is the whole point. Inside it would
          never be reached: while a box fades out, AnimatePresence keeps drawing the children
          it remembered, with the props of the render before `open` fell. Anything that
          changes after that never gets to them — which is why the button under a double click
          was live again and put the same position on the document twice.

          What `inert` is for is the keyboard: it takes the whole subtree out of the tab order,
          off the focus and past every keystroke, so the two presses of Enter that a held key
          sends do not reach a button that is on its way out. For the pointer it is no stronger
          than `pointer-events: none` — the standard has hit testing on an inert node act "as
          if the pointer-events CSS property were set to none". That costs the backdrop its one
          job: a click meant for the fading box falls through to the page underneath, where it
          lands on whatever control happens to be there. The shield below takes that click, and
          `inert` cannot stand in for it.

          `contents` keeps the wrapper out of the layout — it generates no box of its own, so a
          caller that draws a dialog inside a flex or grid gets no empty cell for it. */}
      <div className="contents" inert={!open}>
        <AnimatePresence
          onExitComplete={() => {
            if (!open) setShowing(false)
          }}
        >
          {open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={context.requestClose}
                className="absolute inset-0 bg-ink/50"
              />

              <motion.div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onInputCapture={noteChange}
                onChangeCapture={noteChange}
                initial={{ opacity: 0, y: 10, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.99 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={`relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-card ${
                  wide ? 'max-w-dialog-wide' : 'max-w-dialog'
                }`}
              >
                <header className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 id={titleId} className="text-heading font-semibold tracking-tight">
                      {title}
                    </h2>
                    {description && (
                      <p className="mt-0.5 text-small text-text-secondary">{description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={context.requestClose}
                    aria-label="Schliessen"
                    className="grid size-icon-button shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
                  >
                    <X size={15} />
                  </button>
                </header>

                <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {children}
                </div>

                {footer && (
                  <footer className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
                    {footer}
                  </footer>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* The shield, and it is only ever there while the box fades: nothing to see, nothing to
          read out and no handler on it — a bare hit target over the whole screen, so a click
          that the inert backdrop no longer catches ends here instead of on a control on the
          page. It stands after the locked subtree and on the same layer, which puts it on top
          of the box, and outside that subtree, or it would be inert itself and let the click
          through exactly like the backdrop it stands in for. */}
      {!open && <div aria-hidden data-dialog-shield="true" className="fixed inset-0 z-50" />}

      <DiscardQuestion
        open={open && asking}
        onKeep={() => setAsking(false)}
        onDiscard={() => {
          setAsking(false)
          close.current()
        }}
      />
    </DialogContext.Provider>
  )
}

/**
 * The question before changes are thrown away.
 *
 * <p>Focus lands on «Weiter bearbeiten»: an Enter pressed out of habit keeps the work. Escape
 * on this question answers it the same way, it goes back to the form.
 */
export function DiscardQuestion({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
}) {
  const keep = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onClose={onKeep}
      dirty={false}
      title="Änderungen verwerfen?"
      initialFocus={keep}
      footer={
        <>
          <Button ref={keep} variant="secondary" onClick={onKeep}>
            Weiter bearbeiten
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Verwerfen
          </Button>
        </>
      }
    >
      <p className="text-body text-text-secondary">
        Was hier geändert wurde, ist noch nicht gespeichert und geht verloren.
      </p>
    </Dialog>
  )
}
