import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { ErrorNotice, WarningNotice } from '../components/Notice'
import { Spinner } from '../components/Spinner'
import { api } from '../lib/api'
import { formatAmount, formatCount } from '../lib/format'
import type { OriginState } from '../lib/origin'
import { INVOICE_KIND, salesDocumentListKey } from '../lib/salesDocument'
import {
  billingRunActionText,
  billingRunPreviewUrl,
  billingRunResultText,
  billingRunUrl,
  invoicePathOf,
  timeBillingKey,
  worklistCustomerText,
  worklistKeyOf,
  worklistProjectText,
} from '../lib/timeBilling'
import { timeEntriesKey } from '../lib/timetracking'
import type {
  TimeBillingRunLeft,
  TimeBillingRunPreviewLine,
  TimeBillingRunRequest,
  TimeBillingRunResult,
  TimeWorklistLine,
} from '../lib/types'

/**
 * «Gewählte abrechnen»: the rows ticked in the worklist, billed in one run — a new invoice draft
 * for each, one transaction per row (backend ADR-0169).
 *
 * <p>First the preview, row by row, with the estimate the server works out and the entries it
 * would leave out; a row that cannot be billed says why and is skipped by the run. Then the three
 * lists of what happened: the drafts with a link, the rows skipped with the reason, and the rows
 * that failed — of which nothing is left. The screen adds nothing up.
 *
 * @param request the day and the rows, as the worklist ticked them
 * @param rows the rows of the worklist the run is about, for their names in the lists
 * @param origin where a draft opened from the result leads back to
 */
export function BillingRunDialog({
  tenantId,
  open,
  request,
  rows,
  origin,
  onClose,
}: {
  tenantId: number
  open: boolean
  request: TimeBillingRunRequest
  rows: readonly TimeWorklistLine[]
  origin: OriginState
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<TimeBillingRunResult | null>(null)

  const preview = useQuery({
    // Not under the key of the billing: the run refreshes that, and the preview of a run that
    // is done must not be asked for again.
    queryKey: ['time-billing-run-preview', tenantId, request],
    queryFn: () => api.post<TimeBillingRunPreviewLine[]>(billingRunPreviewUrl(tenantId), request),
    enabled: open && result === null,
  })

  const run = useMutation({
    mutationFn: () => api.post<TimeBillingRunResult>(billingRunUrl(tenantId), request),
    onSuccess: (done) => {
      setResult(done)
      void queryClient.invalidateQueries({ queryKey: timeBillingKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(INVOICE_KIND, tenantId) })
    },
  })

  const lines = preview.data ?? []
  const billable = lines.filter((line) => line.refusal == null).length
  const nameOf = (row: { partnerId: number; projectId?: number | null }) => {
    const found = rows.find((line) => worklistKeyOf(line) === worklistKeyOf(row))
    return found === undefined
      ? `Kunde ${row.partnerId}`
      : `${worklistCustomerText(found)} · ${worklistProjectText(found)}`
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={result === null ? 'Gewählte abrechnen' : 'Abgerechnet'}
      description={
        result === null
          ? 'Je Zeile ein neuer Rechnungsentwurf mit allen offenen verrechenbaren Einträgen bis zum Stichtag, nach Leistung gruppiert. Ausgestellt wird am Beleg.'
          : undefined
      }
      dirty={false}
      large
      onSubmit={result === null && billable > 0 && !run.isPending ? () => run.mutate() : undefined}
      footer={
        result === null ? (
          <>
            <DialogCancelButton />
            <Button
              onClick={() => run.mutate()}
              busy={run.isPending}
              disabled={billable === 0 || preview.isPending}
              shortcut
            >
              {billingRunActionText(lines)}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Schliessen</Button>
        )
      }
    >
      {result !== null ? (
        <RunResult result={result} nameOf={nameOf} origin={origin} />
      ) : preview.isPending ? (
        <p className="flex items-center gap-2 text-body text-text-secondary">
          <Spinner size={14} label="Vorschau wird berechnet" />
          Vorschau wird berechnet …
        </p>
      ) : preview.isError ? (
        <ErrorNotice error={preview.error} />
      ) : (
        <div className="grid gap-4">
          {run.error !== null && <ErrorNotice error={run.error} />}
          <PreviewTable lines={lines} nameOf={nameOf} />
        </div>
      )}
    </Dialog>
  )
}

/** The preview: per row the entries, the estimate and what is left out. */
function PreviewTable({
  lines,
  nameOf,
}: {
  lines: readonly TimeBillingRunPreviewLine[]
  nameOf: (row: TimeBillingRunPreviewLine) => string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="border-b border-line-subtle text-left">
            <th scope="col" className="text-overline py-2 pr-4 font-medium text-text-tertiary">
              Kunde und Projekt
            </th>
            <th scope="col" className="text-overline w-column-xs py-2 pr-4 text-right font-medium text-text-tertiary">
              Einträge
            </th>
            <th scope="col" className="text-overline w-column-md py-2 pr-4 text-right font-medium text-text-tertiary">
              Netto
            </th>
            <th scope="col" className="text-overline py-2 font-medium text-text-tertiary">
              Hinweis
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={worklistKeyOf(line)} className="border-b border-line-subtle last:border-b-0 align-top">
              <td className="py-2 pr-4">{nameOf(line)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {line.refusal == null ? formatCount(line.entries) : '–'}
              </td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums">
                {line.refusal == null ? `${formatAmount(line.totalNet)} ${line.currency ?? ''}` : '–'}
              </td>
              <td className="py-2 text-small text-text-secondary">
                {line.refusal != null ? (
                  <span className="text-danger">Wird übersprungen: {line.refusal}</span>
                ) : line.skipped.length > 0 ? (
                  <span title={line.skipped.map((entry) => entry.message).join('\n')}>
                    {line.skipped.length === 1
                      ? '1 Eintrag bleibt offen'
                      : `${line.skipped.length} Einträge bleiben offen`}
                    {': '}
                    {[...new Set(line.skipped.map((entry) => entry.message))].join(' ')}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What a run did: the sentence, then the three lists. */
function RunResult({
  result,
  nameOf,
  origin,
}: {
  result: TimeBillingRunResult
  nameOf: (row: { partnerId: number; projectId?: number | null }) => string
  origin: OriginState
}) {
  return (
    <div className="grid gap-4" aria-live="polite">
      <p className="flex items-center gap-2 text-body">
        <Check size={15} className="text-accent-text" aria-hidden />
        {billingRunResultText(result)}
      </p>

      <ResultSection title="Erstellt" count={result.created.length}>
        <ul className="grid gap-1 text-body">
          {result.created.map((created) => (
            <li key={created.documentId} className="flex flex-wrap items-baseline gap-x-2">
              <span>{nameOf(created)}</span>
              <span className="text-small text-text-tertiary">
                {created.entries === 1 ? '1 Eintrag' : `${created.entries} Einträge`} ·{' '}
                {created.lines === 1 ? '1 Position' : `${created.lines} Positionen`}
                {created.skipped > 0 && ` · ${created.skipped} offen geblieben`}
              </span>
              <span className="font-mono tabular-nums">
                {formatAmount(created.totalNet)} {created.currency}
              </span>
              <Link
                to={invoicePathOf(created.documentId)}
                state={origin}
                className="text-accent-text hover:underline"
              >
                Entwurf öffnen
              </Link>
            </li>
          ))}
        </ul>
      </ResultSection>

      <ResultSection title="Übersprungen" count={result.skipped.length}>
        <LeftList rows={result.skipped} nameOf={nameOf} />
      </ResultSection>

      <ResultSection title="Fehlgeschlagen" count={result.failed.length}>
        <WarningNotice>
          Von diesen Zeilen ist nichts geblieben: kein Entwurf, die Einträge sind offen. Später
          erneut abrechnen.
        </WarningNotice>
        <div className="mt-2">
          <LeftList rows={result.failed} nameOf={nameOf} />
        </div>
      </ResultSection>
    </div>
  )
}

function LeftList({
  rows,
  nameOf,
}: {
  rows: readonly TimeBillingRunLeft[]
  nameOf: (row: TimeBillingRunLeft) => string
}) {
  return (
    <ul className="grid gap-1 text-body">
      {rows.map((row) => (
        <li key={worklistKeyOf(row)}>
          {nameOf(row)}: <span className="text-text-secondary">{row.message}</span>
        </li>
      ))}
    </ul>
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
      <h3 className="text-heading font-semibold">
        {title} <span className="font-normal text-text-tertiary">({count})</span>
      </h3>
      {children}
    </section>
  )
}
