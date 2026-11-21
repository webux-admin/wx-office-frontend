import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { isCancelShortcut } from '../lib/shortcuts'
import { DiscardQuestion } from './Dialog'

/**
 * The one rule for leaving a mask with Escape or its back link: with unsaved changes it asks,
 * without them it leaves at once.
 *
 * <p>`abandon` runs when the question is answered with «Verwerfen». For a mask that goes back
 * to a list that is the navigation; for a mask without a place to go back to, it empties the
 * mask instead.
 *
 * <p>A dialog over the mask owns the keyboard, Escape included, so the mask does nothing then.
 * A click with a modifier on the back link opens a new tab and keeps this mask as it is.
 *
 * @param dirty whether something is typed but not saved
 * @param abandon what happens when the changes are thrown away
 * @returns the back-link handler and the question to render inside the page
 */
export function useLeaveGuard(
  dirty: boolean,
  abandon: () => void,
): { onBack: (event: MouseEvent<HTMLAnchorElement>) => void; question: ReactNode } {
  const [asking, setAsking] = useState(false)

  // Read from a ref so the keyboard listener, mounted once, always sees the current answer.
  const cancel = useRef(() => {})
  useEffect(() => {
    cancel.current = () => (dirty ? setAsking(true) : abandon())
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCancelShortcut(event) || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]') !== null) return
      event.preventDefault()
      cancel.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const onBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!dirty || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    setAsking(true)
  }

  const question = (
    <DiscardQuestion
      open={asking}
      onKeep={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false)
        abandon()
      }}
    />
  )

  return { onBack, question }
}
