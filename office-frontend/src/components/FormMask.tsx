import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from './PageHeader'
import { Tabs, type TabItem } from './Tabs'
import { useLeaveGuard } from './useLeaveGuard'
import { useSubmitShortcut } from './useSubmitShortcut'

type FormMaskProps<Id extends string> = {
  title: string
  /** Under the title: the number of the record, its badges, or a sentence for a new one. */
  subtitle?: ReactNode
  /** Where the mask was opened from. Escape, the back link and cancel all lead there. */
  back: { to: string; label: string }
  /** The buttons on the right of the header, the primary one last. */
  actions?: ReactNode
  /**
   * The line of facts under the header that answers the usual look-up without a click: for a
   * customer the address, the contact person and the phone number.
   */
  summary?: ReactNode
  /** The registers of a stored record. A new record usually has none. */
  tabs?: { items: TabItem<Id>[]; active: Id; onChange: (id: Id) => void }
  /** Whether leaving would throw away changes, which makes Escape and the back link ask. */
  dirty: boolean
  /**
   * The primary action, bound to Ctrl+S and Ctrl+Enter. `undefined` while there is nothing
   * to save: no write permission, or a request already running.
   */
  onSubmit?: () => void
  children: ReactNode
}

/**
 * The frame of a full screen mask: header with the way back and the actions, an optional line
 * of facts, the registers and the content.
 *
 * <p>The keyboard behaves the same in every mask built on it. Ctrl+S and Ctrl+Enter save;
 * Escape cancels and goes back to where the mask was opened from. With unsaved changes, Escape
 * and the back link first ask whether they should be thrown away; without, they leave at once.
 * While a dialog is open, the dialog has the keyboard and the mask stays out of it.
 *
 * <p>Only Escape and the back link are guarded. A click in the sidebar leaves without the
 * question — that would need a data router, see ADR-0048.
 */
export function FormMask<Id extends string>({
  title,
  subtitle,
  back,
  actions,
  summary,
  tabs,
  dirty,
  onSubmit,
  children,
}: FormMaskProps<Id>) {
  const navigate = useNavigate()

  useSubmitShortcut(onSubmit)
  const { onBack, question } = useLeaveGuard(dirty, () => void navigate(back.to))

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} back={back} onBack={onBack}>
        {actions}
      </PageHeader>

      <div className="px-8 pb-12">
        {summary && <div className="-mt-2 mb-6">{summary}</div>}
        {tabs && (
          <Tabs tabs={tabs.items} active={tabs.active} onChange={tabs.onChange} label="Register" />
        )}
        {children}
      </div>

      {question}
    </>
  )
}
