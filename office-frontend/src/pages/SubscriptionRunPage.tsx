import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, ErrorNotice, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { CONTRACT_PATH } from '../lib/contract'
import { formatAmount, formatDate, formatPercent, formatQuantity } from '../lib/format'
import { originState } from '../lib/origin'
import { salesDocumentFor, salesDocumentListKey } from '../lib/salesDocument'
import {
  BILLED_CHANGE_NOTE_MAX_LENGTH,
  BILLED_CHANGE_REASON_LABELS,
  SKIP_REASON_LABELS,
  SUBSCRIPTION_MODULE,
  SUBSCRIPTION_PATH,
  SUBSCRIPTION_RIGHTS,
  acknowledgeBilledChangeNotice,
  billedChangeNoticeCountKey,
  billedChangeNoticeText,
  billedChangeNoticesKey,
  currentMonth,
  draftCountText,
  draftLineCount,
  fetchMissingRunMonths,
  fetchOpenBilledChangeNotices,
  fetchSubscriptionPreview,
  isCompleteMonth,
  isSplitLine,
  missingRunText,
  monthLabel,
  runResultText,
  runSubscription,
  subscriptionMissingMonthsKey,
  subscriptionPreviewKey,
  totalsText,
} from '../lib/subscription'
import type {
  SubscriptionAcknowledgementReason,
  SubscriptionBilledChangeNotice,
  SubscriptionContractPlan,
  SubscriptionNotice,
  SubscriptionPlannedPart,
  SubscriptionRunResult,
  SubscriptionSkippedPeriod,
} from '../lib/types'

const ORIGIN = originState(SUBSCRIPTION_PATH, 'Abo-Lauf')

/**
 * The subscription run: one billing month, a preview, and drafts on request.
 *
 * <p>Two steps, and the second is not the first repeated: the preview shows what is due, the
 * run asks the server again and writes one invoice draft per contract. Nothing is issued —
 * that stays an act on the invoice (backend ADR-0136, ADR-0147, frontend ADR-0075).
 *
 * <p><b>Due is every period that starts in the month.</b> A month that was never run stays
 * visible by choosing it; a period billed already shows up as skipped, with its draft.
 */
export function SubscriptionRunPage() {
  return (
    <RequireTenant permission={SUBSCRIPTION_RIGHTS.read} module={SUBSCRIPTION_MODULE}>
      {(tenantId) => <SubscriptionRun tenantId={tenantId} />}
    </RequireTenant>
  )
}

function SubscriptionRun({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayRun = can(SUBSCRIPTION_RIGHTS.run)
  const invoiceKind = salesDocumentFor('INVOICE')
  const [month, setMonth] = useState(() => currentMonth())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<SubscriptionRunResult | null>(null)
  const [expanded, setExpanded] = useState<Set<string | number>>(() => new Set())
  const complete = isCompleteMonth(month)

  const preview = useQuery({
    queryKey: [...subscriptionPreviewKey(tenantId), month],
    queryFn: () => fetchSubscriptionPreview(tenantId, month),
    enabled: complete,
    placeholderData: keepPreviousData,
  })

  const missing = useQuery({
    queryKey: subscriptionMissingMonthsKey(tenantId),
    queryFn: () => fetchMissingRunMonths(tenantId),
  })
  const missingMonths = missing.data?.months ?? []

  // Open notices stay here through every later run, until somebody acknowledges them (ADR-0154).
  const openNotices = useQuery({
    queryKey: billedChangeNoticesKey(tenantId),
    queryFn: () => fetchOpenBilledChangeNotices(tenantId),
    retry: false,
  })
  const openList = openNotices.data ?? []
  const [acknowledging, setAcknowledging] = useState<SubscriptionBilledChangeNotice | null>(null)
  const [reason, setReason] = useState<SubscriptionAcknowledgementReason>('CORRECTION_ISSUED')
  const [note, setNote] = useState('')
  const [triedToSave, setTriedToSave] = useState(false)
  const noteText = note.trim()
  const noteMissing = reason === 'OTHER' && noteText === ''

  const acknowledge = useMutation({
    mutationFn: (notice: SubscriptionBilledChangeNotice) =>
      acknowledgeBilledChangeNotice(tenantId, notice.id, {
        reason,
        note: noteText === '' ? undefined : noteText,
      }),
    onSuccess: () => {
      setAcknowledging(null)
      void queryClient.invalidateQueries({ queryKey: billedChangeNoticesKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: billedChangeNoticeCountKey(tenantId) })
    },
  })

  const openAcknowledge = (notice: SubscriptionBilledChangeNotice) => {
    acknowledge.reset()
    setReason('CORRECTION_ISSUED')
    setNote('')
    setTriedToSave(false)
    setAcknowledging(notice)
  }

  const confirmAcknowledge = () => {
    setTriedToSave(true)
    if (acknowledging === null || noteMissing) return
    acknowledge.mutate(acknowledging)
  }

  const run = useMutation({
    mutationFn: () => runSubscription(tenantId, month),
    onSuccess: (answer) => {
      setResult(answer)
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: subscriptionPreviewKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: subscriptionMissingMonthsKey(tenantId) })
      if (invoiceKind) {
        void queryClient.invalidateQueries({
          queryKey: salesDocumentListKey(invoiceKind, tenantId),
        })
      }
    },
  })

  const plans = preview.data?.contracts ?? []
  const billed = plans.filter((plan) => plan.lines.length > 0)
  const skipped = plans.flatMap((plan) => plan.skipped)
  const notices = plans.flatMap((plan) =>
    plan.notices.map((message) => ({
      contractId: plan.contractId,
      contractNumber: plan.contractNumber,
      message,
    })),
  )
  const invoiceCount = preview.data?.invoiceCount ?? 0
  const vatLiable = preview.data?.vatLiable ?? false
  // While another month loads, the figures of the last one would stand under the new title.
  const figuresShown = complete && preview.data !== undefined && !preview.isPlaceholderData
  const draftPath = (documentId: number) =>
    invoiceKind ? `${invoiceKind.path}/${documentId}` : undefined

  const changeMonth = (next: string) => {
    setMonth(next)
    setResult(null)
    setExpanded(new Set())
  }

  const columns: Column<SubscriptionContractPlan>[] = [
    {
      key: 'contract',
      header: 'Vertrag',
      render: (plan) => (
        <span className="grid">
          <ContractLink contractId={plan.contractId}>{plan.contractNumber}</ContractLink>
          <span className="text-small text-text-tertiary">{plan.title}</span>
        </span>
      ),
    },
    { key: 'customer', header: 'Kunde', render: (plan) => plan.customerName },
    {
      key: 'version',
      header: 'Version',
      hideBelow: 'sm',
      render: (plan) => (
        <span className="tabular-nums text-text-secondary">
          {plan.versionNo != null ? `V${plan.versionNo}` : '–'}
        </span>
      ),
    },
    {
      key: 'lines',
      header: 'Positionen',
      align: 'right',
      hideBelow: 'sm',
      render: (plan) => <span className="tabular-nums">{draftLineCount(plan)}</span>,
    },
    {
      key: 'total',
      header: 'Betrag',
      align: 'right',
      render: (plan) => (
        <span className="font-medium tabular-nums">
          {formatAmount(plan.total)} {plan.currency ?? ''}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Abo-Lauf"
        subtitle="Rechnungsentwürfe aus den Verträgen, deren Periode im gewählten Monat beginnt. Je Vertrag ein Entwurf, nichts wird finalisiert."
      >
        {mayRun && (
          <Button
            onClick={() => {
              run.reset()
              setConfirming(true)
            }}
            disabled={!complete || invoiceCount === 0 || preview.isFetching}
          >
            Abo-Lauf starten
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {/* While the dialog is open, it shows the error itself. */}
        {run.error !== null && !confirming && <ErrorNotice error={run.error} />}

        {result !== null && (
          <RunResult result={result} draftPath={draftPath} />
        )}

        {missingMonths.length > 0 && (
          <WarningNotice>
            <ul className="grid gap-2">
              {missingMonths.map((missingMonth) => (
                <li key={missingMonth} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span>{missingRunText(missingMonth)}</span>
                  <Button
                    variant="secondary"
                    onClick={() => changeMonth(missingMonth)}
                    disabled={month === missingMonth}
                  >
                    Zu {monthLabel(missingMonth)}
                  </Button>
                </li>
              ))}
            </ul>
          </WarningNotice>
        )}

        <Panel
          title="Abrechnungsmonat"
          description="Fällig ist jede Periode, die in diesem Monat beginnt. Perioden zählen ab Vertragsbeginn."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              label="Monat"
              type="month"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              error={complete ? undefined : 'Einen Monat wählen.'}
              tooltip="Ein Monat, der nie gelaufen ist, bleibt sichtbar, indem man ihn wählt. Was schon verrechnet ist, erscheint als übersprungen."
            />
          </div>
        </Panel>

        <Panel padded={false} title={`Vorschau ${monthLabel(month)}`}>
          {figuresShown && preview.data !== undefined && (
            <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 pb-4 pt-4">
              <Figure label="Rechnungsentwürfe" value={String(preview.data.invoiceCount)} />
              <Figure label="Positionen" value={String(preview.data.lineCount)} />
              <Figure label="Übersprungen" value={String(preview.data.skippedCount)} />
              <Figure label="Summe wie vereinbart" value={totalsText(preview.data.totals)} />
            </div>
          )}
          <DataTable
            columns={columns}
            rows={billed}
            keyOf={(plan) => plan.contractId}
            loading={preview.isPending && complete}
            error={preview.error}
            empty={
              <EmptyState
                title="Nichts fällig"
                description="In diesem Monat beginnt keine Periode eines laufenden Vertrags, oder alles ist schon verrechnet."
              />
            }
            expanded={expanded}
            onExpandedChange={setExpanded}
            renderExpanded={(plan) => <PlannedLines plan={plan} vatLiable={vatLiable} />}
          />
        </Panel>

        {skipped.length > 0 && (
          <Panel
            title="Übersprungen"
            description="Diese Perioden verrechnet der Lauf nicht. Der Grund sagt, was zu tun ist."
          >
            <SkippedList entries={skipped} draftPath={draftPath} />
          </Panel>
        )}

        {notices.length > 0 && (
          <Panel title="Hinweise" description="Sie halten nichts auf, wollen aber gelesen sein.">
            <NoticeList entries={notices} />
          </Panel>
        )}

        {openList.length > 0 && (
          <Panel
            title="Offene Hinweise zu verrechneten Perioden"
            description="Eine Vertragsänderung greift in eine Periode, die schon verrechnet ist. Der Hinweis bleibt auch über spätere Läufe, bis er quittiert ist."
          >
            <ul className="grid gap-3">
              {openList.map((notice) => (
                <li
                  key={notice.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                >
                  <span className="text-body">
                    <ContractLink contractId={notice.contractId}>{notice.contractNumber}</ContractLink>
                    {': '}
                    {billedChangeNoticeText(notice)}
                  </span>
                  {mayRun && (
                    <Button variant="secondary" onClick={() => openAcknowledge(notice)}>
                      Quittieren
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {!mayRun && (
          <p className="text-body text-text-secondary">
            Zum Starten des Abo-Laufs fehlt das Recht «Abo-Lauf ausführen».
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Abo-Lauf starten"
        confirmLabel="Entwürfe erstellen"
        onConfirm={() => run.mutate()}
        onCancel={() => setConfirming(false)}
        busy={run.isPending}
        error={run.error}
      >
        <p>
          <strong className="text-text-primary">{draftCountText(invoiceCount)}</strong> für{' '}
          {monthLabel(month)}, zusammen {totalsText(preview.data?.totals ?? [])} wie vereinbart.
        </p>
        <p className="mt-2 text-small text-text-tertiary">
          Der Lauf rechnet beim Start neu. Eine Periode, die inzwischen verrechnet ist, wird
          übersprungen. Die Entwürfe werden nicht finalisiert.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={acknowledging !== null}
        title="Hinweis quittieren"
        confirmLabel="Quittieren"
        onConfirm={confirmAcknowledge}
        onCancel={() => {
          acknowledge.reset()
          setAcknowledging(null)
        }}
        busy={acknowledge.isPending}
        error={acknowledge.error}
      >
        {acknowledging !== null && (
          <p>
            {acknowledging.contractNumber}: {billedChangeNoticeText(acknowledging)}
          </p>
        )}
        <div className="mt-4 grid gap-4">
          <SelectField
            label="Begründung"
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as SubscriptionAcknowledgementReason)
            }
          >
            {(Object.keys(BILLED_CHANGE_REASON_LABELS) as SubscriptionAcknowledgementReason[]).map(
              (code) => (
                <option key={code} value={code}>
                  {BILLED_CHANGE_REASON_LABELS[code]}
                </option>
              ),
            )}
          </SelectField>
          <TextAreaField
            label="Bemerkung"
            rows={2}
            maxLength={BILLED_CHANGE_NOTE_MAX_LENGTH}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            hint={`Optional, höchstens ${BILLED_CHANGE_NOTE_MAX_LENGTH} Zeichen. Bei «Anderes» Pflicht.`}
            error={triedToSave && noteMissing ? 'Bitte sagen, was entschieden wurde.' : undefined}
          />
        </div>
      </ConfirmDialog>
    </>
  )
}

/**
 * The lines one draft would carry, under its contract row, and the text it names the contract
 * with. «inkl.» or «zzgl. MWST» and the rate only for a tenant registered for VAT; for the others
 * a price is just a price.
 *
 * <p>A period the rate changes in is one position and several lines of the draft: the position as
 * agreed, and below it one line per rate with its days and its share (backend ADR-0150).
 */
function PlannedLines({
  plan,
  vatLiable,
}: {
  plan: SubscriptionContractPlan
  vatLiable: boolean
}) {
  return (
    <div className="grid gap-2 py-1 text-small text-text-secondary">
      {plan.invoiceText != null && (
        <p>
          <span className="text-text-tertiary">Kopftext der Rechnung:</span>{' '}
          <span className="text-text-primary">{plan.invoiceText}</span>
        </p>
      )}
      <ul className="grid gap-1">
        {plan.lines.map((line) => {
          const split = isSplitLine(line)
          const rate = line.parts[0]?.vatRate
          return (
            <li key={`${line.positionKey}-${line.periodStart}`} className="grid gap-1">
              <span className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium text-text-primary">{line.title}</span>
                <span className="tabular-nums">
                  {formatDate(line.periodStart)} – {formatDate(line.periodEnd)}
                </span>
                <span className="tabular-nums">
                  {formatQuantity(line.quantity)} × {formatAmount(line.unitPrice)}
                </span>
                {vatLiable && <span>{line.priceIncludesVat ? 'inkl. MWST' : 'zzgl. MWST'}</span>}
                {vatLiable && !split && rate != null && (
                  <span className="tabular-nums">{formatPercent(rate)}</span>
                )}
                {split && <Badge tone="muted">Geteilt nach Satz</Badge>}
                <span className="ml-auto tabular-nums">{formatAmount(line.amount)}</span>
              </span>
              {split && <PlannedParts parts={line.parts} vatLiable={vatLiable} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The lines of a split period: days, rate and share, as the draft will carry them. */
function PlannedParts({
  parts,
  vatLiable,
}: {
  parts: SubscriptionPlannedPart[]
  vatLiable: boolean
}) {
  return (
    <ul className="grid gap-0.5 border-l border-line-subtle pl-3" aria-label="Teilzeiträume">
      {parts.map((part) => (
        <li key={part.periodStart} className="flex flex-wrap gap-x-3">
          <span className="tabular-nums">
            {formatDate(part.periodStart)} – {formatDate(part.periodEnd)}
          </span>
          <span className="tabular-nums">{part.days === 1 ? '1 Tag' : `${part.days} Tage`}</span>
          {vatLiable && part.vatRate != null && (
            <span className="tabular-nums">{formatPercent(part.vatRate)}</span>
          )}
          <span className="ml-auto tabular-nums">{formatAmount(part.amount)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The periods left unbilled, each with its reason and, where there is one, its draft. */
function SkippedList({
  entries,
  draftPath,
}: {
  entries: SubscriptionSkippedPeriod[]
  draftPath: (documentId: number) => string | undefined
}) {
  return (
    <ul className="grid gap-2 text-body">
      {entries.map((entry) => {
        const path = entry.documentId != null ? draftPath(entry.documentId) : undefined
        return (
          <li
            key={`${entry.contractId}-${entry.positionKey}-${entry.periodStart}`}
            className="grid gap-0.5"
          >
            <span className="flex flex-wrap items-center gap-x-2">
              <ContractLink contractId={entry.contractId}>{entry.contractNumber}</ContractLink>
              <span>{entry.title}</span>
              <span className="tabular-nums text-text-tertiary">
                {formatDate(entry.periodStart)} – {formatDate(entry.periodEnd)}
              </span>
              <Badge tone="muted">{SKIP_REASON_LABELS[entry.reason]}</Badge>
            </span>
            <span className="text-small text-text-secondary">
              {entry.message}
              {path !== undefined && (
                <>
                  {' '}
                  <Link to={path} state={ORIGIN} className="text-accent-text hover:underline">
                    Beleg öffnen
                  </Link>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function NoticeList({ entries }: { entries: SubscriptionNotice[] }) {
  return (
    <ul className="grid gap-2 text-body">
      {entries.map((entry, index) => (
        <li key={`${entry.contractId}-${index}`}>
          <ContractLink contractId={entry.contractId}>{entry.contractNumber}</ContractLink>{' '}
          <span className="text-text-secondary">{entry.message}</span>
        </li>
      ))}
    </ul>
  )
}

/** What a run did: three lists, then the notices. */
function RunResult({
  result,
  draftPath,
}: {
  result: SubscriptionRunResult
  draftPath: (documentId: number) => string | undefined
}) {
  return (
    <Panel title={`Ergebnis ${monthLabel(result.month)}`}>
      <div className="grid gap-4" aria-live="polite">
        <p className="flex items-center gap-2 text-body">
          <Check size={15} className="text-accent-text" aria-hidden />
          {runResultText(result)}
        </p>

        <ResultSection title="Erstellt" count={result.created.length}>
          <ul className="grid gap-1 text-body">
            {result.created.map((entry) => {
              const path = draftPath(entry.documentId)
              return (
                <li key={entry.documentId} className="flex flex-wrap items-baseline gap-x-2">
                  <ContractLink contractId={entry.contractId}>{entry.contractNumber}</ContractLink>
                  <span>{entry.customerName}</span>
                  <span className="text-small text-text-tertiary">
                    V{entry.versionNo} · {entry.lineCount}{' '}
                    {entry.lineCount === 1 ? 'Position' : 'Positionen'}
                  </span>
                  <span className="tabular-nums">
                    {formatAmount(entry.totalGross)} {entry.currency}
                  </span>
                  {path !== undefined && (
                    <Link to={path} state={ORIGIN} className="text-accent-text hover:underline">
                      Entwurf öffnen
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </ResultSection>

        <ResultSection title="Übersprungen" count={result.skipped.length}>
          <SkippedList entries={result.skipped} draftPath={draftPath} />
        </ResultSection>

        <ResultSection title="Fehlgeschlagen" count={result.failed.length}>
          <WarningNotice>
            Von diesen Verträgen ist nichts geblieben: kein Entwurf und keine verrechnete
            Periode. Nach der Korrektur den Lauf für denselben Monat erneut starten.
          </WarningNotice>
          <ul className="mt-2 grid gap-1 text-body">
            {result.failed.map((entry) => (
              <li key={entry.contractId}>
                <ContractLink contractId={entry.contractId}>{entry.contractNumber}</ContractLink>{' '}
                {entry.customerName}:{' '}
                <span className="text-text-secondary">{entry.message}</span>
              </li>
            ))}
          </ul>
        </ResultSection>

        <ResultSection title="Hinweise" count={result.notices.length}>
          <NoticeList entries={result.notices} />
        </ResultSection>
      </div>
    </Panel>
  )
}

/** One of the lists of the result; an empty list shows nothing at all. */
function ResultSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="grid gap-2">
      <h3 className="text-control font-semibold">
        {title} <span className="text-text-tertiary tabular-nums">{count}</span>
      </h3>
      {children}
    </section>
  )
}

function ContractLink({ contractId, children }: { contractId: number; children: ReactNode }) {
  return (
    <Link
      to={`${CONTRACT_PATH}/${contractId}`}
      state={ORIGIN}
      className="font-mono text-small text-text-secondary hover:text-accent-text"
    >
      {children}
    </Link>
  )
}

/** One figure of the preview head. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-small text-text-tertiary">{label}</p>
      <p className="text-body tabular-nums">{value}</p>
    </div>
  )
}
