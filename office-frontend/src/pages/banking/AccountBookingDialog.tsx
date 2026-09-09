import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatAmount, formatDate, toIsoDate } from '../../lib/format'
import {
  bankLedgerAccountsKey,
  fetchBankLedgerAccounts,
  fetchTaxCodes,
  taxCodesKey,
} from '../../lib/accounting'
import { bookTransactionToAccount } from '../../lib/clearing'
import { CodeSelect } from '../../masterdata/CodeSelect'
import { AccountSelect } from '../accounting/AccountSelect'

/**
 * What the dialog needs to know about the movement it books.
 *
 * <p>Deliberately not the whole `BankTransaction`: the clearing basket hands over a
 * `WorklistRow`, the bank item list a `BankTransaction`, and the six figures below are what
 * both carry.
 */
export type BookableMovement = {
  id: number
  amount: number
  currency: string
  /** Decides which side the chosen account books on. Never the sign of the amount. */
  creditDebit: 'CRDT' | 'DBIT'
  accountIban: string
  bookingDate?: string
  valueDate?: string
  debtorName?: string
  remittanceUnstructured?: string
}

/**
 * Books a bank movement straight onto an account of the chart.
 *
 * <p><b>The third way</b>, beside «assign» and «clear later»: money that moved without an
 * invoice of this house behind it — rent, a bank charge, a tax payment. No settlement line is
 * written and no open item moves.
 *
 * <p><b>The direction comes from `creditDebit`, never from the amount.</b> The amount is
 * non-negative on every movement; a debit books the chosen account in the debit column and the
 * bank in the credit one, a credit the other way round. The preview says it in words, because
 * «Soll» and «Haben» are the two a hurried reader mixes up (backend ADR-0128).
 *
 * <p><b>The bank side is not chosen.</b> It is the ledger account of the account the money
 * moved on, resolved over the IBAN — a mask that named it could name a different bank than the
 * money touched. Where the mapping is missing the dialog says so and the button stays shut,
 * instead of letting somebody fill the form for a refusal.
 *
 * @param movement what is being booked
 * @param onSaved  called after the ledger took it, so the caller can refresh its lists
 */
export function AccountBookingDialog({
  open,
  tenantId,
  movement,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  movement: BookableMovement | null
  onClose: () => void
  onSaved: (entryNumber: string) => void
}) {
  const today = toIsoDate()
  const day = movement?.bookingDate ?? movement?.valueDate ?? today
  const [account, setAccount] = useState('')
  const [taxCode, setTaxCode] = useState('')
  const [bookingDate, setBookingDate] = useState(day)
  const [text, setText] = useState(movement?.remittanceUnstructured ?? '')

  // Adjusted while rendering rather than in an effect: a dialog reopened on another movement
  // must not keep what the last one held. The same technique as the write-off dialog.
  const shownFor = open && movement !== null ? movement.id : null
  const [shown, setShown] = useState<number | null>(shownFor)
  if (shownFor !== shown) {
    setShown(shownFor)
    setAccount('')
    setTaxCode('')
    setBookingDate(day)
    setText(movement?.remittanceUnstructured ?? '')
  }

  const ledgerAccounts = useQuery({
    queryKey: bankLedgerAccountsKey(tenantId),
    queryFn: () => fetchBankLedgerAccounts(tenantId),
    enabled: open,
  })

  const taxCodes = useQuery({
    queryKey: taxCodesKey(tenantId),
    queryFn: () => fetchTaxCodes(tenantId),
    enabled: open,
  })

  const bankSide = (ledgerAccounts.data ?? []).find(
    (row) => row.accountIban === movement?.accountIban?.replace(/\s/g, '').toUpperCase(),
  )

  const book = useMutation({
    mutationFn: () =>
      bookTransactionToAccount(tenantId, movement?.id ?? 0, {
        accountNumber: account,
        taxCode: taxCode === '' ? undefined : taxCode,
        bookingDate,
        description: text.trim() === '' ? undefined : text.trim(),
      }),
    onSuccess: (written) => {
      onSaved(written.entryNumber)
      onClose()
    },
  })

  if (movement === null) {
    return null
  }

  const debit = movement.creditDebit === 'DBIT'
  const chosenLabel = account === '' ? 'noch kein Konto' : account
  const bankLabel = bankSide?.accountNumber ?? '—'
  const amount = `${formatAmount(movement.amount)} ${movement.currency}`

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Auf ein Konto buchen"
      description="Für Geld, hinter dem keine Rechnung dieses Hauses steht — Miete, Spesen, eine Steuerzahlung. Es entsteht keine Ausgleichszeile und kein offener Posten bewegt sich."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => book.mutate()}
            busy={book.isPending}
            disabled={account === '' || bankSide === undefined}
          >
            Buchen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="rounded-md bg-surface-sunken px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span>{formatDate(movement.valueDate)}</span>
            <span className="font-medium">{amount}</span>
            <span>{debit ? 'Belastung' : 'Gutschrift'}</span>
          </div>
          <div className="text-text-secondary">
            {movement.debtorName ?? movement.accountIban}
            {movement.remittanceUnstructured && ` · ${movement.remittanceUnstructured}`}
          </div>
        </div>

        {bankSide === undefined && !ledgerAccounts.isLoading && (
          <WarningNotice>
            Für dieses Bankkonto fehlt das Fibu-Konto, und ohne Gegenkonto lässt sich nichts
            buchen. Tragen Sie es unter Buchhaltung → Bankkonten für {movement.accountIban}
            nach.
          </WarningNotice>
        )}

        <AccountSelect
          label="Konto"
          tenantId={tenantId}
          accountType="ALL"
          value={account}
          onChange={setAccount}
          emptyLabel="– bitte wählen –"
          hint="Wohin der Betrag gehört. Die Gegenseite ist das Fibu-Konto dieses Bankkontos."
        />

        <CodeSelect
          label="Steuercode"
          entries={(taxCodes.data?.codes ?? []).map((code) => ({
            code: code.code,
            name: `${code.code} · ${code.name}`,
          }))}
          value={taxCode}
          onChange={setTaxCode}
          emptyLabel="– ohne –"
          hint="Hier wählt ein Mensch: VSM81 und VSI81 sind derselbe Satz auf zwei Konten und zwei ESTV-Ziffern."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Buchungsdatum"
            type="date"
            value={bookingDate}
            onChange={(event) => setBookingDate(event.target.value)}
            hint="Vorbelegt mit dem Tag, an dem die Bank gebucht hat."
          />
          <TextField
            label="Text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={200}
            hint="Steht als Buchungstext im Journal."
          />
        </div>

        <div
          className="rounded-md border border-border-subtle px-4 py-3 text-[13px]"
          data-testid="booking-preview"
        >
          <div className="pb-1 font-medium">So wird gebucht</div>
          <BookingLine
            side="Soll"
            account={debit ? chosenLabel : bankLabel}
            amount={amount}
            effect={debit ? 'nimmt zu' : 'Guthaben steigt'}
          />
          <BookingLine
            side="Haben"
            account={debit ? bankLabel : chosenLabel}
            amount={amount}
            effect={debit ? 'Guthaben sinkt' : 'nimmt zu'}
          />
          {taxCode !== '' && (
            <div className="pt-1 text-[12px] text-text-tertiary">
              Der Steuerbetrag wird aus dem Bruttobetrag herausgerechnet und auf das Konto des
              Codes {taxCode} gebucht.
            </div>
          )}
        </div>

        {book.error !== null && <ErrorNotice error={book.error} />}
      </div>
    </Dialog>
  )
}

/** One line of the preview: side, account, amount, and what it does in words. */
function BookingLine({
  side,
  account,
  amount,
  effect,
}: {
  side: string
  account: string
  amount: string
  effect: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <span className="w-12 text-text-secondary">{side}</span>
      <span className="font-mono">{account}</span>
      <span className="ml-auto">{amount}</span>
      <span className="w-full pl-12 text-[12px] text-text-tertiary">{effect}</span>
    </div>
  )
}
