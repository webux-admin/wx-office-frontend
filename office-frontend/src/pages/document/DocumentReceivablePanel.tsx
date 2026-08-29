import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { formatAmount, formatDate, formatDateTime, toIsoDate } from '../../lib/format'
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_ORDER,
  REDUCES_CONSIDERATION,
  fetchOpenItem,
  fetchPayments,
  openState,
  recordPayment,
  reversePayment,
} from '../../lib/receivable'
import { receivableKey, salesDocumentListKey } from '../../lib/salesDocument'
import type { SalesDocumentKind } from '../../lib/salesDocument'
import type { Payment, PaymentKind } from '../../lib/types'

/** What the record dialog edits. */
type PaymentForm = { kind: PaymentKind; amount: string; valueDate: string; note: string }

/**
 * What a new settlement starts as: a payment, valued today, for whatever is still open.
 *
 * <p>The amount is pre-filled with the open amount because that is what arrives in almost
 * every case, and a wrong pre-fill is corrected in one keystroke while an empty field is
 * typed out every time. Pre-filled only when something is actually open — never with a
 * negative amount from an overpayment.
 */
function proposedForm(open: number | undefined): PaymentForm {
  return {
    kind: 'PAYMENT',
    amount: open !== undefined && open > 0 ? open.toFixed(2) : '',
    valueDate: toIsoDate(),
    note: '',
  }
}

/**
 * What was paid on one Rechnung, and what is left.
 *
 * <p>Nothing here is stored as a number: the open amount is the total minus every line below
 * it, worked out by the backend on each request (backend ADR-0091).
 *
 * <p>There is no edit and no delete, on purpose. A wrong line is taken back with a counter
 * booking that leaves both readable — the database refuses the other way round anyway, so an
 * edit button would only produce an error one layer down.
 *
 * @param mayRecord whether the user holds `INVOICE_PAYMENT_RECORD`
 */
export function DocumentReceivablePanel({
  tenantId,
  kind,
  documentId,
  currency,
  mayRecord,
}: {
  tenantId: number
  kind: SalesDocumentKind
  documentId: number
  /** Currency of the Rechnung; a settlement has to be in it. */
  currency: string
  mayRecord: boolean
}) {
  const queryClient = useQueryClient()
  const [recording, setRecording] = useState(false)
  const [reversing, setReversing] = useState<Payment | null>(null)
  const [form, setForm] = useState<PaymentForm>(() => proposedForm(undefined))
  const [reason, setReason] = useState('')

  const key = receivableKey(kind, tenantId, documentId)

  const openItem = useQuery({
    queryKey: [...key, 'open-item'],
    queryFn: () => fetchOpenItem(tenantId, documentId),
  })

  const payments = useQuery({
    queryKey: [...key, 'payments'],
    queryFn: () => fetchPayments(tenantId, documentId),
  })

  // The list shows «Offen» in a column of its own, so it is stale the moment a line lands.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(kind, tenantId) })
  }

  const record = useMutation({
    mutationFn: () =>
      recordPayment(tenantId, documentId, {
        kind: form.kind,
        amount: Number(form.amount.replace(',', '.')),
        currency,
        valueDate: form.valueDate,
        note: form.note.trim() === '' ? undefined : form.note.trim(),
      }),
    onSuccess: () => {
      refresh()
      setRecording(false)
    },
  })

  const reverse = useMutation({
    mutationFn: (payment: Payment) =>
      reversePayment(tenantId, documentId, payment.id,
        reason.trim() === '' ? undefined : reason.trim()),
    onSuccess: () => {
      refresh()
      setReversing(null)
    },
  })

  const item = openItem.data
  const rows = payments.data ?? []
  const state = openState(item?.open)

  const openCreate = () => {
    record.reset()
    setForm(proposedForm(item?.open))
    setRecording(true)
  }

  const amountValue = Number(form.amount.replace(',', '.'))
  const amountInvalid =
    form.amount.trim() === '' || Number.isNaN(amountValue) || amountValue === 0

  return (
    <Panel
      title="Zahlungen"
      description="Was auf diese Rechnung eingegangen ist. Der offene Betrag wird gerechnet, nicht gespeichert."
      action={
        mayRecord ? (
          <Button variant="secondary" onClick={openCreate}>
            Zahlung erfassen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        {openItem.error !== null && <ErrorNotice error={openItem.error} />}
        {payments.error !== null && <ErrorNotice error={payments.error} />}

        {item !== undefined && (
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Figure label="Rechnungsbetrag" value={`${formatAmount(item.totalGross)} ${item.currency}`} />
            <Figure label="Ausgeglichen" value={`${formatAmount(item.settled)} ${item.currency}`} />
            <Figure
              label={state === 'credit' ? 'Guthaben des Kunden' : 'Offen'}
              value={`${formatAmount(Math.abs(item.open))} ${item.currency}`}
              tone={state === 'open' ? 'strong' : undefined}
            />
            <div className="grid gap-1">
              <p className="text-[12px] text-text-tertiary">Fällig</p>
              <div className="flex items-center gap-2">
                <p className="text-[13px]">{formatDate(item.dueDate)}</p>
                {item.overdue && (
                  <Badge tone="danger">{item.daysOverdue} Tage überfällig</Badge>
                )}
                {state === 'settled' && <Badge tone="success">ausgeglichen</Badge>}
                {state === 'credit' && <Badge tone="accent">überzahlt</Badge>}
              </div>
            </div>
          </div>
        )}

        {payments.isSuccess && rows.length === 0 && (
          <p className="text-[13px] text-text-secondary">
            Noch keine Zahlung erfasst.
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-text-tertiary">
                  <th className="py-1 pr-4 font-medium">Valuta</th>
                  <th className="py-1 pr-4 font-medium">Art</th>
                  <th className="py-1 pr-4 text-right font-medium">Betrag</th>
                  <th className="py-1 pr-4 font-medium">Notiz</th>
                  <th className="py-1 pr-4 font-medium">Erfasst</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {rows.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    mayRecord={mayRecord}
                    onReverse={() => {
                      reverse.reset()
                      setReason('')
                      setReversing(payment)
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!mayRecord && (
          <p className="text-[13px] text-text-secondary">
            Zum Erfassen fehlt das Recht «Zahlung erfassen».
          </p>
        )}

        {reverse.error !== null && <ErrorNotice error={reverse.error} />}
      </div>

      <Dialog
        open={recording}
        onClose={() => setRecording(false)}
        title="Zahlung erfassen"
        description={`Beträge in ${currency}, wie die Rechnung. Das Valutadatum ist der Tag der Wertstellung, nicht der Tag der Erfassung.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecording(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => record.mutate()}
              busy={record.isPending}
              disabled={amountInvalid || form.valueDate === ''}
            >
              Erfassen
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Art"
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as PaymentKind })
              }
            >
              {PAYMENT_KIND_ORDER.map((code) => (
                <option key={code} value={code}>
                  {PAYMENT_KINDS[code]}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Valutadatum"
              type="date"
              value={form.valueDate}
              onChange={(event) => setForm({ ...form, valueDate: event.target.value })}
            />
          </div>

          <TextField
            label={`Betrag in ${currency}`}
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            inputMode="decimal"
            numeric
            hint="Mehr als offen ist erlaubt: die Überzahlung wird als Guthaben ausgewiesen."
          />

          {REDUCES_CONSIDERATION.includes(form.kind) && (
            <p className="text-[12px] text-text-secondary">
              {PAYMENT_KINDS[form.kind]} mindert das Entgelt und hat eine MWST-Folge nach
              MWSTG Art. 41. Diese Anwendung führt kein Hauptbuch und bucht sie nicht — die
              Korrektur der Umsatzsteuer erfolgt ausserhalb.
            </p>
          )}

          <TextField
            label="Notiz"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />

          {record.error !== null && <ErrorNotice error={record.error} />}
        </div>
      </Dialog>

      <Dialog
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title="Zahlung stornieren"
        description="Die Zahlung wird nicht gelöscht: es entsteht eine Gegenbuchung mit umgekehrtem Betrag. Beide Zeilen bleiben stehen."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReversing(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => reversing !== null && reverse.mutate(reversing)}
              busy={reverse.isPending}
            >
              Stornieren
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <TextField
            label="Grund"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint="Optional. Steht als Notiz auf der Gegenbuchung."
          />
          {reverse.error !== null && <ErrorNotice error={reverse.error} />}
        </div>
      </Dialog>
    </Panel>
  )
}

/** One figure of the summary line. */
function Figure({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'strong'
}) {
  return (
    <div className="grid gap-1">
      <p className="text-[12px] text-text-tertiary">{label}</p>
      <p className={tone === 'strong' ? 'text-[13px] font-medium' : 'text-[13px]'}>{value}</p>
    </div>
  )
}

/**
 * One settlement line.
 *
 * <p>A line that was taken back and the counter line that did it are both struck through: the
 * history stays complete, and what still counts stays readable at a glance.
 */
function PaymentRow({
  payment,
  mayRecord,
  onReverse,
}: {
  payment: Payment
  mayRecord: boolean
  onReverse: () => void
}) {
  const settled = payment.reversedByPaymentId !== undefined
  const isCounter = payment.reversesPaymentId !== undefined
  const struck = settled || isCounter

  return (
    <tr className={struck ? 'text-text-tertiary line-through' : undefined}>
      <td className="py-1.5 pr-4">{formatDate(payment.valueDate)}</td>
      <td className="py-1.5 pr-4">
        <span className="no-underline">
          {PAYMENT_KINDS[payment.kind]}
          {isCounter && ' (Storno)'}
        </span>
      </td>
      <td className="py-1.5 pr-4 text-right tabular-nums">
        {formatAmount(payment.amount)} {payment.currency}
      </td>
      <td className="py-1.5 pr-4">{payment.note ?? ''}</td>
      <td className="py-1.5 pr-4">
        {formatDateTime(payment.recordedAt)} · {payment.recordedBy}
      </td>
      <td className="py-1.5 text-right">
        {mayRecord && !struck && (
          <Button variant="ghost" onClick={onReverse}>
            Stornieren
          </Button>
        )}
      </td>
    </tr>
  )
}
