import type { ReactNode } from 'react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, ErrorNotice, WarningNotice } from '../components/Notice'
import { MarkdownLine } from '../components/MarkdownLine'
import { Panel } from '../components/Panel'
import { SegmentedControl } from '../components/SegmentedControl'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { formatDurationShort } from '../lib/duration'
import { isToldByFields } from '../lib/fieldErrors'
import { formatAmount, formatDate, formatPercent } from '../lib/format'
import {
  BILLING_GROUPINGS,
  BILLING_GROUPING_HINTS,
  SKIP_REASON_LABELS,
  billedMeanwhileIdsOf,
  billingQuantityText,
  candidateText,
  draftOptionLabel,
  entryText,
  incrementText,
  rateOriginText,
  serviceDatesText,
  totalLabel,
} from '../lib/timeBilling'
import type { TimesOf } from '../lib/timetracking'
import type { TimeBillingCandidate, TimeBillingLine, TimeBillingPreview } from '../lib/types'
import type { TimeBilling } from './useTimeBilling'

/** The fields of the mask the backend can name a message for (backend ADR-0132). */
const FIELDS = ['until', 'grouping', 'documentId', 'entryIds'] as const

/**
 * The body of «Zeiten abrechnen»: day, grouping and target above, the entries with their ticks,
 * the lines the preview would write, the skipped entries with their reason, and the total.
 *
 * <p>Every figure is the backend's answer to the question on screen. While the next answer is on
 * its way the last one stays, faded, so the ticks do not jump — and cannot be written
 * (frontend ADR-0085). The button that writes belongs to the page or the dialog around.
 *
 * @param billing the state of the mask, from {@link useTimeBilling}
 * @param of the project or the customer billed; a customer adds the column «Projekt»
 * @param framed true on a page, where each part is a panel; false in a dialog, which is a frame
 *   already
 * @param choosesTarget whether «Ziel» can be chosen; the dialog on a draft has its draft fixed
 */
export function TimeBillingForm({
  billing,
  of,
  framed,
  choosesTarget,
}: {
  billing: TimeBilling
  of: TimesOf
  framed: boolean
  choosesTarget: boolean
}) {
  const { form, preview, errors } = billing
  const data = preview.data
  const stale = preview.isPlaceholderData
  const billedMeanwhile = billedMeanwhileIdsOf(billing.bill.error)
  const billErrorShown =
    billing.bill.error !== null &&
    !(billedMeanwhile !== null && billedMeanwhile.length > 0) &&
    !isToldByFields(billing.bill.error, [...FIELDS])
  const previewErrorShown = preview.error !== null && !isToldByFields(preview.error, [...FIELDS])

  return (
    <div className="grid gap-4">
      <Block framed={framed} title="Auswahl">
        <div className="grid gap-4 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-start">
          <TextField
            label="Stichtag"
            type="date"
            value={form.until}
            onChange={(event) => billing.setUntil(event.target.value)}
            error={form.until === '' ? 'Einen Tag wählen.' : errors.until}
            tooltip="Abgerechnet wird offene verrechenbare Zeit bis und mit diesem Tag."
            className="sm:w-column-lg"
          />
          <div className="grid gap-1">
            <SegmentedControl
              label="Gruppierung"
              options={BILLING_GROUPINGS}
              value={form.grouping}
              onChange={billing.setGrouping}
            />
            <p className="text-small text-text-secondary">{BILLING_GROUPING_HINTS[form.grouping]}</p>
            {errors.grouping !== undefined && (
              <p role="alert" className="text-small text-danger">
                {errors.grouping}
              </p>
            )}
          </div>
          {choosesTarget && (
            <SelectField
              label="Ziel"
              value={form.documentId === null ? '' : String(form.documentId)}
              onChange={(event) =>
                billing.setDocumentId(event.target.value === '' ? null : Number(event.target.value))
              }
              error={errors.documentId}
              tooltip="Ein neuer Rechnungsentwurf oder einer, den der Kunde schon hat. Ausgestellt wird am Beleg."
            >
              <option value="">Neue Rechnung</option>
              {billing.drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draftOptionLabel(draft)}
                </option>
              ))}
              {form.documentId !== null &&
                !billing.drafts.some((draft) => draft.id === form.documentId) && (
                  <option value={form.documentId}>Entwurf {form.documentId}</option>
                )}
            </SelectField>
          )}
        </div>
        {!choosesTarget && errors.documentId !== undefined && (
          <p role="alert" className="mt-3 text-small text-danger">
            {errors.documentId}
          </p>
        )}
      </Block>

      {billing.conflict !== null && <WarningNotice>{billing.conflict}</WarningNotice>}
      {billErrorShown && <ErrorNotice error={billing.bill.error} />}
      {previewErrorShown && <ErrorNotice error={preview.error} />}
      {billing.draftsError !== null && <ErrorNotice error={billing.draftsError} />}

      <Block
        framed={framed}
        title="Einträge"
        description="Alle offenen verrechenbaren Zeiten bis zum gewählten Tag. Abgewählte bleiben offen."
        table
      >
        {errors.entryIds !== undefined && (
          <p role="alert" className="px-5 pt-4 text-small text-danger">
            {errors.entryIds}
          </p>
        )}
        <CandidateTable billing={billing} of={of} />
      </Block>

      {data !== undefined && (
        <div aria-busy={stale} className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <PreviewBlock preview={data} framed={framed} />
        </div>
      )}
    </div>
  )
}

/** The open entries with their ticks; a customer adds the project of each one. */
function CandidateTable({ billing, of }: { billing: TimeBilling; of: TimesOf }) {
  const { preview } = billing
  const columns: Column<TimeBillingCandidate>[] = [
    {
      key: 'date',
      header: 'Datum',
      width: 'w-column-sm',
      render: (candidate) => <span className="tabular-nums">{formatDate(candidate.workDate)}</span>,
    },
    {
      key: 'user',
      header: 'Person',
      render: (candidate) => candidate.userName ?? 'Benutzer nicht mehr vorhanden',
    },
    ...(of.kind === 'CUSTOMER'
      ? [
          {
            key: 'project',
            header: 'Projekt',
            hideBelow: 'sm',
            render: (candidate: TimeBillingCandidate) => (
              <span className={candidate.projectId == null ? 'text-text-tertiary' : ''}>
                {candidate.projectId == null ? 'ohne Projekt' : (candidate.projectNumber ?? '')}
              </span>
            ),
          } satisfies Column<TimeBillingCandidate>,
        ]
      : []),
    {
      key: 'service',
      header: 'Leistung',
      render: (candidate) => candidate.serviceName ?? 'Leistung nicht mehr vorhanden',
    },
    {
      key: 'duration',
      header: 'Dauer',
      align: 'right',
      width: 'w-column-md',
      render: (candidate) => <DurationCell candidate={candidate} />,
    },
    {
      key: 'description',
      header: 'Text',
      hideBelow: 'sm',
      render: (candidate) => (
        <MarkdownLine text={candidate.description} className="text-text-secondary" />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={preview.data?.candidates ?? []}
      keyOf={(candidate) => candidate.entryId}
      loading={preview.isPending && preview.fetchStatus !== 'idle'}
      selected={billing.selected}
      onSelectedChange={billing.tick}
      selectionLabel={(candidate) => `${candidateText(candidate)} abrechnen`}
      empty={
        // A refused preview says why above the list; here it only says there is no list.
        preview.error !== null ? (
          <EmptyState title="Keine Vorschau" description="Der Grund steht oben." />
        ) : (
          <EmptyState
            title="Nichts offen"
            description="Bis zu diesem Tag liegt keine offene verrechenbare Zeit. Ein späterer Stichtag zeigt vielleicht mehr."
          />
        )
      }
    />
  )
}

/** The minutes as measured, and where the increment rounds them up, what the invoice charges. */
function DurationCell({ candidate }: { candidate: TimeBillingCandidate }) {
  const rounded = candidate.billedMinutes !== candidate.durationMinutes
  return (
    <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
      <span>{formatDurationShort(candidate.durationMinutes)}</span>
      {rounded && (
        <span
          className="text-small text-text-tertiary"
          title="Nach Abrechnungstakt aufgerundet"
        >
          → {formatDurationShort(candidate.billedMinutes)}
        </span>
      )}
    </span>
  )
}

/** The lines the draft would get, the skipped entries and the total. */
function PreviewBlock({ preview, framed }: { preview: TimeBillingPreview; framed: boolean }) {
  return (
    <div className="grid gap-4">
      <Block framed={framed} title="Vorschau" description={incrementText(preview)} table>
        {preview.headerText != null && (
          <p className="px-5 pt-4 text-small text-text-secondary">
            <span className="text-text-tertiary">Kopftext der Rechnung:</span>{' '}
            <span className="text-text-primary">{preview.headerText}</span>
          </p>
        )}
        <LineTable preview={preview} />
        {preview.lines.length > 0 && <Totals preview={preview} />}
      </Block>

      {preview.skipped.length > 0 && (
        <Block
          framed={framed}
          title="Übersprungen"
          description="Diese gewählten Einträge kommen nicht auf die Rechnung und bleiben offen."
        >
          <ul className="grid gap-2 text-body" aria-label="Übersprungene Einträge">
            {preview.skipped.map((skipped) => (
              <li key={skipped.entryId} className="grid gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span>{entryText(skipped.entryId, preview.candidates)}</span>
                  <Badge tone="muted">{SKIP_REASON_LABELS[skipped.reason]}</Badge>
                </span>
                <span className="text-small text-text-secondary">{skipped.message}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  )
}

/** The lines as the invoice will carry them, each with the origin of its rate. */
function LineTable({ preview }: { preview: TimeBillingPreview }) {
  const columns: Column<TimeBillingLine>[] = [
    {
      key: 'service',
      header: 'Leistung',
      render: (line) => (
        <span className="grid gap-0.5">
          <span className="font-medium text-text-primary">{line.serviceName}</span>
          {line.subtitle != null && (
            <span className="text-small text-text-secondary">{line.subtitle}</span>
          )}
          {line.note != null && (
            <span className="whitespace-pre-line text-small text-text-tertiary">{line.note}</span>
          )}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Leistungsdatum',
      hideBelow: 'sm',
      render: (line) => <span className="tabular-nums">{serviceDatesText(line)}</span>,
    },
    {
      key: 'quantity',
      header: 'Menge',
      align: 'right',
      width: 'w-column-sm',
      render: (line) => billingQuantityText(line.quantity),
    },
    {
      key: 'rate',
      header: 'Satz',
      align: 'right',
      width: 'w-column-md',
      render: (line) => (
        <span className="grid justify-items-end gap-1">
          <span>{formatAmount(line.unitPrice)}</span>
          <Badge tone="neutral">{rateOriginText(line)}</Badge>
        </span>
      ),
    },
    // Only for a tenant registered for VAT: for the others the draft charges none, and a rate
    // beside the line would claim a tax that is not on the invoice.
    ...(preview.vatLiable
      ? [
          {
            key: 'vat',
            header: 'MWST',
            align: 'right',
            hideBelow: 'sm',
            width: 'w-column-xs',
            render: (line: TimeBillingLine) => (
              <span className="grid justify-items-end">
                <span>{formatPercent(line.vatRate)}</span>
                {line.priceIncludesVat && (
                  <span className="text-small text-text-tertiary">inkl.</span>
                )}
              </span>
            ),
          } satisfies Column<TimeBillingLine>,
        ]
      : []),
    {
      key: 'amount',
      header: `Betrag ${preview.currency}`,
      align: 'right',
      width: 'w-column-md',
      render: (line) => <span className="font-medium">{formatAmount(line.amount)}</span>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={preview.lines}
      keyOf={(line) => line.entryIds.join('-')}
      empty={
        <EmptyState
          title="Keine Position"
          description="Aus den gewählten Einträgen entsteht keine Position. Einträge wählen oder die übersprungenen ansehen."
        />
      }
    />
  )
}

/**
 * The total as the backend sends it. The sum of the lines appears beside it only where it
 * differs, which is where a rate includes VAT; without VAT liability both are the same. With a
 * draft as target both count only the lines this billing adds.
 */
function Totals({ preview }: { preview: TimeBillingPreview }) {
  return (
    <dl className="grid justify-end gap-1 border-t border-line px-5 py-3 text-body">
      {preview.totalAmount !== preview.totalNet && (
        <div className="flex items-baseline justify-end gap-6 text-text-secondary">
          <dt>Summe der Positionen</dt>
          <dd className="font-mono tabular-nums">
            {formatAmount(preview.totalAmount)} {preview.currency}
          </dd>
        </div>
      )}
      <div className="flex items-baseline justify-end gap-6">
        <dt className="font-medium">{totalLabel(preview.documentId, preview.vatLiable)}</dt>
        <dd className="font-mono font-semibold tabular-nums">
          {formatAmount(preview.totalNet)} {preview.currency}
        </dd>
      </div>
    </dl>
  )
}

/**
 * One part of the mask: a panel on a page, a titled section in a dialog.
 *
 * @param table true for a part holding a table, which brings its own spacing
 */
function Block({
  framed,
  title,
  description,
  table = false,
  children,
}: {
  framed: boolean
  title: string
  description?: string
  table?: boolean
  children: ReactNode
}) {
  if (framed) {
    return (
      <Panel title={title} description={description} padded={!table}>
        {children}
      </Panel>
    )
  }
  return (
    <section className="grid gap-2">
      <div>
        <h3 className="text-control font-semibold">{title}</h3>
        {description !== undefined && (
          <p className="text-small text-text-secondary">{description}</p>
        )}
      </div>
      <div
        className={
          table ? 'overflow-hidden rounded-[var(--radius-md)] border border-line-subtle' : ''
        }
      >
        {children}
      </div>
    </section>
  )
}
