import { createContext } from 'react'

/**
 * What a dialog offers to the controls inside it.
 *
 * <p>`requestClose` is the cancel of the dialog: it closes straight away when nothing was
 * changed and asks first when something was. A cancel button in the foot goes through it, so
 * it behaves exactly like Escape and the close button.
 */
export const DialogContext = createContext<{ requestClose: () => void } | null>(null)
