import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { toIsoDate } from '../../lib/format'
import { recordAdvance } from '../../lib/customerCredit'
import type { Partner } from '../../lib/types'
import { PartnerQuickSearch } from '../document/PartnerQuickSearch'
import {
  MAX_IBAN_LENGTH,
  MAX_NOTE_LENGTH,
  advanceComplaint,
  emptyAdvance,
  toAdvancePayload,
  type AdvanceForm,
} from './creditForm'

/**
 * Records money that arrived before any invoice exists.
 *
 * <p><b>The customer is required, and the mask says why.</b> A prepayment is money the tenant
 * owes somebody; a debt without a creditor is not a fact anybody can act on. The receipt whose
 * payer is unknown is a different case and belongs on the payments screen (backend ADR-0104).
 *
 * <p>The hint under the value date names MWSTG Art. 40 Abs. 1 Bst. c in one sentence, because
 * that is exactly where the mistake sits: a prepayment is <b>not</b> tax free until the service
 * is delivered.
 *
 * @param onSaved called after a prepayment was stored, so the caller can refresh its lists
 */
export function AdvanceDialog({
  open,
  tenantId,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  currency: string
  onClose: () => void
  onSaved: () => void
}) {
  const today = toIsoDate()
  const [form, setForm] = useState<AdvanceForm>(() => emptyAdvance(currency, today))
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')

  // Adjusted while rendering rather than in an effect: a dialog reopened must not keep what
  // the last one held. Same technique as WriteOffDialog.
  const [shown, setShown] = useState(open)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setForm(emptyAdvance(currency, today))
      setPartner(undefined)
      setPartnerTerm('')
    }
  }

  const save = useMutation({
    mutationFn: () => recordAdvance(tenantId, toAdvancePayload(form, partner?.id ?? 0)),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const complaint = advanceComplaint(form, partner !== undefined, today)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Vorauszahlung erfassen"
      description="Geld, für das es noch keine Rechnung gibt. Es mindert keinen offenen Posten — es ist eine Verbindlichkeit gegenüber dem Kunden."
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
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <PartnerQuickSearch
          tenantId={tenantId}
          term={partnerTerm}
          onTerm={(next) => {
            setPartnerTerm(next)
            if (next === '') setPartner(undefined)
          }}
          chosen={partner !== undefined}
          onChoose={setPartner}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Betrag"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            inputMode="decimal"
            numeric
          />
          <TextField
            label="Währung"
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
            maxLength={3}
          />
          <TextField
            label="Valutadatum"
            type="date"
            max={today}
            value={form.valueDate}
            onChange={(event) => setForm({ ...form, valueDate: event.target.value })}
            hint="Der Tag der Wertstellung. Er entscheidet über die Steuerperiode."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Name des Zahlers"
            value={form.payerName}
            onChange={(event) => setForm({ ...form, payerName: event.target.value })}
          />
          <TextField
            label="Referenz"
            value={form.payerReference}
            onChange={(event) => setForm({ ...form, payerReference: event.target.value })}
            maxLength={MAX_IBAN_LENGTH}
          />
        </div>

        <TextField
          label="Notiz"
          value={form.note}
          onChange={(event) => setForm({ ...form, note: event.target.value })}
          maxLength={MAX_NOTE_LENGTH}
          hint="Wofür, zum Beispiel «Kostenvorschuss Auftrag B»."
        />

        <p className="text-[12px] text-text-secondary">
          Eine Vorauszahlung ist steuerbar, sobald das Geld eingegangen ist — nicht erst mit der
          Leistung (MWSTG Art. 40 Abs. 1 Bst. c). Ein MWST-Satz wird hier nicht erfasst: der
          Regelweg dafür ist die Akontorechnung, die ihn festhält.
        </p>

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
