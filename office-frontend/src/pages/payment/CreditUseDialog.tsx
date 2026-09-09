import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { formatAmount, toIsoDate } from '../../lib/format'
import {
  CREDIT_USE_REASONS,
  CREDIT_USE_REASON_HINTS,
  REFUND_REASON_ORDER,
  RELEASE_REASON_ORDER,
  refundCredit,
  releaseCredit,
} from '../../lib/customerCredit'
import type { CreditUseReason, CustomerCredit } from '../../lib/types'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS } from '../../lib/accounting'
import { useRunsModule } from '../../lib/modules'
import { useAuth } from '../../auth/useAuth'
import { AccountSelect } from '../accounting/AccountSelect'
import {
  MAX_IBAN_LENGTH,
  MAX_NOTE_LENGTH,
  creditUseComplaint,
  proposedUse,
  toCreditUsePayload,
  type CreditUseForm,
} from './creditForm'

/**
 * Pays a customer credit back, or releases it to income.
 *
 * <p><b>One dialog, two operations, and the reason decides which.</b> Both dispose of somebody
 * else's money without a service in return, both need a reason from a closed catalogue and a
 * booking date — only the refund names an account it went to (backend ADR-0104).
 *
 * <p>The IBAN field disappears on a release: it pays nothing out, and an account would be a
 * receipt for a payment that never happened. The database refuses it too.
 *
 * <p><b>The money account goes with the IBAN and is not the same fact.</b> The IBAN says where
 * the money went, the account says out of which of the tenant's own accounts it left — and only
 * the latter decides whether the refund is booked. A release needs neither: it books the
 * advances against income all by itself (backend ADR-0128).
 *
 * @param credit  the credit being used up, for the ceiling and the pre-fill
 * @param mode    whether this pays out or releases
 * @param onSaved called after something was stored, so the caller can refresh its lists
 */
export function CreditUseDialog({
  open,
  tenantId,
  credit,
  mode,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  credit: CustomerCredit
  mode: 'refund' | 'release'
  onClose: () => void
  onSaved: () => void
}) {
  const today = toIsoDate()
  const reasons = mode === 'refund' ? REFUND_REASON_ORDER : RELEASE_REASON_ORDER
  const [form, setForm] = useState<CreditUseForm>(
    () => proposedUse(reasons[0]!, credit.remaining, today),
  )

  // Adjusted while rendering rather than in an effect: what the dialog shows follows the
  // credit it was opened on, and that is decided outside.
  const opened = open ? `${mode}:${credit.receiptId}:${credit.remaining}` : null
  const [shown, setShown] = useState<string | null>(opened)
  if (opened !== shown) {
    setShown(opened)
    if (opened !== null) setForm(proposedUse(reasons[0]!, credit.remaining, today))
  }

  const save = useMutation({
    mutationFn: () => {
      const body = toCreditUsePayload(form)
      return mode === 'refund'
        ? refundCredit(tenantId, credit.receiptId, body)
        : releaseCredit(tenantId, credit.receiptId, body)
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const complaint = creditUseComplaint(form, credit.remaining, today)
  const isRefund = mode === 'refund'
  const { can } = useAuth()
  const runs = useRunsModule()
  // Both, not just the right: without the module there is no chart to pick from.
  const booksHere = runs(ACCOUNTING_MODULE) && can(ACCOUNTING_RIGHTS.read)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isRefund ? 'Guthaben zurückzahlen' : 'Guthaben auflösen'}
      description={`${credit.payerName ?? 'Dieser Kunde'} — noch offen ${formatAmount(credit.remaining)} ${credit.currency}. Das Buchungsdatum ist getrennt vom Valutadatum des Geldes.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => save.mutate()}
            busy={save.isPending}
            disabled={complaint !== null}
          >
            {isRefund ? 'Zurückzahlen' : 'Auflösen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectField
          label="Grund"
          value={form.reason}
          onChange={(event) =>
            setForm({ ...form, reason: event.target.value as CreditUseReason })
          }
          hint={CREDIT_USE_REASON_HINTS[form.reason]}
        >
          {reasons.map((code) => (
            <option key={code} value={code}>
              {CREDIT_USE_REASONS[code]}
            </option>
          ))}
        </SelectField>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={`Betrag in ${credit.currency}`}
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
            hint="Wann darüber verfügt wurde. Nie in der Zukunft."
          />
        </div>

        {isRefund && (
          <TextField
            label="IBAN"
            value={form.refundIban}
            onChange={(event) => setForm({ ...form, refundIban: event.target.value })}
            maxLength={MAX_IBAN_LENGTH}
            hint="Wohin das Geld ging. Freiwillig, aber der beste Nachweis."
          />
        )}

        {/* Only on a refund, and only where this tenant keeps books here. A release moves
            nothing in a bank — it books 2030 against income by itself — so there is no money
            account to name. The IBAN above is a different fact: it says where the money went,
            this says out of which of the tenant's own accounts (backend ADR-0128). */}
        {isRefund && booksHere && (
          <AccountSelect
            label="Geldkonto"
            tenantId={tenantId}
            accountType="ASSET"
            value={form.ledgerAccount}
            onChange={(number) => setForm({ ...form, ledgerAccount: number })}
            emptyLabel="– nicht buchen –"
            hint="Von welchem Konto das Geld abging. Die Gegenseite ist 2030 «Erhaltene Anzahlungen». Leer heisst: erfassen und nicht buchen."
          />
        )}

        <TextField
          label="Bemerkung"
          value={form.note}
          onChange={(event) => setForm({ ...form, note: event.target.value })}
          maxLength={MAX_NOTE_LENGTH}
          hint="Steht neben dem Grund, nie statt seiner."
        />

        {!isRefund && (
          <p className="text-[12px] text-text-secondary">
            Eine Auflösung ist eine Entscheidung des Mandanten, keine der Software: die
            Verjährung ist eine Einrede, die ein Richter nicht von Amtes wegen berücksichtigt
            (OR Art. 142). Gebucht wird 2030 gegen «Übrige Erlöse» — ohne Steuercode, weil das
            Entgelt beim Mandanten bleibt. Ob das die richtige MWST-Folge ist, ist offen und
            liegt beim Treuhänder.
          </p>
        )}

        {complaint !== null && (
          <p className="text-[12px] text-text-secondary" aria-live="polite">
            {complaint}
          </p>
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}
