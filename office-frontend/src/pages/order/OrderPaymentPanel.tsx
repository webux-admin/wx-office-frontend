import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatAmount, formatDate } from '../../lib/format'
import type { SalesDocument } from '../../lib/types'
import { PaymentTermSelect } from '../../masterdata/PaymentTermSelect'

/**
 * What was agreed about paying.
 *
 * <p>A draft may still be changed: the term is chosen from the master data, and the due date
 * is the exception to it — what was agreed in this one case, when it differs from what the
 * term says. Leaving the date empty lets the term decide it.
 *
 * <p>The printed sentence and the discount amounts appear only once the document is issued,
 * because they name figures that the final total settles (ADR-0027).
 *
 * <p>"Ohne Kondition" is a real answer, not an empty field: what is sent replaces the whole
 * agreement, so choosing it takes a term off again (ADR-0037).
 */
export function OrderPaymentPanel({
  tenantId,
  base,
  document,
  editable,
  readOnlyNote,
  onChanged,
}: {
  tenantId: number
  /** Path of the document, without a trailing slash. */
  base: string
  document: SalesDocument
  /** False once the document is issued, and while the write permission is missing. */
  editable: boolean
  /** Why nothing can be changed here, where that is not the state of the document itself. */
  readOnlyNote?: string
  /** Called with the document the backend answered with. */
  onChanged: (document: SalesDocument) => void
}) {
  const [paymentTerm, setPaymentTerm] = useState(document.paymentTerm ?? '')
  const [dueDate, setDueDate] = useState(document.dueDate ?? '')

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`${base}/payment`, {
        // Both always travel: the payload is the whole agreement, so an empty term is how
        // the document is written without one.
        paymentTerm: paymentTerm === '' ? undefined : paymentTerm,
        dueDate: dueDate === '' ? undefined : dueDate,
      }),
    onSuccess: onChanged,
  })

  const unchanged =
    paymentTerm === (document.paymentTerm ?? '') && dueDate === (document.dueDate ?? '')

  // Nothing to show and nothing to set: a tenant without payment terms writes documents
  // without one, and an issued document that carries none has no section to fill. A draft
  // somebody may not change is a different case — there the reason has to be readable.
  if (!editable && !document.paymentTerm && readOnlyNote === undefined) return null

  return (
    <Panel
      title="Zahlung"
      description={
        editable
          ? 'Beim Anlegen aus dem Kunden übernommen, im Entwurf änderbar.'
          : (readOnlyNote ?? 'Kopie aus den Stammdaten, festgehalten beim Anlegen.')
      }
      action={
        editable ? (
          <Button
            variant="secondary"
            onClick={() => save.mutate()}
            busy={save.isPending}
            disabled={unchanged}
          >
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      {editable ? (
        <div className="grid gap-4">
          <PaymentTermSelect
            label="Zahlungskondition"
            tenantId={tenantId}
            value={paymentTerm}
            onChange={setPaymentTerm}
            storedLabel={document.paymentTermName}
            emptyLabel="Ohne Kondition"
            hint="Bestimmt Fälligkeit und Skonto. Die Staffeln erscheinen beim Ausstellen."
          />
          <TextField
            label="Fällig am"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            hint="Leer lassen, dann rechnet die Kondition die Fälligkeit aus."
          />
        </div>
      ) : (
        <dl className="grid gap-2.5 text-[13px]">
          <div className="flex gap-3">
            <dt className="w-[112px] shrink-0 text-text-tertiary">Kondition</dt>
            <dd>{document.paymentTermName ?? document.paymentTerm ?? 'Ohne Kondition'}</dd>
          </div>
          {document.dueDate && (
            <div className="flex gap-3">
              <dt className="w-[112px] shrink-0 text-text-tertiary">Fällig am</dt>
              <dd className="font-mono tabular-nums">{formatDate(document.dueDate)}</dd>
            </div>
          )}
          {document.paymentReference && (
            <div className="flex gap-3">
              <dt className="w-[112px] shrink-0 text-text-tertiary">Referenz</dt>
              <dd className="font-mono text-[12px] tabular-nums">{document.paymentReference}</dd>
            </div>
          )}
        </dl>
      )}

      {document.discountStages && document.discountStages.length > 0 && (
        <ul className="mt-4 grid gap-1.5 border-t border-line-subtle pt-3 text-[13px]">
          {document.discountStages.map((stage) => (
            <li key={stage.days} className="flex items-baseline justify-between gap-3">
              <span className="text-text-secondary">
                {stage.percent}% bis {formatDate(stage.discountDate)}
              </span>
              <span className="font-mono tabular-nums">
                {formatAmount(stage.amountAfterDiscount)}{' '}
                <span className="text-text-tertiary">{document.currency}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {document.paymentTermText && (
        <p className="mt-4 border-t border-line-subtle pt-3 text-[12px] text-text-secondary">
          {document.paymentTermText}
        </p>
      )}

      {save.error !== null && (
        <div className="mt-4">
          <ErrorNotice error={save.error} />
        </div>
      )}
    </Panel>
  )
}
