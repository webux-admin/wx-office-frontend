import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  accountsKey,
  fetchAccounts,
  fiscalYearsKey,
  openingEntryKey,
  recordOpeningEntry,
  setupStateKey,
  updateAccountingSettings,
} from '../../lib/accounting'
import { fetchOpenItemTotals, openItemTotalKey } from '../../lib/openItem'
import { formatAmount, formatDate, isCompleteIsoDate } from '../../lib/format'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import type { Account, Entry, FiscalYear, SuggestedLine } from '../../lib/types'
import { MissingRightHint } from './MissingRightHint'
import { StepChoice } from './StepChoice'
import {
  emptyRow,
  openingBalanceOf,
  openingBlockerOf,
  openingFormOf,
  openingRequestOf,
  shownForm,
  type OpeningForm,
} from './openingForm'

/** The chart is read whole: a picker wants every account, not a page. */
const ACCOUNT_QUERY = listQuery({ activeOnly: true, size: PICKER_SIZE, sort: 'accountNumber,asc' })

/**
 * Step 3: from which day this tenant keeps books here, and what stood on the accounts that day.
 *
 * <p><b>Two calls in a binding order:</b> first `PUT /settings` with the changeover day, then
 * `POST /opening-entry` — the second derives its booking date from the first. So <b>both</b>
 * rights are checked before the first call goes out: whoever holds only `ACCOUNTING_CLOSE` would
 * otherwise fail at the first of the two and be left with a step that is half done, which is the
 * one state the wizard promises never to leave behind.
 *
 * <p><b>«Ich fange bei null an» writes no entry at all</b> — not an empty one. It makes the first
 * call and finishes the wizard.
 *
 * <p><b>The receivables row is filled from the open items, and it says so.</b> The figure is
 * today's and not the one of the changeover day; the sentence under the grid says that outright,
 * and the mark disappears the moment somebody touches the amount.
 */
export function OpeningEntryStep({
  tenantId,
  fiscalYear,
  suggestion,
  ledgerCurrency,
  existing,
  storedStartsOn,
  onDone,
  onBack,
}: {
  tenantId: number
  fiscalYear: FiscalYear
  suggestion: readonly SuggestedLine[]
  ledgerCurrency: string
  /** The opening entry that already stands, absent where the year has none. */
  existing?: Entry | null
  /** The changeover day as it is stored, so a refused entry can put it back. */
  storedStartsOn?: string | null
  onDone: () => void
  onBack: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)
  const mayClose = can(ACCOUNTING_RIGHTS.close)
  const mayReadInvoices = can('INVOICE_READ')

  const replacing = existing !== null && existing !== undefined
  const [fromStart, setFromStart] = useState(
    storedStartsOn === null || storedStartsOn === undefined
      ? true
      : storedStartsOn === fiscalYear.startDate,
  )
  const [startsOn, setStartsOn] = useState(storedStartsOn ?? fiscalYear.startDate)
  const [carriesBalances, setCarriesBalances] = useState(true)
  const [reason, setReason] = useState('')
  const [form, setForm] = useState<OpeningForm>(() => openingFormOf(suggestion))

  const accounts = useQuery({
    queryKey: accountsKey(tenantId, ACCOUNT_QUERY),
    queryFn: () => fetchAccounts(tenantId, ACCOUNT_QUERY),
  })

  // Read here and not in the backend: `accounting` does not import `document`, and this one
  // figure is what would have forced that edge (backend ADR-0110). Without `INVOICE_READ` the
  // amount stays empty and the sentence below says where the figure stands.
  const totals = useQuery({
    queryKey: openItemTotalKey(tenantId),
    queryFn: () => fetchOpenItemTotals(tenantId),
    enabled: mayReadInvoices,
  })

  // The proposal shows through wherever nobody has typed — worked out during render, so no
  // effect writes into the grid and no keystroke is overwritten by a late answer.
  const shown = shownForm(form, suggestion, totals.data?.rows ?? [], ledgerCurrency)

  const save = useMutation({
    mutationFn: async () => {
      // The order is binding: the opening entry derives its booking date from this setting.
      await updateAccountingSettings(tenantId, {
        postingStartsOn: fromStart ? fiscalYear.startDate : startsOn,
      })
      if (!carriesBalances) return
      try {
        // What was sent is what stood on the screen, proposal and all.
        await recordOpeningEntry(
          tenantId,
          openingRequestOf(shown, fiscalYear.id, replacing, reason.trim()),
        )
      } catch (refused) {
        // The two calls are not one transaction, so the step undoes its own first one. A
        // changeover day left behind without an entry would tell GET /setup-state that the setup
        // is finished, and the notice on the fiscal year screen — the only way back to this
        // step — would disappear.
        await updateAccountingSettings(tenantId, {
          postingStartsOn: storedStartsOn ?? undefined,
          clearPostingStartsOn: storedStartsOn === null || storedStartsOn === undefined,
        })
        throw refused
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: setupStateKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: openingEntryKey(tenantId, fiscalYear.id) })
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      onDone()
    },
  })

  const balance = openingBalanceOf(shown)
  const blocker = carriesBalances ? openingBlockerOf(shown) : undefined
  const missingRight = !mayConfigure || !mayClose
  // A day that is not a day would be sent as an empty string, land as «leave it as it is», and
  // the entry would quietly be dated on the first day of the year instead.
  const dayComplete = fromStart || (isCompleteIsoDate(startsOn) && insideTheYear(startsOn))
  const reasonMissing = replacing && carriesBalances && reason.trim() === ''
  const blocked =
    blocker !== undefined || missingRight || !dayComplete || reasonMissing || save.isPending

  function insideTheYear(day: string): boolean {
    return fiscalYear.startDate <= day && day <= fiscalYear.endDate
  }

  const setRow = (index: number, changed: Partial<OpeningForm['rows'][number]>) =>
    setForm((current) => ({
      rows: current.rows.map((row, at) => (at === index ? { ...row, ...changed } : row)),
    }))

  return (
    <Panel>
      <div className="grid gap-5">
        {/* A year that already carries an opening is not corrected — it is replaced: the old
            entry is reversed and the new one written in one transaction, and both stay in the
            journal (GeBüV Art. 3). */}
        {replacing && (
          <WarningNotice>
            Für {fiscalYear.label} besteht bereits die Eröffnungsbuchung {existing?.entryNumber}.
            Was Sie hier buchen, <strong>ersetzt</strong> sie: die bestehende wird storniert und
            die neue gebucht, beides in einem Schritt. Beide bleiben im Journal stehen.
          </WarningNotice>
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">Ab wann führen Sie hier Buch?</legend>
          <StepChoice
            group="opening-start"
            checked={fromStart}
            onChoose={() => setFromStart(true)}
            title={`Ab Beginn des Geschäftsjahres (${formatDate(fiscalYear.startDate)})`}
          />
          <StepChoice
            group="opening-start"
            checked={!fromStart}
            onChoose={() => setFromStart(false)}
            title="Ab einem späteren Tag"
            hint={
              'Dann tragen Sie die Saldi per diesem Tag ein, auch die Aufwände und Erträge des '
              + 'laufenden Jahres bis dahin. Nur so ist die Erfolgsrechnung dieses Jahres '
              + 'vollständig.'
            }
          />
          {!fromStart && (
            <TextField
              label="Erster Buchungstag"
              type="date"
              value={startsOn}
              min={fiscalYear.startDate}
              max={fiscalYear.endDate}
              onChange={(event) => setStartsOn(event.target.value)}
              className="w-[180px]"
            />
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="sr-only">Womit beginnen Sie?</legend>
          <StepChoice
            group="opening-kind"
            checked={!carriesBalances}
            onChoose={() => setCarriesBalances(false)}
            title="Ich fange bei null an"
            hint="Es entsteht keine Eröffnungsbuchung."
          />
          <StepChoice
            group="opening-kind"
            checked={carriesBalances}
            onChoose={() => setCarriesBalances(true)}
            title="Ich habe eine Bilanz vom Treuhänder"
          />
        </fieldset>

        {carriesBalances && (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-text-secondary">
                  <th className="py-1.5 pr-3 font-medium">Konto</th>
                  <th className="w-[150px] py-1.5 pr-3 text-right font-medium">Soll</th>
                  <th className="w-[150px] py-1.5 text-right font-medium">Haben</th>
                </tr>
              </thead>
              <tbody>
                {shown.rows.map((row, index) => (
                  <tr key={`${row.accountId ?? 'new'}-${index}`} className="border-b border-line-subtle">
                    <td className="py-1.5 pr-3">
                      {/* A bare control with an `aria-label`, the way the entry grid does it: a
                          labelled field per cell would print the word «Konto» nine times. */}
                      <select
                        aria-label={`Konto Zeile ${index + 1}`}
                        value={row.accountId === null ? '' : String(row.accountId)}
                        onChange={(event) => {
                          const picked = accountOf(accounts.data?.content, event.target.value)
                          setRow(index, {
                            accountId: picked?.id ?? null,
                            accountNumber: picked?.accountNumber ?? '',
                            accountName: picked?.name ?? '',
                          })
                          // A grid that runs out of rows is a grid nobody can add to.
                          if (index === form.rows.length - 1 && picked !== undefined) {
                            setForm((current) => ({ rows: [...current.rows, emptyRow()] }))
                          }
                        }}
                        className="h-8 w-full rounded-[var(--radius-sm)] border border-line bg-transparent px-2 text-[13px] text-text-primary outline-none focus:border-accent"
                      >
                        <option value="">Konto wählen …</option>
                        {(accounts.data?.content ?? []).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.accountNumber} {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-3">
                      <AmountInput
                        label="Soll"
                        value={row.debit ?? ''}
                        proposed={row.proposed}
                        onChange={(value) => setRow(index, { debit: value })}
                      />
                    </td>
                    <td className="py-1.5">
                      <AmountInput
                        label="Haben"
                        value={row.credit ?? ''}
                        onChange={(value) => setRow(index, { credit: value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Always there, even at 0.00: a difference that only appears when it is wrong is
                one nobody looks for. */}
            <p className={`text-[13px] tabular-nums${balance.difference === 0 ? '' : ' text-danger'}`}>
              Soll {formatAmount(balance.debit)} = Haben {formatAmount(balance.credit)} · Differenz{' '}
              {formatAmount(balance.difference)}
            </p>

            <OpenItemLine
              tenantId={tenantId}
              mayRead={mayReadInvoices}
              rows={totals.data?.rows ?? []}
              startsOn={fromStart ? fiscalYear.startDate : startsOn}
              hasProposal={suggestion.some((line) => line.fromOpenItems)}
            />
          </>
        )}

        {replacing && carriesBalances && (
          <TextField
            label="Grund"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            hint="Pflicht. Er steht als Stornogrund im Journal und erklärt zehn Jahre später, warum dort zwei Eröffnungen stehen."
          />
        )}

        {!mayConfigure && (
          <MissingRightHint right="ACCOUNTING_CONFIGURE" name="Buchhaltung einrichten" />
        )}
        {!mayClose && <MissingRightHint right="ACCOUNTING_CLOSE" name="Geschäftsjahr führen" />}
        {blocker !== undefined && !missingRight && <WarningNotice>{blocker}</WarningNotice>}
        {save.error !== null && <ErrorNotice error={save.error} />}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onBack}>
            Zurück
          </Button>
          <Button disabled={blocked} busy={save.isPending} onClick={() => save.mutate()}>
            {carriesBalances
              ? replacing
                ? 'Eröffnungsbuchung ersetzen'
                : 'Eröffnung buchen'
              : 'Fertig'}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

/**
 * The reconciliation line: what the sales ledger has open today, and what that does and does not
 * say about the opening balance sheet.
 *
 * <p>The one place in the whole module where the general ledger and a sub-ledger are held against
 * each other in this stage — once in the life of a tenant. The running reconciliation report
 * comes later; this line says outright that it shows today.
 */
function OpenItemLine({
  mayRead,
  rows,
  startsOn,
  hasProposal,
}: {
  tenantId: number
  mayRead: boolean
  rows: readonly { currencyCode: string; openTotal: number; count: number }[]
  startsOn: string
  hasProposal: boolean
}) {
  if (!mayRead) {
    return (
      <p className="text-[12px] text-text-secondary">
        Ihr Debitorensaldo lässt sich hier nicht anzeigen: dafür fehlt Ihnen das Recht{' '}
        <em>Rechnungen lesen</em> (<code>INVOICE_READ</code>). Die Zahl steht unter Verkauf →
        Offene Posten.
      </p>
    )
  }
  if (rows.length === 0) return null
  const said = rows
    .map((row) => `${formatAmount(row.openTotal)} ${row.currencyCode} aus ${row.count} Rechnungen`)
    .join(', ')
  return (
    <p className="text-[12px] text-text-secondary">
      Offene Posten heute: {said}.
      {hasProposal
        ? ' Der Vorschlag auf dem Debitorenkonto stammt aus dieser Zahl.'
        : ' Ohne Debitorensammelkonto im Kontenplan wird nichts vorbelegt.'}{' '}
      Ihre Eröffnungsbilanz ist auf den {formatDate(startsOn)} datiert; Zahlungen seither erklären
      eine Differenz — überschreiben Sie den Betrag dann mit dem Wert aus der Bilanz Ihres
      Treuhänders.
    </p>
  )
}

/** One amount cell, with the mark that says the figure was proposed rather than typed. */
function AmountInput({
  label,
  value,
  proposed,
  onChange,
}: {
  label: string
  value: string
  proposed?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {proposed === true && (
        <span className="shrink-0 text-[11px] text-text-tertiary" title="Aus den offenen Posten von heute">
          Vorschlag
        </span>
      )}
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-[120px] rounded-[var(--radius-sm)] border border-line bg-transparent px-2 text-right font-mono text-[13px] tabular-nums outline-none focus:border-accent"
      />
    </div>
  )
}

/** The account behind a picked id, or nothing where the empty option was chosen. */
function accountOf(accounts: readonly Account[] | undefined, value: string): Account | undefined {
  if (value === '') return undefined
  return (accounts ?? []).find((account) => String(account.id) === value)
}
