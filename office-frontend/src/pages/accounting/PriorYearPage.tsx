import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { LinkButton } from '../../components/LinkButton'
import {
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  WarningNotice,
} from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextAreaField } from '../../components/TextAreaField'
import { useAuth } from '../../auth/useAuth'
import { RequireTenant } from '../../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETUP_PATH,
  accountsKey,
  capturePriorYearBalances,
  createFiscalYear,
  fetchAccounts,
  fetchFiscalYearPreview,
  fetchFiscalYears,
  fetchPriorYearBalances,
  FISCAL_YEAR_STATUS,
  FISCAL_YEARS_PATH,
  fiscalYearPreviewKey,
  fiscalYearsKey,
  JOURNAL_PATH,
  openingEntryKey,
  priorYearBalancesKey,
  setupStateKey,
} from '../../lib/accounting'
import { formatAmount, formatDate } from '../../lib/format'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import type {
  Account,
  AccountType,
  FiscalYear,
  FiscalYearList,
  OpeningEntryOutcome,
  PriorYearBalances,
} from '../../lib/types'
import { MissingRightHint } from './MissingRightHint'
import {
  emptyPriorYearRow,
  followingYearOf,
  priorYearBalanceOf,
  priorYearBlockerOf,
  priorYearCandidateOf,
  priorYearFormOf,
  priorYearRequestOf,
  priorYearResultOf,
  yearBeforeOf,
  type PriorYearForm,
} from './priorYearForm'

/** The chart is read whole: a picker wants every account, not a page. */
const ACCOUNT_QUERY = listQuery({ activeOnly: true, size: PICKER_SIZE, sort: 'accountNumber,asc' })

/**
 * «Vorjahressaldi»: the figures of the year before the changeover, captured as the opening entry
 * of that year.
 *
 * <p><b>What it writes is one entry, and it is the same entry the setup wizard writes</b> — an
 * `OPENING` entry of the captured year, dated on its last day and derived there, never sent.
 * That is what lets the closing run of that year find it as its opening entry and carry it
 * forward, and what fills the prior year column of the two statements of the year after.
 *
 * <p><b>The balances are captured before the appropriation of the result</b> (backend
 * ADR-0125): balance sheet accounts and income accounts as they stood on the last day, the
 * result still on the income accounts and not yet in the equity. The subtitle says so in one
 * sentence, because a trial balance after the closing entries looks alike and books twice.
 *
 * <p><b>Reading is on `ACCOUNTING_READ`, writing on `ACCOUNTING_CLOSE`</b>, the way step three
 * of the setup wizard does it: whoever may only read still sees what stands and which right is
 * missing, rather than a forbidden page. The module switch stands on the route, because the one
 * thing this screen is for is a writing way.
 *
 * <p><b>No menu entry, and that is decided.</b> A tenant does this once; the screen is reached
 * from where the question arises — the fiscal year screen, the note under a statement without a
 * prior year, step three of the wizard — and by its address with the year named
 * (`?fiscalYearId=`).
 */
export function PriorYearPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <PriorYear tenantId={tenantId} />}
    </RequireTenant>
  )
}

function PriorYear({ tenantId }: { tenantId: number }) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { can } = useAuth()
  const mayClose = can(ACCOUNTING_RIGHTS.close)

  // Preselected where the fiscal year screen named one — the statement and the wizard name
  // none, because where they lead here the prior year does not exist yet. Read once, in the
  // initialiser: it is where the screen was opened from, and reading it again later would fight
  // with whatever somebody has picked since.
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(() => {
    const named = new URLSearchParams(location.search).get('fiscalYearId')
    return named === null ? null : Number(named)
  })
  const [saved, setSaved] = useState<OpeningEntryOutcome | null>(null)

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  const year = priorYearCandidateOf(available, fiscalYearId)
  const following = year === undefined ? undefined : followingYearOf(available, year)

  const balances = useQuery({
    queryKey: priorYearBalancesKey(tenantId, year?.id ?? 0),
    queryFn: () => fetchPriorYearBalances(tenantId, year?.id ?? 0),
    enabled: year !== undefined,
  })

  const accounts = useQuery({
    queryKey: accountsKey(tenantId, ACCOUNT_QUERY),
    queryFn: () => fetchAccounts(tenantId, ACCOUNT_QUERY),
  })

  // The year before the earliest one, named by the calculator of the backend so a split year
  // is called what every other year of this tenant is called. Asked as soon as the list is
  // there: the button has to carry the name before anybody presses it.
  const before = yearBeforeOf(available)
  const preview = useQuery({
    queryKey: fiscalYearPreviewKey(tenantId, before?.startDate ?? '', before?.endDate ?? ''),
    queryFn: () => fetchFiscalYearPreview(tenantId, before?.startDate ?? '', before?.endDate ?? ''),
    enabled: before !== undefined,
  })

  const create = useMutation({
    mutationFn: () => {
      if (before === undefined || preview.data === undefined) {
        return Promise.reject(new Error('Das Jahr davor lässt sich noch nicht bestimmen.'))
      }
      return createFiscalYear(tenantId, {
        label: preview.data.label,
        numberYear: preview.data.numberYear,
        startDate: before.startDate,
        endDate: before.endDate,
        createFollowingYear: false,
      })
    },
    onSuccess: (list: FiscalYearList) => {
      queryClient.setQueryData(fiscalYearsKey(tenantId), list)
      void queryClient.invalidateQueries({ queryKey: setupStateKey(tenantId) })
      // The year that was just laid out is the one to capture: pick it.
      const created = list.years.find((candidate) => candidate.startDate === before?.startDate)
      if (created !== undefined) {
        setFiscalYearId(created.id)
        setSaved(null)
      }
    },
  })

  if (years.isLoading) return <LoadingBlock />
  if (years.error !== null) {
    return (
      <>
        <PageHeader title="Vorjahressaldi" back={{ to: FISCAL_YEARS_PATH, label: 'Geschäftsjahre' }} />
        <div className="px-8 pb-12">
          <ErrorNotice error={years.error} />
        </div>
      </>
    )
  }

  if (year === undefined) {
    return (
      <>
        <PageHeader title="Vorjahressaldi" back={{ to: FISCAL_YEARS_PATH, label: 'Geschäftsjahre' }} />
        <div className="px-8 pb-12">
          <Panel>
            <EmptyState
              title="Noch kein Geschäftsjahr"
              description="Das Vorjahr wird als Geschäftsjahr vor dem ersten Jahr angelegt, das Sie hier führen. Dieses erste Jahr entsteht im Einrichtungsassistenten."
            >
              <LinkButton to={ACCOUNTING_SETUP_PATH}>Buchhaltung einrichten</LinkButton>
            </EmptyState>
          </Panel>
        </div>
      </>
    )
  }

  const typeById = new Map<number, AccountType>(
    (accounts.data?.content ?? []).map((account) => [account.id, account.accountType]),
  )
  // Offered only once the calculator has named it and raised no objection — a range that
  // collides with an existing year answers with `error`, and then there is nothing to lay out.
  const yearBefore =
    before !== undefined && preview.data !== undefined && preview.data.error === ''
      ? preview.data
      : undefined

  return (
    <>
      <PageHeader
        title={`Vorjahressaldi ${year.label}`}
        subtitle={
          <>
            Erfasst werden die Salden per {formatDate(year.endDate)} <strong>vor</strong> den
            Abschlussbuchungen — Bestandes- und Erfolgskonten. Das Ergebnis steht noch auf den
            Erfolgskonten, nicht im Eigenkapital.
          </>
        }
        back={{ to: FISCAL_YEARS_PATH, label: 'Geschäftsjahre' }}
      />

      <div className="grid gap-4 px-8 pb-12">
        <Panel>
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <SelectField
                label="Geschäftsjahr"
                value={String(year.id)}
                onChange={(event) => {
                  setFiscalYearId(Number(event.target.value))
                  setSaved(null)
                }}
                className="w-[320px]"
              >
                {available.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label} · {formatDate(candidate.startDate)} –{' '}
                    {formatDate(candidate.endDate)} · {FISCAL_YEAR_STATUS[candidate.status]}
                  </option>
                ))}
              </SelectField>
              {/* The year before the changeover is, by its nature, before every year in the
                  list. Where it is not laid out yet, this is the way to it — without leaving
                  for the fiscal year screen and coming back. */}
              {yearBefore !== undefined && (
                <div className="grid gap-1">
                  <span className="text-[12px] text-text-secondary">
                    Fehlt das Jahr davor noch?
                  </span>
                  <Button
                    variant="secondary"
                    busy={create.isPending}
                    onClick={() => create.mutate()}
                  >
                    {`${yearBefore.label} anlegen`}
                  </Button>
                </div>
              )}
            </div>

            <p className="text-[13px] text-text-secondary">
              Tragen Sie die Saldenliste per {formatDate(year.endDate)} ein, wie sie Ihr
              Treuhänder geliefert hat. Was Sie speichern, ist die Eröffnungsbuchung von{' '}
              {year.label} per {formatDate(year.endDate)} — dieselbe Buchung, die der
              Einrichtungsassistent schreibt — und füllt die Vorjahresspalte von Bilanz und
              Erfolgsrechnung {following === undefined ? 'des Folgejahres' : following.label}.
              Die Differenz muss auf 0.00 aufgehen; das Jahresergebnis ergibt sich aus den
              Erfolgskonten und wird darunter zur Kontrolle gerechnet.
            </p>

            {create.error !== null && <ErrorNotice error={create.error} />}
          </div>
        </Panel>

        {saved !== null && (
          <Panel>
            <p role="status" className="text-[13px]">
              Die Vorjahressaldi {year.label} sind als Eröffnungsbuchung{' '}
              <span className="font-mono tabular-nums">{saved.entryNumber}</span> per{' '}
              {formatDate(saved.bookingDate)} verbucht.
              {saved.replacedEntryNumber
                ? ` Die bisherige ${saved.replacedEntryNumber} wurde mit ${saved.reversalEntryNumber ?? '–'} storniert; beide bleiben im Journal stehen.`
                : ''}{' '}
              Sie stehen jetzt in der Vorjahresspalte von Bilanz und Erfolgsrechnung{' '}
              {following === undefined ? 'des Folgejahres' : following.label}.{' '}
              <Link
                to={`${JOURNAL_PATH}?fiscalYearId=${year.id}`}
                className="text-accent-text underline underline-offset-2"
              >
                Journal {year.label} ansehen
              </Link>
            </p>
          </Panel>
        )}

        {balances.isLoading && <LoadingBlock />}
        {balances.error !== null && <ErrorNotice error={balances.error} />}

        {balances.data !== undefined && (
          <>
            {/* Announced and not refused: the closing run of this year replaces that entry, and
                the screen says so before anything is typed. The button stays on. */}
            {balances.data.notice && (
              <WarningNotice>
                {balances.data.notice}{' '}
                {following !== undefined && (
                  <Link
                    to={`${JOURNAL_PATH}?fiscalYearId=${following.id}`}
                    className="text-accent-text underline underline-offset-2"
                  >
                    Eröffnungsbuchung {following.label} ansehen
                  </Link>
                )}
              </WarningNotice>
            )}

            {balances.data.blockedBy ? (
              // Rule 6: a year that holds other posted entries is carried over as a whole or not
              // at all. The sentence is the backend's, and the way on is the journal of that year.
              <WarningNotice>
                {balances.data.blockedBy}{' '}
                <Link
                  to={`${JOURNAL_PATH}?fiscalYearId=${year.id}`}
                  className="text-accent-text underline underline-offset-2"
                >
                  Journal {year.label} ansehen
                </Link>
              </WarningNotice>
            ) : (
              <Capture
                key={`${year.id}:${balances.data.entryId ?? 'none'}`}
                tenantId={tenantId}
                year={year}
                balances={balances.data}
                accounts={accounts.data?.content ?? []}
                typeOf={(accountId) => typeById.get(accountId)}
                mayClose={mayClose}
                onSaved={setSaved}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * The grid, the two lines under it and the button — on one year, with what it already carries.
 *
 * <p>Keyed by the parent on year and entry, so a switch of the year or a fresh answer after a
 * save starts a fresh grid rather than patching the old one.
 */
function Capture({
  tenantId,
  year,
  balances,
  accounts,
  typeOf,
  mayClose,
  onSaved,
}: {
  tenantId: number
  year: FiscalYear
  balances: PriorYearBalances
  accounts: readonly Account[]
  typeOf: (accountId: number) => AccountType | undefined
  mayClose: boolean
  onSaved: (outcome: OpeningEntryOutcome) => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PriorYearForm>(() => priorYearFormOf(balances.lines))
  const [replacing, setReplacing] = useState(false)
  const captured = balances.captured

  const save = useMutation({
    mutationFn: (reason: string) =>
      capturePriorYearBalances(tenantId, year.id, priorYearRequestOf(form, captured, reason)),
    onSuccess: (outcome) => {
      void queryClient.invalidateQueries({ queryKey: priorYearBalancesKey(tenantId, year.id) })
      void queryClient.invalidateQueries({ queryKey: openingEntryKey(tenantId, year.id) })
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: setupStateKey(tenantId) })
      setReplacing(false)
      onSaved(outcome)
    },
  })

  const balance = priorYearBalanceOf(form)
  const blocker = priorYearBlockerOf(form)
  const result = priorYearResultOf(form, typeOf)
  const blocked = blocker !== undefined || !mayClose || save.isPending

  const setRow = (index: number, changed: Partial<PriorYearForm['rows'][number]>) =>
    setForm((current) => ({
      rows: current.rows.map((row, at) => (at === index ? { ...row, ...changed } : row)),
    }))

  return (
    <Panel>
      <div className="grid gap-5">
        {/* A year that already carries an opening is not corrected — it is replaced: the old
            entry is reversed and the new one written in one transaction, and both stay in the
            journal (GeBüV Art. 3). Whether it was captured here or written by the wizard as
            «EB-…» makes no difference: it is the opening entry of this year either way. */}
        {captured && (
          <WarningNotice>
            Für {year.label} besteht bereits die Eröffnungsbuchung {balances.entryNumber} vom{' '}
            {formatDate(balances.bookingDate)}. Was Sie hier speichern, <strong>ersetzt</strong>{' '}
            sie: die bestehende wird storniert und die neue gebucht, beides in einem Schritt.
            Beide bleiben im Journal stehen.
          </WarningNotice>
        )}

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-text-secondary">
              <th className="py-1.5 pr-3 font-medium">Konto</th>
              <th className="w-[150px] py-1.5 pr-3 text-right font-medium">Soll</th>
              <th className="w-[150px] py-1.5 text-right font-medium">Haben</th>
            </tr>
          </thead>
          <tbody>
            {form.rows.map((row, index) => (
              <tr key={`${row.accountId ?? 'new'}-${index}`} className="border-b border-line-subtle">
                <td className="py-1.5 pr-3">
                  {/* A bare control with an `aria-label`, the way the opening grid does it: a
                      labelled field per cell would print the word «Konto» twenty times. */}
                  <select
                    aria-label={`Konto Zeile ${index + 1}`}
                    value={row.accountId === null ? '' : String(row.accountId)}
                    onChange={(event) => {
                      const picked = accountOf(accounts, event.target.value)
                      setRow(index, {
                        accountId: picked?.id ?? null,
                        accountNumber: picked?.accountNumber ?? '',
                        accountName: picked?.name ?? '',
                      })
                      // A grid that runs out of rows is a grid nobody can add to.
                      if (index === form.rows.length - 1 && picked !== undefined) {
                        setForm((current) => ({ rows: [...current.rows, emptyPriorYearRow()] }))
                      }
                    }}
                    className="h-8 w-full rounded-[var(--radius-sm)] border border-line bg-transparent px-2 text-[13px] text-text-primary outline-none focus:border-accent"
                  >
                    <option value="">Konto wählen …</option>
                    {/* A captured account that is no longer in today's chart keeps its row: the
                        frozen number and name are what stood on the entry line. */}
                    {row.accountId !== null && !accounts.some((account) => account.id === row.accountId) && (
                      <option value={row.accountId}>
                        {row.accountNumber} {row.accountName}
                      </option>
                    )}
                    {accounts.map((account) => (
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

        {/* Always there, even at 0.00: a difference that only appears when it is wrong is one
            nobody looks for. */}
        <p className={`text-[13px] tabular-nums${balance.difference === 0 ? '' : ' text-danger'}`}>
          Soll {formatAmount(balance.debit)} = Haben {formatAmount(balance.credit)} · Differenz{' '}
          {formatAmount(balance.difference)}
        </p>

        {/* The control figure somebody holds against the closing of their fiduciary. Worked
            out from the income accounts among the typed rows and never sent. */}
        <p className="text-[13px] text-text-secondary tabular-nums">
          Jahresergebnis {year.label} (rechnerisch):{' '}
          {result.hasIncomeRows ? resultSentence(result.result) : (
            'noch keine Erfolgskonten erfasst — ohne sie bleibt die Erfolgsrechnung '
            + `${year.label} leer und die Vorjahresspalte trägt ihren Vermerk.`
          )}
        </p>

        {!mayClose && <MissingRightHint right="ACCOUNTING_CLOSE" name="Geschäftsjahr führen" />}
        {blocker !== undefined && mayClose && <WarningNotice>{blocker}</WarningNotice>}
        {save.error !== null && !replacing && <ErrorNotice error={save.error} />}

        <div className="flex justify-end gap-2">
          <LinkButton to={FISCAL_YEARS_PATH} variant="secondary">
            Abbrechen
          </LinkButton>
          <Button
            disabled={blocked}
            busy={save.isPending && !replacing}
            onClick={() => (captured ? setReplacing(true) : save.mutate(''))}
          >
            {captured ? 'Vorjahressaldi ersetzen' : 'Speichern und verbuchen'}
          </Button>
        </div>
      </div>

      <ReplaceDialog
        open={replacing}
        yearLabel={year.label}
        entryNumber={balances.entryNumber ?? ''}
        busy={save.isPending}
        error={save.error}
        onReplace={(reason) => save.mutate(reason)}
        onClose={() => setReplacing(false)}
      />
    </Panel>
  )
}

/**
 * «Vorjahressaldi ersetzen»: the one question this screen asks, and it asks for a reason.
 *
 * <p><b>The reason is compulsory here and in the backend.</b> It becomes the reversal reason in
 * the journal and explains ten years later why two openings stand there. The button stays off
 * while the field is empty rather than answering 400 to a click somebody could have been spared.
 */
function ReplaceDialog({
  open,
  yearLabel,
  entryNumber,
  busy,
  error,
  onReplace,
  onClose,
}: {
  open: boolean
  yearLabel: string
  entryNumber: string
  busy: boolean
  error: unknown
  onReplace: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const said = reason.trim()
  const ready = said !== ''

  const replace = () => {
    if (!ready || busy) return
    onReplace(said)
  }

  const close = () => {
    setReason('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Vorjahressaldi ${yearLabel} ersetzen`}
      description="Die bestehende Eröffnungsbuchung wird storniert, nicht gelöscht."
      onSubmit={replace}
      initialFocus={field}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button onClick={replace} disabled={!ready} busy={busy} shortcut>
            Ersetzen und verbuchen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <WarningNotice>
          Die Eröffnungsbuchung {entryNumber} wird storniert und die neue gebucht, beides in
          einem Schritt. Beide bleiben im Journal stehen.
        </WarningNotice>

        <TextAreaField
          ref={field}
          label="Grund"
          rows={3}
          value={reason}
          maxLength={200}
          hint="Pflicht. Er steht als Stornogrund im Journal und erklärt zehn Jahre später, warum dort zwei Eröffnungen stehen."
          onChange={(event) => setReason(event.target.value)}
        />

        {error !== null && error !== undefined && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}

/** One amount cell. */
function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-end">
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

/** Profit, loss or neither — as the control line says it. */
function resultSentence(result: number): string {
  if (result > 0) return `Gewinn ${formatAmount(result)}`
  if (result < 0) return `Verlust ${formatAmount(-result)}`
  return 'ausgeglichen, 0.00'
}

/** The account behind a picked id, or nothing where the empty option was chosen. */
function accountOf(accounts: readonly Account[], value: string): Account | undefined {
  if (value === '') return undefined
  return accounts.find((account) => String(account.id) === value)
}
