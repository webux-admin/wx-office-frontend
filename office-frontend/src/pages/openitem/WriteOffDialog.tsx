import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { formatAmount, toIsoDate } from '../../lib/format'
import {
  WRITE_OFF_REASONS,
  WRITE_OFF_REASON_HINTS,
  WRITE_OFF_REASON_ORDER,
  recordWriteOff,
} from '../../lib/openItem'
import type { WriteOffReason } from '../../lib/types'
import {
  proposedWriteOff,
  toWriteOffPayload,
  writeOffComplaint,
  type WriteOffForm,
} from './writeOffForm'

/**
 * Gives up part or all of one receivable.
 *
 * <p><b>Not the payment dialog with another kind in the picker.</b> A payment carries a value
 * date — the day the money was valued — and allows more than is open, because twenty rappen
 * too much is a credit and not an error. A write-off carries a <b>booking date</b>, which
 * decides the period the tax correction lands in (MWSTG Art. 41 Abs. 1), and giving up more
 * than is open means nothing. Two operations, two dialogs (backend ADR-0101).
 *
 * <p>The rate of the correction comes from the original invoice and the period from the
 * booking date. Both are worked out by the backend; this dialog sends the date and shows what
 * it means.
 *
 * @param open      what is still open on the Rechnung, for the pre-fill and the ceiling
 * @param onWritten called after a write-off was stored, so the caller can refresh its lists
 */
export function WriteOffDialog({
  open,
  tenantId,
  documentId,
  documentNumber,
  currency,
  openAmount,
  keepLimit,
  keepMaximum,
  initialReason,
  onClose,
  onWritten,
}: {
  open: boolean
  tenantId: number
  documentId: number
  documentNumber?: string
  currency: string
  openAmount: number | undefined
  /** Above this a kept overpayment needs a note; the server refuses it without one. */
  keepLimit?: number
  /** Above this a kept overpayment is refused outright. */
  keepMaximum?: number
  /** What the dialog starts on; the overpayment case opens straight on its reason. */
  initialReason?: WriteOffReason
  onClose: () => void
  onWritten: () => void
}) {
  const [form, setForm] = useState<WriteOffForm>(
    () => proposedWriteOff(openAmount, undefined, initialReason))
  const today = toIsoDate()

  // Adjusted while rendering rather than in an effect: what the dialog shows follows the
  // Rechnung it was opened on, and that is decided outside. A dialog reopened on another
  // Rechnung must not keep the first one's amount — the pre-fill is the whole point of
  // pre-filling. Same technique as PartnerQuickSearch.
  const opened = open ? `${documentId}:${openAmount ?? ''}:${initialReason ?? ''}` : null
  const [shown, setShown] = useState<string | null>(opened)
  if (opened !== shown) {
    setShown(opened)
    if (opened !== null) setForm(proposedWriteOff(openAmount, undefined, initialReason))
  }

  const write = useMutation({
    mutationFn: () => recordWriteOff(tenantId, documentId, toWriteOffPayload(form)),
    onSuccess: () => {
      onWritten()
      onClose()
    },
  })

  const complaint = writeOffComplaint(form, openAmount, today, keepLimit, keepMaximum)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ausbuchen"
      description={`${documentNumber ?? 'Diese Rechnung'} — offen ${formatAmount(openAmount)} ${currency}. Das Buchungsdatum bestimmt die Periode der MWST-Korrektur, nicht den Wert der Zahlung.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => write.mutate()}
            busy={write.isPending}
            disabled={complaint !== null}
          >
            Ausbuchen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectField
          label="Grund"
          value={form.reason}
          onChange={(event) =>
            setForm({ ...form, reason: event.target.value as WriteOffReason })
          }
          hint={form.reason === 'UEBERZAHLUNG' && keepMaximum !== undefined
            ? `${WRITE_OFF_REASON_HINTS[form.reason]} Höchstens ${formatAmount(keepMaximum)} ${currency} — darüber bleibt der Überschuss ein Guthaben des Kunden.`
            : WRITE_OFF_REASON_HINTS[form.reason]}
        >
          {WRITE_OFF_REASON_ORDER.map((code) => (
            <option key={code} value={code}>
              {WRITE_OFF_REASONS[code]}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={`Betrag in ${currency}`}
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            inputMode="decimal"
            numeric
          />
          <TextField
            label="Buchungsdatum"
            type="date"
            max={today}
            value={form.bookingDate}
            onChange={(event) => setForm({ ...form, bookingDate: event.target.value })}
            hint="Die Periode der Korrektur. Nie in der Zukunft."
          />
        </div>

        <TextField
          label="Nachweis"
          value={form.evidence}
          onChange={(event) => setForm({ ...form, evidence: event.target.value })}
          hint="Verlustschein, Konkursanzeige, Betreibungsnummer. Freiwillig."
        />

        <TextField
          label="Bemerkung"
          value={form.note}
          onChange={(event) => setForm({ ...form, note: event.target.value })}
          hint="Steht neben dem Grund, nie statt seiner."
        />

        <p className="text-[12px] text-text-secondary">
          {WRITE_OFF_REASONS[form.reason]} wird als Vorgang festgehalten, mit der Steuerfolge je
          Satz des Ursprungsbelegs. Diese Anwendung führt kein Hauptbuch und bucht sie nicht —
          die Korrektur der Umsatzsteuer erfolgt ausserhalb.
        </p>

        {complaint !== null && (
          <p className="text-[12px] text-text-secondary" aria-live="polite">
            {complaint}
          </p>
        )}
        {write.error !== null && <ErrorNotice error={write.error} />}
      </div>
    </Dialog>
  )
}
