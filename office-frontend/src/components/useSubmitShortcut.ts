import { useEffect, useRef } from 'react'
import { isSubmitShortcut } from '../lib/shortcuts'

/**
 * Finishes a full screen mask from the keyboard.
 *
 * <p>Binds Ctrl+S and Ctrl+Enter (⌘ on a Mac) to the primary action, so a mask can be filled
 * in and closed without reaching for the mouse. The browser's own «save page» is suppressed,
 * which is the whole reason this listens on the document rather than on a form element.
 *
 * <p><b>Stands down while a dialog is open.</b> A dialog draws over the mask and carries its
 * own primary button; without this, Ctrl+S inside the dialog would save the mask behind it.
 * Dialogs bind the same keys themselves, scoped to their own box.
 *
 * <p>Passing `undefined` unbinds, which is how a mask says «nothing to save here»: no write
 * permission, a request already running, a form that would be refused anyway.
 *
 * @param onSubmit the primary action, `undefined` while there is none
 */
export function useSubmitShortcut(onSubmit: (() => void) | undefined): void {
  // Held in a ref, not as a dependency: a mask builds its handler inline and re-renders on
  // every keystroke, and re-binding per character would be pure waste.
  const action = useRef(onSubmit)
  useEffect(() => {
    action.current = onSubmit
  }, [onSubmit])

  const bound = onSubmit !== undefined
  useEffect(() => {
    if (!bound) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSubmitShortcut(event)) return
      // A dialog over the mask owns the keyboard, including this shortcut.
      if (document.querySelector('[role="dialog"]') !== null) return
      event.preventDefault()
      action.current?.()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [bound])
}
