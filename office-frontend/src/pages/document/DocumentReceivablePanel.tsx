import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
  fetchOverpaymentAdvice,
  type OverpaymentAdvice,
  fetchPayments,
  openState,
  recordPayment,
  reversePayment,
} from '../../lib/receivable'
import { CUSTOMER_CREDIT_PATH } from '../../lib/customerCredit'
import { openItemsKey } from '../../lib/openItem'
import { useDebouncedValue } from '../../components/useDebouncedValue'
import { receivableKey, salesDocumentListKey } from '../../lib/salesDocument'
import { WriteOffDialog } from '../openitem/WriteOffDialog'
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
 * <p><b>Recording a payment and giving the rest up are two buttons, not two kinds in one
 * picker.</b> A payment carries a value date and may exceed what is open; a write-off carries
 * a booking date that decides the period of the tax correction and never exceeds the
 * remainder. Two operations, two rights, two dialogs (backend ADR-0101).
 *
 * @param mayRecord  whether the user holds `INVOICE_PAYMENT_RECORD`
 * @param mayWriteOff whether the user holds `INVOICE_WRITE_OFF`
 */
export function DocumentReceivablePanel({
  tenantId,
  kind,
  documentId,
  currency,
  mayRecord,
  mayWriteOff,
}: {
  tenantId: number
  kind: SalesDocumentKind
  documentId: number
  /** Currency of the Rechnung; a settlement has to be in it. */
  currency: string
  mayRecord: boolean
  mayWriteOff: boolean
}) {
  const queryClient = useQueryClient()
  const [recording, setRecording] = useState(false)
  const [keepingSurplus, setKeepingSurplus] = useState(false)
  const [writingOff, setWritingOff] = useState(false)
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
    void queryClient.invalidateQueries({ queryKey: openItemsKey(tenantId) })
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

  // Debounced, so a typed amount does not send one request per digit. The answer is the
  // server's: the same rule has to hold when a statement import asks it, and two
  // implementations of one limit drift apart (backend ADR-0105).
  const typedAmount = useDebouncedValue(form.amount)
  const typed = Number(typedAmount.replace(',', '.'))
  const advice = useQuery({
    queryKey: [...key, 'overpayment-advice', typed],
    queryFn: () => fetchOverpaymentAdvice(tenantId, documentId, typed),
    enabled: recording && Number.isFinite(typed) && typed > 0,
  })

  const item = openItem.data
  const rows = payments.data ?? []
  const state = openState(item?.open)
  const surplus = item === undefined || item.open >= 0 ? 0 : -item.open

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
        mayRecord || mayWriteOff ? (
          <span className="flex items-center gap-2">
            {mayRecord && (
              <Button variant="secondary" onClick={openCreate}>
                Zahlung erfassen
              </Button>
            )}
            {mayWriteOff && (
              <Button
                variant="secondary"
                onClick={() => setWritingOff(true)}
                disabled={state !== 'open'}
                title={state === 'open' ? undefined : 'Es ist nichts mehr offen.'}
              >
                Ausbuchen
              </Button>
            )}
          </span>
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

        {/* Three ways out, and «stehen lassen» is the one that needs no click: until
            somebody keeps it the surplus belongs to the customer (OR Art. 62). Nothing here
            books by itself (backend ADR-0105). */}
        {surplus > 0 && (
          <div className="grid gap-2 rounded-[var(--radius-lg)] border border-line-subtle bg-sunken px-4 py-3">
            <p className="text-[13px]">
              <span className="font-medium">
                {formatAmount(surplus)} {currency} zu viel bezahlt.
              </span>{' '}
              Der Betrag bleibt als Guthaben des Kunden stehen, solange niemand etwas anderes
              entscheidet.
            </p>
            <span className="flex flex-wrap items-center gap-2">
              {mayWriteOff && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setKeepingSurplus(true)
                    setWritingOff(true)
                  }}
                >
                  Einbehalten
                </Button>
              )}
              <Link
                className="text-[13px] underline"
                to={`${CUSTOMER_CREDIT_PATH}`}
              >
                Zurückzahlen
              </Link>
            </span>
            <p className="text-[12px] text-text-secondary">
              Ein einbehaltener Überschuss ist zusätzliches Entgelt (MWSTG Art. 24 Abs. 1) —
              kein steuerfreies Trinkgeld.
            </p>
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

        {!mayWriteOff && (
          <p className="text-[13px] text-text-secondary">
            Zum Ausbuchen fehlt das Recht «Forderung ausbuchen».
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
            hint={overpaymentHint(advice.data, currency)}
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

      <WriteOffDialog
        open={writingOff}
        tenantId={tenantId}
        documentId={documentId}
        documentNumber={undefined}
        currency={currency}
        openAmount={item?.open}
        keepLimit={advice.data?.keepLimit}
        keepMaximum={advice.data?.keepMaximum}
        initialReason={keepingSurplus ? 'UEBERZAHLUNG' : undefined}
        onClose={() => {
          setWritingOff(false)
          setKeepingSurplus(false)
        }}
        onWritten={refresh}
      />

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
/**
 * What the amount field says while somebody types.
 *
 * <p><b>It warns and never blocks.</b> A customer who transfers twenty rappen too much must
 * not become an error dialog — that is ADR-0091 and it stays. What changed is that the
 * sentence now names a figure and says what will happen (backend ADR-0105).
 *
 * @param advice   what the server worked out, absent while nothing was typed
 * @param currency the currency of the Rechnung
 */
function overpaymentHint(advice: OverpaymentAdvice | undefined, currency: string): string {
  if (advice === undefined || advice.difference <= 0) {
    return 'Mehr als offen ist erlaubt: die Überzahlung wird als Guthaben ausgewiesen.'
  }
  const tooMuch = `${formatAmount(advice.difference)} ${currency} zu viel.`
  if (advice.zone === 'ROUNDING') {
    return `${tooMuch} Das ist eine Rundung.`
  }
  if (advice.zone === 'KEEP_PROPOSED') {
    return `${tooMuch} Vorschlag: einbehalten — das ist zusätzliches Entgelt.`
  }
  return advice.keepAllowed
    ? `${tooMuch} Der Betrag bleibt ein Guthaben des Kunden; einbehalten geht nur mit Bemerkung.`
    : `${tooMuch} Über ${formatAmount(advice.keepMaximum)} ${currency} lässt sich nichts einbehalten — der Betrag bleibt ein Guthaben des Kunden.`
}

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
        {/*
          Where the line came from, so the two views do not look as if they contradicted each
          other: this register and the screen «Zahlungen» call the same endpoints, and a line
          out of a bank credit is spread there, not entered here (backend ADR-0103).
        */}
        {payment.receiptId !== undefined && (
          <span className="ml-2 no-underline">
            <Badge tone="muted">aus Zahlungseingang</Badge>
          </span>
        )}
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
