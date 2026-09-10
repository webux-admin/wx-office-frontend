import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CircleAlert, CircleDashed, FileText } from 'lucide-react'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import {
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  ModuleOffNotice,
  WarningNotice,
} from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  blockingChecks,
  closeFiscalYear,
  closingChecksOf,
  closingKey,
  closingPreviewKey,
  entryKey,
  fetchClosing,
  fetchEntry,
  fetchClosingPreview,
  fetchFiscalYears,
  fetchYearLog,
  fiscalYearsKey,
  FISCAL_YEAR_STATUS,
  FISCAL_YEARS_PATH,
  reopenFiscalYear,
  yearLogKey,
  yearLogLabel,
} from '../lib/accounting'
import {
  fetchReportArchive,
  REPORT_NAMES,
  reportArchiveFileUrl,
  reportArchiveKey,
} from '../lib/accountingReports'
import { api } from '../lib/api'
import { showFile } from '../lib/files'
import { useRunsModule } from '../lib/modules'
import { formatAmount, formatByteCount, formatDate, formatDateTime } from '../lib/format'
import type {
  ArchivedReport,
  ClosingCheck,
  ClosingEntry,
  ClosingPreview,
  FiscalYear,
  YearLogLine,
} from '../lib/types'
import { EntryLinesView } from './accounting/EntryLinesView'
import {
  accrualLineOf,
  accrualRefusal,
  appropriationSentence,
  asksCarryForward,
  blockingLaterYear,
  canContinue,
  carriesNoResult,
  carryForwardHint,
  checkTone,
  CLOSING_STEPS,
  closingRunsOf,
  closingSummarySentence,
  defaultClosingYear,
  filedPapersSentence,
  laterYearSentence,
  nextStep,
  previousStep,
  showsWizard,
  sortedChecks,
  type ClosingStep,
} from './accounting/closingWizard'
import { MissingRightHint } from './accounting/MissingRightHint'
import { ReopenDialog } from './accounting/ReopenDialog'

/**
 * «Abschluss»: the year-end run in three steps, and what a run left behind.
 *
 * <p><b>One screen with two faces, chosen by the state of the year.</b> An open or locked year
 * shows the wizard; a closed one shows what its close did and the way back out. Two screens would
 * mean two menu entries for one subject, and somebody looking for «wo schliesse ich ab» would
 * have to know beforehand whether it is done.
 *
 * <p><b>Reading is on `ACCOUNTING_READ` and the run on `ACCOUNTING_CLOSE`.</b> What a close did is
 * part of the books; deciding that a year is finished is not something everybody who books does.
 * A visitor without the closing right sees the summary and a line saying which right is missing,
 * rather than a forbidden page — that is the more useful answer.
 *
 * <p><b>The module switch takes the two buttons away and nothing else</b> — it is not passed to
 * `RequireTenant`, and that is decided rather than forgotten. What a close did and what happened
 * to a year stay readable for ten years, module or no module (OR Art. 958f, backend ADR-0119),
 * and every reading endpoint behind this screen — the years, the summary, the trail, the lines
 * of an entry, the archive and a filed paper — answers 200 while it is off. Shutting the whole
 * page would hide the one place that says the bookkeeping was switched off — the same reason the
 * list of issued reminders carries no switch (ADR-0032). The two writing endpoints answer 409, so
 * the wizard and «Wieder öffnen» go and a `ModuleOffNotice` stands in their place.
 */
export function ClosingPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read}>
      {(tenantId) => <Closing tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Closing({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const runsAccounting = runs(ACCOUNTING_MODULE)
  const mayClose = can(ACCOUNTING_RIGHTS.close)
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null)

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  const chosen = fiscalYearId ?? defaultClosingYear(available)?.id ?? null
  const year = available.find((entry) => entry.id === chosen)

  return (
    <>
      <PageHeader
        title="Abschluss"
        subtitle="Erfolgskonten schliessen, das Ergebnis vortragen und das Folgejahr eröffnen — OR Art. 958."
        back={{ to: FISCAL_YEARS_PATH, label: 'Geschäftsjahre' }}
      />

      <div className="grid gap-4 px-8 pb-12">
        <SelectField
          label="Geschäftsjahr"
          value={chosen === null ? '' : String(chosen)}
          onChange={(event) =>
            setFiscalYearId(event.target.value === '' ? null : Number(event.target.value))
          }
          className="w-[220px]"
        >
          {available.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label} — {FISCAL_YEAR_STATUS[entry.status]}
            </option>
          ))}
        </SelectField>

        {/* One of the five states at a time, and the failure first of them. A list that could
            not be read is not an empty list: «Es gibt noch kein Geschäftsjahr» beside «Das
            Backend meldet einen Fehler» would send somebody to create a year that stands. */}
        {years.error !== null && years.error !== undefined ? (
          <ErrorNotice error={years.error} />
        ) : available.length === 0 && !years.isLoading ? (
          <EmptyState title="Noch kein Geschäftsjahr">
            Ohne Geschäftsjahr gibt es nichts abzuschliessen. Legen Sie eines unter
            Buchhaltung → Geschäftsjahre an.
          </EmptyState>
        ) : years.isPending || year === undefined ? (
          <LoadingBlock />
        ) : (
          <>
            {/* The fifth state of this screen. It stands in place of the two buttons and takes
                nothing else with it: the year, its state, what its close did and its trail all
                stay on screen, because all of that is readable for ten years whether or not the
                tenant still runs the module (OR Art. 958f). */}
            {!runsAccounting && (
              <Panel padded={false}>
                <ModuleOffNotice module={ACCOUNTING_MODULE} />
              </Panel>
            )}

            {showsWizard(year) ? (
              runsAccounting && (
                <ClosingWizard
                  key={year.id}
                  tenantId={tenantId}
                  year={year}
                  mayClose={mayClose}
                  // Pinned the moment the run succeeds. Without it the picker would jump: the run
                  // opens the following year, and «the oldest year that is not closed» is then
                  // that new one — the result panel would be unmounted before anybody read it.
                  onClosed={() => setFiscalYearId(year.id)}
                />
              )
            ) : (
              <ClosedYear
                key={year.id}
                tenantId={tenantId}
                year={year}
                years={available}
                mayClose={mayClose}
                runsAccounting={runsAccounting}
                onPickYear={setFiscalYearId}
              />
            )}

            {/* Beside both faces and not inside one of them: the trail belongs to the year and
                not to its close, and the sketch of the issue shows it under an open year too. */}
            <YearTrail tenantId={tenantId} year={year} />
          </>
        )}
      </div>
    </>
  )
}

// --- the three steps -------------------------------------------------------------------------

/**
 * The wizard of an open year: check, confirm, carry forward.
 *
 * <p>Keyed on the year in its caller, so switching the picker starts a fresh wizard rather than
 * carrying a tick from one year into another.
 *
 * <p><b>The accrual confirmation stops the run, never the walk.</b> All three steps are walkable
 * with the box untouched; «Abschluss durchführen» stays off while it is, with the sentence the
 * run would refuse with beside it (`accrualRefusal`). The same screen treats the reason of the
 * reopening that way, and a compulsory answer enforced only by a 400 is one the mask calls
 * optional.
 */
function ClosingWizard({
  tenantId,
  year,
  mayClose,
  onClosed,
}: {
  tenantId: number
  year: FiscalYear
  mayClose: boolean
  /** Called once the run has succeeded, so the caller can keep this year on screen. */
  onClosed: () => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<ClosingStep>('CHECKS')
  const [accrualsConfirmed, setAccrualsConfirmed] = useState(false)
  const [reconciliationConfirmed, setReconciliationConfirmed] = useState(false)
  const [carryForwardAccount, setCarryForwardAccount] = useState<string | null>(null)

  const preview = useQuery({
    queryKey: closingPreviewKey(tenantId, year.id),
    queryFn: () => fetchClosingPreview(tenantId, year.id),
    // Needs ACCOUNTING_CLOSE: it serves this wizard alone and shares its right. Without it the
    // request would answer 403, and the screen says which right is missing instead.
    enabled: mayClose,
    placeholderData: keepPreviousData,
  })

  const run = useMutation({
    mutationFn: () =>
      closeFiscalYear(tenantId, year.id, {
        accrualsConfirmed,
        carryForwardAccountNumber: carryForwardAccount,
        reconciliationConfirmed,
      }),
    onSuccess: () => {
      // Before the list refetches. The run has just opened the following year, and «the oldest
      // year that is not closed» would then be that new one — the picker would jump to 2027 and
      // show its wizard, while the person is still reading what happened to 2026.
      onClosed()
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: closingKey(tenantId, year.id) })
      void queryClient.invalidateQueries({ queryKey: closingPreviewKey(tenantId, year.id) })
      // The run writes two lines into the trail — the accrual confirmation and the state.
      void queryClient.invalidateQueries({ queryKey: yearLogKey(tenantId, year.id) })
      // And it files the five papers as its thirteenth step (backend ADR-0125): the cupboard of
      // this year has to be read again, or a year closed a second time would show one run.
      void queryClient.invalidateQueries({ queryKey: reportArchiveKey(tenantId, year.id) })
    },
  })

  if (!mayClose) {
    return (
      <Panel title={`Geschäftsjahr ${year.label} abschliessen`}>
        <MissingRightHint right={ACCOUNTING_RIGHTS.close} name="Abschluss" />
      </Panel>
    )
  }
  if (preview.error !== null && preview.error !== undefined) {
    return <ErrorNotice error={preview.error} />
  }
  if (preview.isPending) {
    return <LoadingBlock />
  }

  const data = preview.data
  // The ten the run answered with, where it refused; otherwise the ten of the preview. The
  // refusal carries all ten, so the list does not shrink to the red ones at the moment one
  // turns red.
  const refused = closingChecksOf(run.error)
  const checks = refused.length > 0 ? refused : data.checks
  // What the run would refuse with, said before the click instead of after it. It never touches
  // «Weiter»: the wizard walks all three steps with the box untouched, and only the run stops.
  const refusal = accrualRefusal(accrualsConfirmed)

  return (
    <div className="grid gap-4">
      <StepBar step={step} />

      {step === 'CHECKS' && <ChecksStep year={year} preview={data} checks={checks} />}

      {step === 'ACCRUALS' && (
        <AccrualsStep
          preview={data}
          accrualsConfirmed={accrualsConfirmed}
          reconciliationConfirmed={reconciliationConfirmed}
          onAccrualsChange={setAccrualsConfirmed}
          onReconciliationChange={setReconciliationConfirmed}
        />
      )}

      {step === 'CARRY_FORWARD' && (
        <CarryForwardStep
          preview={data}
          chosen={carryForwardAccount ?? data.carryForwardAccount ?? ''}
          onChosenChange={setCarryForwardAccount}
        />
      )}

      {/* Beside the run and not beside the box: this is the step on which the run is the next
          thing to happen, and the sentence is the backend's own. Named here rather than left to
          the tooltip of the dead button, so the reason is readable without a mouse. */}
      {step === 'CARRY_FORWARD' && refusal !== undefined && (
        <WarningNotice>
          {refusal} Der Haken steht im Schritt «Abgrenzungen»; «Zurück» führt dorthin.
        </WarningNotice>
      )}

      {run.error !== null && run.error !== undefined && (
        <ErrorNotice error={run.error}>
          {/* Only where the failure carries no findings — a finding says for itself what is
              missing. A paper that could not be laid out, a ledger out of balance or a network
              failure carry a sentence and nothing else, and the person is owed the one fact
              that sentence leaves out: the run is one transaction, and nothing of it stands. */}
          {refused.length === 0 && (
            <p className="text-[12px] text-text-secondary">
              Es wurde nichts gebucht und kein Geschäftsjahr angelegt: der Abschluss läuft als
              eine Transaktion, und ein Fehler nimmt alles mit — auch ein Papier, das nicht
              gezeichnet werden konnte.
            </p>
          )}
        </ErrorNotice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step !== 'CHECKS' && (
          <Button variant="secondary" onClick={() => setStep(previousStep(step))}>
            Zurück
          </Button>
        )}
        {step !== 'CARRY_FORWARD' ? (
          <Button
            onClick={() => setStep(nextStep(step))}
            disabled={!canContinue(step, data)}
            title={
              canContinue(step, data)
                ? undefined
                : 'Zuerst müssen die rot markierten Punkte erledigt werden.'
            }
          >
            Weiter
          </Button>
        ) : (
          <Button
            onClick={() => run.mutate()}
            busy={run.isPending}
            disabled={refusal !== undefined}
            title={refusal}
            shortcut
          >
            Abschluss durchführen
          </Button>
        )}
      </div>
    </div>
  )
}

/** Where the person is in the three steps. */
function StepBar({ step }: { step: ClosingStep }) {
  const index = CLOSING_STEPS.findIndex((entry) => entry.step === step)
  return (
    <ol className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
      {CLOSING_STEPS.map((entry, position) => (
        <li key={entry.step} className="flex items-center gap-1.5">
          <span
            className={`grid h-4 w-4 place-items-center rounded-[var(--radius-full)] text-[10px] ${
              position < index
                ? 'bg-accent text-white'
                : entry.step === step
                  ? 'bg-text-primary text-surface'
                  : 'bg-sunken text-text-tertiary'
            }`}
            aria-hidden
          >
            {position < index ? <Check size={11} /> : '•'}
          </span>
          <span className={entry.step === step ? 'font-medium' : 'text-text-secondary'}>
            {entry.title}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Step 1: the ten findings.
 *
 * <p>Every one of them is shown, and the ones that stop the run stand first. A screen that listed
 * only what is wrong would leave somebody wondering what was checked at all — and the ten are
 * the checklist a fiduciary works through.
 */
function ChecksStep({
  year,
  preview,
  checks,
}: {
  year: FiscalYear
  preview: ClosingPreview
  checks: ClosingCheck[]
}) {
  const blocking = blockingChecks(checks)
  return (
    <div className="grid gap-4">
      <Panel
        title={`Prüfung für ${year.label}`}
        description="Zehn Punkte, bevor gebucht wird. Was rot ist, hält den Abschluss auf."
      >
        <ol className="grid gap-2.5">
          {sortedChecks(checks).map((check) => (
            <li key={check.step} className="flex items-start gap-2.5">
              <CheckMark check={check} />
              <div className="grid gap-0.5">
                <p className="text-[13px]">
                  <span className="text-text-tertiary">{check.step}</span> {check.message}
                </p>
                {check.detail !== '' && (
                  <p className="whitespace-pre-line text-[12px] text-text-secondary">
                    {check.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {blocking.length > 0 && (
        <WarningNotice>
          {blocking.length === 1
            ? 'Ein Punkt hält den Abschluss auf. Erledigen Sie ihn und öffnen Sie diesen Bildschirm neu.'
            : `${blocking.length} Punkte halten den Abschluss auf. Erledigen Sie sie und öffnen Sie diesen Bildschirm neu.`}
        </WarningNotice>
      )}

      <p className="text-[12px] text-text-secondary">
        {`Das Jahresergebnis steht bei ${formatAmount(preview.expectedResult)}; die beiden`}
        {` Abschlussbuchungen bekämen zusammen ${preview.closingLineCount} Zeilen.`}
      </p>
    </div>
  )
}

/** One of the three marks a finding can carry. */
function CheckMark({ check }: { check: ClosingCheck }) {
  const tone = checkTone(check)
  if (tone === 'passed') {
    return <Check size={15} className="mt-0.5 shrink-0 text-accent" aria-label="erfüllt" />
  }
  if (tone === 'blocked') {
    return (
      <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-label="hält auf" />
    )
  }
  return (
    <CircleDashed
      size={15}
      className="mt-0.5 shrink-0 text-text-tertiary"
      aria-label="offen"
    />
  )
}

/**
 * Step 2: the compulsory click of OR Art. 958b Abs. 1.
 *
 * <p><b>A click and not a lock.</b> For somebody without a bookkeeping training the accrual is
 * the likeliest material mistake in an otherwise technically flawless income statement, and no
 * machine can find it: whether the December rent paid in January belongs to this year is a
 * question about the business and not about the data.
 */
function AccrualsStep({
  preview,
  accrualsConfirmed,
  reconciliationConfirmed,
  onAccrualsChange,
  onReconciliationChange,
}: {
  preview: ClosingPreview
  accrualsConfirmed: boolean
  reconciliationConfirmed: boolean
  onAccrualsChange: (on: boolean) => void
  onReconciliationChange: (on: boolean) => void
}) {
  return (
    <div className="grid gap-4">
      <Panel
        title="Zeitliche Abgrenzung"
        description="Gehören alle Aufwände und Erträge dieses Jahres wirklich in dieses Jahr?"
      >
        <div className="grid gap-4">
          {preview.accruals.length === 0 ? (
            <p className="text-[13px] text-text-secondary">
              Auf den Abgrenzungskonten steht in diesem Geschäftsjahr nichts. Das heisst nicht,
              dass nichts abzugrenzen wäre — es heisst, dass noch nichts abgegrenzt wurde.
            </p>
          ) : (
            <ul className="grid gap-1 text-[13px]">
              {preview.accruals.map((accrual) => (
                <li key={accrual.accountNumber} className="flex justify-between gap-4">
                  <span>
                    <span className="font-mono tabular-nums">{accrual.accountNumber}</span>{' '}
                    {accrual.accountName}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatAmount(accrual.amount)} ({accrual.entryCount})
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The two figures the relief of OR Art. 958b Abs. 2 hangs on. A tick without a
              figure beside it is a tick everybody sets, and neither number is one a person
              carries in their head. No switch is built out of the rule: whether a business may
              keep its books on receipts and payments is a judgement about that business
              (ADR-0117). */}
          <dl className="grid gap-1 text-[13px]">
            <div className="flex justify-between gap-4">
              <dt>Nettoerlöse aus Lieferungen und Leistungen</dt>
              <dd className="font-mono tabular-nums">{formatAmount(preview.netRevenue)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Finanzertrag</dt>
              <dd className="font-mono tabular-nums">{formatAmount(preview.financialIncome)}</dd>
            </div>
          </dl>

          <p className="text-[12px] text-text-secondary">
            Übersteigen die Nettoerlöse aus Lieferungen und Leistungen oder die Finanzerträge
            100’000 Franken nicht, darf nach OR Art. 958b Abs. 2 auf die zeitliche Abgrenzung
            verzichtet und stattdessen auf Ausgaben und Einnahmen abgestellt werden. Ob das für
            Ihr Unternehmen zutrifft, entscheiden Sie — die Buchhaltung schaltet dafür nichts um.
          </p>

          <CheckboxField
            label="Die zeitlichen Abgrenzungen sind geprüft (OR Art. 958b Abs. 1)."
            hint="Wird mit Ihrem Namen im Protokoll des Geschäftsjahres festgehalten."
            checked={accrualsConfirmed}
            onChange={(event) => onAccrualsChange(event.target.checked)}
          />

          {/* The reconciliation. Mandatory only where step 3a found a difference — then the
              close is refused without it — and shown as the voluntary note otherwise, so
              nobody is asked to confirm something the machine already checked. */}
          {reconciliationDiffers(preview) ? (
            <CheckboxField
              label="Ich habe die Differenz geprüft und schliesse das Jahr trotzdem ab."
              hint="Pflicht: Hauptbuch und Nebenbuch weichen voneinander ab. Die Bestätigung steht mit Ihrem Namen im Protokoll des Geschäftsjahres."
              checked={reconciliationConfirmed}
              onChange={(event) => onReconciliationChange(event.target.checked)}
            />
          ) : (
            <CheckboxField
              label="Debitoren und Kreditoren sind gegen die offenen Posten abgestimmt."
              hint="Freiwillig: die Abstimmung gegen die Nebenbücher stimmt bereits überein."
              checked={reconciliationConfirmed}
              onChange={(event) => onReconciliationChange(event.target.checked)}
            />
          )}
        </div>
      </Panel>
    </div>
  )
}

/**
 * Step 3: where the result goes, and what the run is about to write.
 *
 * <p><b>The account of the single year is not on offer.</b> Carrying onto it would leave it
 * holding the sum of every result ever booked — and assets would still equal liabilities, so no
 * control would catch it. The backend leaves it out of the options and refuses it if it is sent
 * anyway; the screen therefore never has to explain the trap.
 *
 * <p><b>A company is shown its account and asked nothing.</b> For `JURISTIC` the carry forward
 * runs onto 2970 «Gewinnvortrag oder Verlustvortrag» and the backend offers no options at all;
 * only a sole proprietorship and a partnership choose between capital and private, and that
 * choice is the house habit of their fiduciary rather than anything derivable from the chart.
 */
function CarryForwardStep({
  preview,
  chosen,
  onChosenChange,
}: {
  preview: ClosingPreview
  chosen: string
  onChosenChange: (accountNumber: string | null) => void
}) {
  const asks = asksCarryForward(preview)
  return (
    <div className="grid gap-4">
      <Panel
        title="Saldovortrag"
        description="Wohin das Jahresergebnis geht — beim Abschluss entschieden, nicht in den Einstellungen."
      >
        <div className="grid gap-4">
          {asks ? (
            <SelectField
              label="Vortragskonto"
              value={chosen}
              onChange={(event) =>
                onChosenChange(event.target.value === '' ? null : event.target.value)
              }
              className="w-[320px]"
              hint="Das Kapital- oder das Privatkonto. Ihr Treuhänder weiss, welches bei Ihnen üblich ist; die Antwort wird gemerkt und beim nächsten Abschluss nur noch angezeigt."
            >
              <option value="">— bitte wählen —</option>
              {preview.carryForwardOptions.map((option) => (
                <option key={option.accountNumber} value={option.accountNumber}>
                  {option.accountNumber} {option.accountName}
                </option>
              ))}
            </SelectField>
          ) : (
            <div className="grid gap-1">
              <p className="text-[12px] text-text-secondary">Vortragskonto</p>
              {/* «Keines» rather than a dash, and in prose rather than in figures: a year that
                  comes out at nil needs no carry forward account, and the backend leaves the
                  field empty for exactly that reason. A dash there let a dormant company read
                  «Vortragskonto —» and go looking for what it had forgotten to set. The dash
                  stays for the one case that is a gap — a blocking finding, which step 1
                  names. */}
              {carriesNoResult(preview) ? (
                <p className="text-[13px]">Keines — es ist nichts vorzutragen</p>
              ) : (
                <p className="font-mono text-[13px] tabular-nums">
                  {preview.carryForwardAccount ?? '—'}
                </p>
              )}
              <p className="text-[12px] text-text-secondary">{carryForwardHint(preview)}</p>
            </div>
          )}

          <p className="text-[13px]">{closingSummarySentence(preview, chosen)}</p>

          {/* Said before the click and not after it: the run files five papers as its
              thirteenth step and fails as a whole where one cannot be laid out (backend
              ADR-0125). A close that stops over a printing fault is inexplicable to somebody who
              was never told that printing is part of it. */}
          <p className="text-[13px]">{filedPapersSentence()}</p>

          {preview.replacesOpeningEntry && (
            <WarningNotice>
              Das Folgejahr trägt bereits eine Eröffnungsbuchung. Sie wird storniert und durch den
              Saldovortrag ersetzt — beides in einer Transaktion, das Jahr steht also nie ohne
              Eröffnung da.
            </WarningNotice>
          )}

          <p className="text-[12px] text-text-secondary">{appropriationSentence(preview)}</p>
        </div>
      </Panel>
    </div>
  )
}

// --- the closed year -------------------------------------------------------------------------

/**
 * What the close of one year did, and the way back out of it.
 *
 * <p><b>«Wieder öffnen» needs the right and the module.</b> The right decides who may, the switch
 * whether this tenant runs the bookkeeping at all — and the endpoint answers 409 rather than 403
 * to the second, so hiding the button on the switch keeps the two apart on screen as well.
 */
function ClosedYear({
  tenantId,
  year,
  years,
  mayClose,
  runsAccounting,
  onPickYear,
}: {
  tenantId: number
  year: FiscalYear
  /** Every fiscal year of the tenant: a later one that is not open blocks the reopening. */
  years: readonly FiscalYear[]
  mayClose: boolean
  runsAccounting: boolean
  /** Switches the picker, for the way to the later year that has to be opened first. */
  onPickYear: (fiscalYearId: number) => void
}) {
  const queryClient = useQueryClient()
  const [reopening, setReopening] = useState(false)
  // Which entries stand folded open, held here and not in the table: the set has to survive a
  // refetch, and a table that owned it would fold everything shut whenever an answer comes back.
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set())

  const summary = useQuery({
    queryKey: closingKey(tenantId, year.id),
    queryFn: () => fetchClosing(tenantId, year.id),
  })

  const reopen = useMutation({
    mutationFn: (reason: string) => reopenFiscalYear(tenantId, year.id, reason),
    onSuccess: () => {
      setReopening(false)
      void queryClient.invalidateQueries({ queryKey: fiscalYearsKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: closingKey(tenantId, year.id) })
      void queryClient.invalidateQueries({ queryKey: closingPreviewKey(tenantId, year.id) })
      // The reopening writes its reason into the trail; without this it would stay off screen
      // until somebody reloaded the page.
      void queryClient.invalidateQueries({ queryKey: yearLogKey(tenantId, year.id) })
    },
  })

  if (summary.error !== null && summary.error !== undefined) {
    return <ErrorNotice error={summary.error} />
  }
  if (summary.isPending) {
    return <LoadingBlock />
  }

  const data = summary.data
  const accrual = accrualLineOf(data.log)
  const standing = data.entries.filter((entry) => !entry.reversed)
  // Worked out before the dialog opens, out of the year list this screen already holds. The
  // backend refuses the same case; saying it after the reason was typed would be the one thing
  // the person could not have known beforehand.
  const inTheWay = blockingLaterYear(years, year)

  return (
    <div className="grid gap-4">
      <Panel
        title={`Geschäftsjahr ${year.label} ist abgeschlossen`}
        description={`Jahresergebnis ${formatAmount(data.result)}.`}
        action={
          mayClose && runsAccounting ? (
            <Button variant="secondary" onClick={() => setReopening(true)}>
              Wieder öffnen
            </Button>
          ) : undefined
        }
      >
        {accrual ? (
          <p className="text-[13px] text-text-secondary">
            {`${accrual.changedBy} hat am ${formatDateTime(accrual.changedAt)} bestätigt: `}
            {accrual.note}
          </p>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Zu diesem Abschluss steht keine Abgrenzungsbestätigung im Protokoll.
          </p>
        )}
        {!mayClose && <MissingRightHint right={ACCOUNTING_RIGHTS.close} name="Abschluss" />}
      </Panel>

      <Panel title="Buchungen des Abschlusses" padded={false}>
        <DataTable
          columns={ENTRY_COLUMNS}
          rows={data.entries}
          keyOf={(entry) => entry.entryId}
          // Folded open the entry shows its lines, read through the endpoint the journal uses.
          // «Welche Konten hat der Abschluss angefasst» is the question somebody has right here,
          // and answering it in the row saves leaving the screen for it.
          expandableRow={() => true}
          expanded={expanded}
          onExpandedChange={setExpanded}
          renderExpanded={(entry) => (
            <ClosingEntryLines tenantId={tenantId} entryId={entry.entryId} />
          )}
          empty={
            <EmptyState title="Keine Abschlussbuchungen">
              Dieses Jahr wurde ohne Buchung abgeschlossen — es war nichts zu schliessen.
            </EmptyState>
          }
        />
      </Panel>

      <FiledPapers tenantId={tenantId} year={year} />

      <ReopenDialog
        open={reopening}
        yearLabel={year.label}
        entries={standing}
        blockedBy={
          inTheWay === undefined
            ? undefined
            : { label: inTheWay.label, message: laterYearSentence(inTheWay, year) }
        }
        onOpenBlockedYear={
          inTheWay === undefined
            ? undefined
            : () => {
                setReopening(false)
                onPickYear(inTheWay.id)
              }
        }
        busy={reopen.isPending}
        error={reopen.error}
        onReopen={(reason) => reopen.mutate(reason)}
        onClose={() => setReopening(false)}
      />
    </div>
  )
}

/**
 * The papers the close filed, run by run, from `GET /report-archive?fiscalYearId=…`.
 *
 * <p><b>Every run of the year, each under its own number.</b> A year that was reopened and closed
 * again shows both sets of five, and that is the visible proof that a second close overwrites
 * nothing (backend ADR-0125, GeBüV Art. 3). A click fetches the bytes that were written at the
 * close — never a fresh render — and shows them the way every other PDF of this application is
 * shown. Papers filed by hand are not what a close did; they stand on the archive screen.
 *
 * <p>Read while the module is off, like the entries and the trail: a filed balance sheet is part
 * of the books and stays legible for ten years (OR Art. 958f).
 *
 * <p>One `opening` and one `openFailure`, the way the report toolbar and the stock list do it:
 * the clicked paper shows busy, the others wait, and a failure stands under the list rather than
 * replacing it.
 */
function FiledPapers({ tenantId, year }: { tenantId: number; year: FiscalYear }) {
  const archive = useQuery({
    queryKey: reportArchiveKey(tenantId, year.id),
    queryFn: () => fetchReportArchive(tenantId, year.id),
  })
  const [opening, setOpening] = useState<number | null>(null)
  const [openFailure, setOpenFailure] = useState<unknown>(null)

  const open = async (paper: ArchivedReport) => {
    setOpening(paper.id)
    setOpenFailure(null)
    try {
      showFile(await api.file(reportArchiveFileUrl(tenantId, paper.id)))
    } catch (failure) {
      setOpenFailure(failure)
    } finally {
      setOpening(null)
    }
  }

  const runs = closingRunsOf(archive.data ?? [])

  // Unpadded like the two table panels beside it: the loading block and the empty state bring
  // their own spacing, and only the list needs some.
  return (
    <Panel
      title="Papiere des Abschlusses"
      description="Fünf PDF je Durchgang, beim Abschluss abgelegt und seither unverändert."
      padded={false}
    >
      {archive.error !== null && archive.error !== undefined ? (
        <div className="p-5">
          <ErrorNotice error={archive.error} />
        </div>
      ) : archive.isPending ? (
        <LoadingBlock />
      ) : runs.length === 0 ? (
        <EmptyState title="Keine Papiere abgelegt">
          {`Beim Abschluss von ${year.label} wurden keine Papiere abgelegt. Sie lassen sich`}
          {' unter Buchhaltung → Archiv jederzeit von Hand ablegen — dann mit der Herkunft'}
          {' «von Hand», damit niemand sie für die Papiere des Abschlusstages hält.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 p-5">
          {runs.map((run) => (
            <section
              key={run.closingNumber}
              aria-label={`Abschluss Nr. ${run.closingNumber}`}
              className="grid gap-1.5"
            >
              <h3 className="text-[12px] font-medium text-text-secondary">
                Abschluss Nr. {run.closingNumber}
              </h3>
              <ul className="grid gap-1">
                {run.papers.map((paper) => (
                  <li
                    key={paper.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                  >
                    <Button
                      variant="ghost"
                      onClick={() => void open(paper)}
                      busy={opening === paper.id}
                      disabled={opening !== null && opening !== paper.id}
                    >
                      <FileText size={15} aria-hidden />
                      {REPORT_NAMES[paper.report]}
                    </Button>
                    <span className="text-[12px] text-text-secondary">
                      {`Stand ${formatDate(paper.asOfDate)} · ${formatByteCount(paper.byteCount)}`}
                      {` · abgelegt am ${formatDateTime(paper.createdAt)} von ${paper.createdBy}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {openFailure !== null && <ErrorNotice error={openFailure} />}

          <p className="text-[12px] text-text-secondary">
            Ein Klick öffnet das Papier so, wie es abgelegt wurde. Diese Papiere ändern sich nicht
            mehr; von Hand abgelegte stehen unter Buchhaltung → Archiv.
          </p>
        </div>
      )}
    </Panel>
  )
}

/**
 * The trail of one fiscal year, from `GET /fiscal-years/{id}/log`.
 *
 * <p><b>Shown for every year and not only for a closed one.</b> «Wer hat 2026 wann gesperrt, und
 * warum» is a question about an open year as much as about a closed one — the sketch of the issue
 * puts «Gesperrt» and «Angelegt» under the open year 2026 — and the answer is the same trail.
 *
 * <p>Read through the endpoint of its own rather than out of the closing summary. The summary
 * carries the trail too, but only where a close has something to summarise; a year that was
 * never closed would show an empty history, which is not what an empty history means.
 *
 * <p>Answers while the module is off, and that is the point: this is the place that says the
 * bookkeeping <b>was</b> switched off (GeBüV Art. 6 Abs. 1).
 */
function YearTrail({ tenantId, year }: { tenantId: number; year: FiscalYear }) {
  const log = useQuery({
    queryKey: yearLogKey(tenantId, year.id),
    queryFn: () => fetchYearLog(tenantId, year.id),
  })

  return (
    <Panel title="Protokoll" padded={false}>
      <DataTable
        columns={LOG_COLUMNS}
        rows={log.data ?? []}
        keyOf={(line) => `${line.changedAt}-${line.event}-${line.changedBy}`}
        loading={log.isPending}
        error={log.error}
        empty={<EmptyState title="Kein Protokoll">Zu diesem Jahr ist nichts vermerkt.</EmptyState>}
      />
    </Panel>
  )
}

/**
 * The lines of one closing entry, fetched when its row is folded open.
 *
 * <p>Fetched and not carried in the summary: three entries times a dozen lines would triple the
 * answer of a screen most visitors never fold open, and the endpoint for one entry exists anyway.
 */
function ClosingEntryLines({ tenantId, entryId }: { tenantId: number; entryId: number }) {
  const entry = useQuery({
    queryKey: entryKey(tenantId, entryId),
    queryFn: () => fetchEntry(tenantId, entryId),
  })

  if (entry.error !== null && entry.error !== undefined) {
    return <ErrorNotice error={entry.error} />
  }
  if (entry.isPending) {
    return <LoadingBlock />
  }
  return <EntryLinesView lines={entry.data.lines} currency={entry.data.currencyCode} />
}

/** The entries the run wrote — the journal number leads into the entry itself. */
const ENTRY_COLUMNS: Column<ClosingEntry>[] = [
  {
    key: 'entryNumber',
    header: 'Journalnummer',
    width: 'w-[150px]',
    render: (entry) => <span className="font-mono tabular-nums">{entry.entryNumber}</span>,
  },
  {
    key: 'bookingDate',
    header: 'Datum',
    width: 'w-[110px]',
    render: (entry) => formatDate(entry.bookingDate),
  },
  { key: 'description', header: 'Text', render: (entry) => entry.description },
  {
    key: 'documentReference',
    header: 'Beleg',
    width: 'w-[120px]',
    hideBelow: 'sm',
    render: (entry) => <span className="font-mono tabular-nums">{entry.documentReference}</span>,
  },
  {
    key: 'reversed',
    header: 'Zustand',
    width: 'w-[130px]',
    render: (entry) => (entry.reversed ? 'Storniert' : 'Steht'),
  },
]

/** The trail of the year, newest first as the endpoint sends it. */
const LOG_COLUMNS: Column<YearLogLine>[] = [
  {
    key: 'changedAt',
    header: 'Wann',
    width: 'w-[170px]',
    render: (line) => formatDateTime(line.changedAt),
  },
  { key: 'event', header: 'Was', width: 'w-[210px]', render: (line) => yearLogLabel(line) },
  { key: 'changedBy', header: 'Wer', width: 'w-[150px]', render: (line) => line.changedBy },
  { key: 'note', header: 'Grund', render: (line) => line.note ?? '' },
]

/**
 * Whether step 3a found a difference the person closing has to answer for.
 *
 * <p>The check is the one place that decides; the mask reads its finding rather than comparing
 * figures of its own, so the two cannot say different things.
 */
function reconciliationDiffers(preview: ClosingPreview): boolean {
  const check = preview.checks.find((candidate) => candidate.step === '3a')
  return check !== undefined && check.blocking && !check.passed
}
