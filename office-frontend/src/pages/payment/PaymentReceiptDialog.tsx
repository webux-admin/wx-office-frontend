import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatAmount, formatDate, toIsoDate } from '../../lib/format'
import {
  RECEIPT_STATES,
  assignPaymentReceipt,
  lookupOpenItem,
  recordPaymentReceipt,
  reversePaymentReceipt,
} from '../../lib/paymentReceipt'
import type { Partner, PaymentReceipt } from '../../lib/types'
import { PartnerQuickSearch } from '../document/PartnerQuickSearch'
import {
  MAX_NOTE_LENGTH,
  MAX_REFERENCE_LENGTH,
  emptyReceipt,
  lookupBy,
  receiptComplaint,
  toAssignmentPayload,
  toReceiptPayload,
  unassignedOf,
  withFoundItem,
  type ReceiptForm,
} from './receiptForm'

/**
 * Records money that arrived and spreads it over Rechnungen, in one mask.
 *
 * <p><b>Two steps, one dialog.</b> Recording and assigning are two facts — nothing is owed
 * less because money is on the account — but somebody reading a bank statement does both in
 * the same breath, and a mask that made them close and reopen would be answering a question
 * about the data model rather than about the work (backend ADR-0103).
 *
 * <p>Saving sends <b>two</b> calls, not one per line: the receipt, then every assignment
 * together. Three settlement lines of which two were written is a state nobody can read back.
 *
 * <p>An existing receipt opens read-only, with what it produced and — while nothing hangs on
 * it — the way to take it back.
 *
 * @param receipt   an existing receipt to look at, absent to record a new one
 * @param mayRecord whether the viewer may write at all
 * @param onSaved   called after something was stored, so the caller can refresh its lists
 */
export function PaymentReceiptDialog({
  open,
  tenantId,
  currency,
  receipt,
  mayRecord,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  currency: string
  receipt?: PaymentReceipt
  mayRecord: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const today = toIsoDate()
  const [form, setForm] = useState<ReceiptForm>(() => emptyReceipt(currency, today))
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [lookupTerm, setLookupTerm] = useState('')
  const [complaint, setComplaint] = useState<string | null>(null)

  // Adjusted while rendering rather than in an effect: what the dialog shows follows what it
  // was opened on, and that is decided outside. Reopened for a new receipt it must not keep
  // the last one's rows. Same technique as WriteOffDialog.
  const opened = open ? (receipt?.id ?? 'new') : null
  const [shown, setShown] = useState<number | string | null>(opened)
  if (opened !== shown) {
    setShown(opened)
    if (opened !== null) {
      setForm(emptyReceipt(currency, today))
      setPartner(undefined)
      setPartnerTerm('')
      setLookupTerm('')
      setComplaint(null)
    }
  }

  const find = useMutation({
    mutationFn: (term: string) => lookupOpenItem(tenantId, lookupBy(term)),
    onSuccess: (item) => {
      const next = withFoundItem(form, item)
      setComplaint(next.complaint)
      if (next.form !== null) {
        setForm(next.form)
        setLookupTerm('')
      }
    },
  })

  const save = useMutation({
    mutationFn: async () => {
      const stored = await recordPaymentReceipt(tenantId, toReceiptPayload(form, partner?.id))
      if (form.rows.length === 0) return stored
      return assignPaymentReceipt(tenantId, stored.id, toAssignmentPayload(form))
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const reverse = useMutation({
    mutationFn: () => reversePaymentReceipt(tenantId, receipt?.id ?? 0, form.note.trim() || undefined),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  if (receipt !== undefined) {
    return (
      <StoredReceipt
        open={open}
        receipt={receipt}
        mayRecord={mayRecord}
        busy={reverse.isPending}
        error={reverse.error}
        onReverse={() => reverse.mutate()}
        onClose={onClose}
      />
    )
  }

  const left = unassignedOf(form)
  const blocking = receiptComplaint(form, today)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Zahlungseingang erfassen"
      description="Erst das Geld, dann die Zuordnung. Ein Eingang mindert für sich noch keinen offenen Posten."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={blocking !== null}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
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
            hint="Der Tag der Wertstellung, nicht der Erfassung."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <TextField
            label="Name des Zahlers"
            value={form.payerName}
            onChange={(event) => setForm({ ...form, payerName: event.target.value })}
            hint="Darf leer bleiben — ein unklarer Eingang hat keinen."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Referenz"
            value={form.payerReference}
            onChange={(event) => setForm({ ...form, payerReference: event.target.value })}
            maxLength={MAX_REFERENCE_LENGTH}
            hint="Genau so, wie sie ankam."
          />
          <TextField
            label="Notiz"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            maxLength={MAX_NOTE_LENGTH}
          />
        </div>

        <div className="grid gap-3 rounded-lg border border-line-subtle p-4">
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Rechnung suchen"
              value={lookupTerm}
              onChange={(event) => {
                setLookupTerm(event.target.value)
                setComplaint(null)
              }}
              placeholder="Referenz oder Rechnungsnummer"
              className="min-w-[260px] flex-1"
            />
            <Button
              variant="secondary"
              onClick={() => find.mutate(lookupTerm.trim())}
              busy={find.isPending}
              disabled={lookupTerm.trim() === ''}
            >
              Zuweisen
            </Button>
          </div>

          {form.rows.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Noch nichts zugewiesen. Ein Eingang darf so liegen bleiben — er wartet, bis
              bekannt ist, wohin er gehört.
            </p>
          ) : (
            <ul className="grid gap-2">
              {form.rows.map((row) => (
                <li key={row.documentId} className="flex flex-wrap items-end gap-3">
                  <span className="grid min-w-[200px] flex-1">
                    <span className="text-[13px]">{row.documentNumber ?? `#${row.documentId}`}</span>
                    <span className="text-[12px] text-text-tertiary">
                      {row.partnerName ?? '–'} · offen {formatAmount(row.open)} {row.currency}
                    </span>
                  </span>
                  <TextField
                    label="Betrag"
                    value={row.amount}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        rows: form.rows.map((other) =>
                          other.documentId === row.documentId
                            ? { ...other, amount: event.target.value }
                            : other,
                        ),
                      })
                    }
                    inputMode="decimal"
                    numeric
                    className="w-[140px]"
                  />
                  <Button
                    variant="ghost"
                    aria-label={`${row.documentNumber ?? 'Rechnung'} entfernen`}
                    onClick={() =>
                      setForm({
                        ...form,
                        rows: form.rows.filter((other) => other.documentId !== row.documentId),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[13px]" aria-live="polite">
            Noch nicht zugewiesen:{' '}
            <span className={left < 0 ? 'font-medium text-danger' : 'font-medium'}>
              {formatAmount(left)} {form.currency}
            </span>
          </p>
        </div>

        {complaint !== null && (
          <p className="text-[12px] text-text-secondary" aria-live="polite">
            {complaint}
          </p>
        )}
        {find.error !== null && <ErrorNotice error={find.error} />}
        {blocking !== null && (
          <p className="text-[12px] text-text-secondary" aria-live="polite">
            {blocking}
          </p>
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}

/**
 * A receipt that is already recorded: what it is, what it produced, and how it is taken back.
 *
 * <p>No fields to edit. The table refuses every update and every delete, so a mask that
 * offered one would be promising something the database will not do — a receipt entered
 * wrongly is corrected by a counter receipt.
 */
function StoredReceipt({
  open,
  receipt,
  mayRecord,
  busy,
  error,
  onReverse,
  onClose,
}: {
  open: boolean
  receipt: PaymentReceipt
  mayRecord: boolean
  busy: boolean
  error: Error | null
  onReverse: () => void
  onClose: () => void
}) {
  const standing = receipt.assignments.filter((line) => line.reversedByPaymentId === undefined)
  const reversible =
    mayRecord &&
    receipt.state !== 'REVERSED' &&
    receipt.reversesReceiptId === undefined &&
    standing.length === 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`Zahlungseingang vom ${formatDate(receipt.valueDate)}`}
      description={`${formatAmount(receipt.amount)} ${receipt.currency} — ${RECEIPT_STATES[receipt.state]}. Ein Eingang wird nie geändert; korrigiert wird er durch eine Gegenbuchung.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
          {reversible && (
            <Button variant="danger" onClick={onReverse} busy={busy}>
              Stornieren
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          <Fact label="Zahler" value={receipt.payerName ?? '–'} />
          <Fact label="Kunde" value={receipt.partnerNumber ?? 'nicht zugeordnet'} />
          <Fact label="Referenz" value={receipt.payerReference ?? '–'} />
          <Fact label="Zugewiesen" value={`${formatAmount(receipt.assigned)} ${receipt.currency}`} />
          <Fact
            label="Noch nicht zugewiesen"
            value={`${formatAmount(receipt.unassigned)} ${receipt.currency}`}
          />
          <Fact label="Notiz" value={receipt.note ?? '–'} />
        </dl>

        {receipt.assignments.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Dieser Eingang ist noch keiner Rechnung zugewiesen.
          </p>
        ) : (
          <ul className="grid gap-1">
            {receipt.assignments.map((line) => (
              <li key={line.id} className="flex items-center gap-3 text-[13px]">
                <span className="flex-1">Rechnung #{line.documentId}</span>
                <span>
                  {formatAmount(line.amount)} {line.currency}
                </span>
                {line.reversedByPaymentId !== undefined && <Badge tone="neutral">storniert</Badge>}
              </li>
            ))}
          </ul>
        )}

        {mayRecord && !reversible && receipt.state !== 'REVERSED' && standing.length > 0 && (
          <p className="text-[12px] text-text-secondary">
            Zum Stornieren sind zuerst die Zuweisungen auf ihren Rechnungen zu stornieren —
            sonst mindert eine Ausgleichszeile weiter einen offenen Posten aus Geld, das es nie
            gab.
          </p>
        )}
        {error !== null && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid">
      <dt className="text-[12px] text-text-tertiary">{label}</dt>
      <dd className="text-[13px]">{value}</dd>
    </div>
  )
}
