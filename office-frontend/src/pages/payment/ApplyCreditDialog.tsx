import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatAmount, formatDate, parseDecimal } from '../../lib/format'
import { applyCredit } from '../../lib/customerCredit'
import { fetchOpenItems, openItemQuery, openItemsKey } from '../../lib/openItem'
import type { CustomerCredit, OpenItem } from '../../lib/types'
import { proposedApplication } from './creditForm'

/**
 * Sets a customer credit against one invoice.
 *
 * <p><b>Never by itself.</b> A Verrechnung requires a declaration under OR Art. 120 ff., so
 * this dialog proposes and a person confirms. A prepayment is often earmarked — a cost advance
 * on order B — and an automaton that put it on an older, disputed invoice A would create a
 * dispute rather than settle one (backend ADR-0104).
 *
 * <p>Only the open items of the <b>same customer</b> and the <b>same currency</b> are offered.
 * A foreign-currency assignment would need a rate and a rate date, and those belong on the
 * payment rather than in a guess.
 *
 * @param credit  the credit to draw on
 * @param onSaved called after the credit was applied, so the caller can refresh its lists
 */
export function ApplyCreditDialog({
  open,
  tenantId,
  credit,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  credit: CustomerCredit
  onClose: () => void
  onSaved: () => void
}) {
  const [chosen, setChosen] = useState<OpenItem | undefined>(undefined)
  const [amount, setAmount] = useState('')

  const opened = open ? `${credit.receiptId}:${credit.remaining}` : null
  const [shown, setShown] = useState<string | null>(opened)
  if (opened !== shown) {
    setShown(opened)
    if (opened !== null) {
      setChosen(undefined)
      setAmount('')
    }
  }

  const query = openItemQuery({
    partnerId: credit.partnerId,
    page: 0,
    size: 50,
    sort: 'dueDate,asc',
  })
  const items = useQuery({
    queryKey: openItemsKey(tenantId, query),
    queryFn: () => fetchOpenItems(tenantId, query),
    enabled: open && credit.partnerId !== undefined,
    placeholderData: keepPreviousData,
  })

  const apply = useMutation({
    mutationFn: () =>
      applyCredit(tenantId, credit.receiptId, {
        documentId: chosen?.documentId ?? 0,
        amount: parseDecimal(amount) ?? 0,
      }),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  // Same currency only, and nothing that owes nothing: what cannot be assigned is not offered.
  const offered = (items.data?.content ?? []).filter(
    (item) => item.currency === credit.currency && item.open > 0,
  )
  const typed = parseDecimal(amount)
  const complaint =
    chosen === undefined
      ? 'Wählen Sie die Rechnung, gegen die verrechnet wird.'
      : typed === null || typed <= 0
        ? 'Der Betrag ist keine Zahl über 0.00.'
        : typed > credit.remaining
          ? `Es sind nur noch ${formatAmount(credit.remaining)} Guthaben übrig.`
          : typed > chosen.open
            ? `Auf dieser Rechnung sind nur noch ${formatAmount(chosen.open)} offen.`
            : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="Guthaben verrechnen"
      description={`${credit.payerName ?? 'Dieser Kunde'} — noch offen ${formatAmount(credit.remaining)} ${credit.currency}. Eine Verrechnung setzt eine Erklärung voraus (OR Art. 120 ff.); nichts geschieht von selbst.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => apply.mutate()}
            busy={apply.isPending}
            disabled={complaint !== null}
          >
            Verrechnen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {offered.length === 0 ? (
          <EmptyState
            title="Keine offene Rechnung"
            description={`Dieser Kunde hat keine offene Rechnung in ${credit.currency}. Eine Verrechnung über Währungen hinweg braucht einen Kurs und ein Kursdatum — die gibt es hier nicht.`}
          />
        ) : (
          <ul className="grid gap-1">
            {offered.map((item) => (
              <li key={item.documentId}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(item)
                    setAmount(proposedApplication(item.open, credit.remaining))
                  }}
                  className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-[13px] ${
                    chosen?.documentId === item.documentId
                      ? 'bg-accent/12 text-accent-text'
                      : 'hover:bg-sunken'
                  }`}
                >
                  <span className="flex-1">
                    {item.documentNumber ?? `#${item.documentId}`}
                    <span className="ml-2 text-text-tertiary">
                      fällig {formatDate(item.dueDate)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatAmount(item.open)} {item.currency}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <TextField
          label={`Betrag in ${credit.currency}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          numeric
          hint="Vorbelegt mit dem kleineren von Guthaben und offenem Posten."
        />

        {complaint !== null && (
          <p className="text-[12px] text-text-secondary" aria-live="polite">
            {complaint}
          </p>
        )}
        {items.error !== null && <ErrorNotice error={items.error} />}
        {apply.error !== null && <ErrorNotice error={apply.error} />}
      </div>
    </Dialog>
  )
}
