import type { ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { DialogCancelButton } from './DialogCancelButton'
import { ErrorNotice } from './Notice'

/**
 * A question before an action that changes the state of a record: deactivate, remove, release.
 *
 * <p>Says in one or two sentences what will happen, offers cancel and the action, and shows the
 * answer of the backend in the box when the action fails, so nobody has to guess whether it
 * went through. Ctrl+Enter confirms, Escape cancels.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  error = null,
  tone = 'primary',
  children,
}: {
  open: boolean
  title: string
  /** The wording of the action button, a verb: «Deaktivieren», «Entfernen». */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** What the last attempt threw, shown in the box. */
  error?: unknown
  /** `danger` for an action that removes something for good. */
  tone?: 'primary' | 'danger'
  /** What will happen, in a sentence or two. */
  children: ReactNode
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      dirty={false}
      onSubmit={busy ? undefined : onConfirm}
      footer={
        <>
          <DialogCancelButton />
          <Button variant={tone} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-body text-text-secondary">{children}</div>
      {error !== null && error !== undefined && (
        <div className="mt-4">
          <ErrorNotice error={error} />
        </div>
      )}
    </Dialog>
  )
}
