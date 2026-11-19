import { useContext } from 'react'
import { Button } from './Button'
import { DialogContext } from './dialogContext'

/**
 * The cancel button in the foot of a dialog.
 *
 * <p>Cancels the way Escape does: closes at once when nothing was changed, asks before throwing
 * changes away otherwise. Outside a dialog it does nothing, which is why it is only ever put
 * into a dialog's `footer`.
 */
export function DialogCancelButton({ label = 'Abbrechen' }: { label?: string }) {
  const dialog = useContext(DialogContext)
  return (
    <Button variant="secondary" onClick={() => dialog?.requestClose()}>
      {label}
    </Button>
  )
}
