import { useQuery } from '@tanstack/react-query'
import { Hourglass } from 'lucide-react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { LinkButton } from '../components/LinkButton'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RequireTenant } from '../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  CHART_OF_ACCOUNTS_PATH,
  fetchTaxCodes,
  taxCodesKey,
} from '../lib/accounting'
import { formatCount, formatDate, formatPercent, toIsoDate } from '../lib/format'
import type { TaxCode, TaxCodeEmptyReason } from '../lib/types'

/** What stands where a rate or an account is not applicable. */
const NOT_APPLICABLE = '—'

/**
 * The tax codes of one tenant: with which code the posting works out the value added tax, on
 * which account it lands, and under which digit of the VAT return it is declared.
 *
 * <p><b>A reading screen and nothing else.</b> The codes come into being with the chart of
 * accounts and are maintained by nobody here; a button that promised otherwise would promise a
 * screen that does not exist yet (backend ADR-0118).
 *
 * <p>Where the list is empty it says <b>why</b>, in one of four sentences. The reason comes
 * from the backend and is never worked out here: the VAT position of a tenant is read with
 * `TENANT_READ`, which a bookkeeper does not have to hold.
 */
export function TaxCodePage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <TaxCodes tenantId={tenantId} />}
    </RequireTenant>
  )
}

function TaxCodes({ tenantId }: { tenantId: number }) {
  const catalogue = useQuery({
    queryKey: taxCodesKey(tenantId),
    queryFn: () => fetchTaxCodes(tenantId),
  })
  const codes = catalogue.data?.codes ?? []
  // Worked out once per paint rather than once per row: a list that changed its mind about
  // "today" halfway down would mark two codes of the same period differently.
  const today = toIsoDate()

  const columns: Column<TaxCode>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[120px]',
      render: (taxCode) => (
        <span className="font-mono text-[12px] text-text-tertiary">{taxCode.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (taxCode) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{taxCode.name}</span>
          {/* An expired code stays in the list: an invoice from 2023 written off in 2026 is
              corrected at 7.7 %, and a code the list hides looks like a fault the moment it
              turns up on an entry line. */}
          {isExpired(taxCode, today) && (
            <span title={`gültig bis ${formatDate(taxCode.validTo)}`}>
              <Badge tone="muted">
                <Hourglass size={11} aria-hidden />
                Abgelaufen
              </Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Satz',
      align: 'right',
      width: 'w-[90px]',
      render: (taxCode) => <span className="font-mono text-[12px]">{rateOf(taxCode)}</span>,
    },
    {
      key: 'account',
      header: 'Konto',
      width: 'w-[240px]',
      hideBelow: 'sm',
      render: (taxCode) =>
        taxCode.taxAccountNumber ? (
          <span className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-mono text-[12px] text-text-tertiary">
              {taxCode.taxAccountNumber}
            </span>
            <span className="text-text-secondary">{taxCode.taxAccountName}</span>
          </span>
        ) : (
          <span className="text-text-tertiary">{NOT_APPLICABLE}</span>
        ),
    },
    {
      key: 'validFrom',
      header: 'Gültig ab',
      width: 'w-[120px]',
      render: (taxCode) => (
        <span className="font-mono text-[12px] text-text-secondary">
          {formatDate(taxCode.validFrom)}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Steuercodes"
        subtitle={
          codes.length === 0
            ? 'Womit die Buchung die Mehrwertsteuer rechnet.'
            : `${formatCount(codes.length)} Steuercodes`
        }
      />

      <div className="px-8 pb-12">
        <Panel padded={false}>
          {codes.length > 0 && (
            <p className="border-b border-line-subtle px-5 py-4 text-[13px] text-text-secondary">
              Mit diesen Codes rechnet die Buchung die Mehrwertsteuer. Sie entstehen mit dem
              Kontenplan und werden hier nicht bearbeitet.
            </p>
          )}
          <DataTable
            columns={columns}
            rows={codes}
            keyOf={(taxCode) => taxCode.id}
            loading={catalogue.isPending}
            error={catalogue.error}
            empty={<NoTaxCodes reason={catalogue.data?.emptyReason} />}
          />
        </Panel>
      </div>
    </>
  )
}

/**
 * Whether a code may no longer be booked on.
 *
 * <p>Compares the two ISO days as text on purpose: `validTo` is a whole day without a time
 * zone, and letting the browser attach one moves the boundary west of Greenwich.
 *
 * @param taxCode the code
 * @param today the current day as `yyyy-MM-dd`
 * @returns true where the last valid day lies before today
 */
function isExpired(taxCode: TaxCode, today: string): boolean {
  const validTo = taxCode.validTo
  return typeof validTo === 'string' && validTo < today
}

/**
 * What stands in the rate column.
 *
 * <p>A rate of zero shows «—» and never «0 %». Nothing to tax and a rate of nothing are two
 * statements, and on the fallback code «—» additionally means «the rate comes from the entry
 * line» (backend ADR-0118).
 */
function rateOf(taxCode: TaxCode): string {
  return taxCode.rate === 0 ? NOT_APPLICABLE : formatPercent(taxCode.rate)
}

/**
 * The four named empty states, one sentence each saying <b>why</b>.
 *
 * <p>Never an empty table: a bookkeeper who finds no tax code has to learn from the screen
 * whether something is missing or whether nothing is owed.
 */
const EMPTY_STATES: Record<TaxCodeEmptyReason, { title: string; description: string }> = {
  NOT_VAT_LIABLE: {
    title: 'Nicht mehrwertsteuerpflichtig',
    description:
      'Dieser Mandant ist nicht mehrwertsteuerpflichtig. Es werden keine Steuercodes geführt; '
      + 'in der Buchung erscheint keine Steuerspalte.',
  },
  SALDO: {
    title: 'Saldosteuersatz wird nicht unterstützt',
    description:
      'Dieser Mandant rechnet nach der Saldosteuersatzmethode (MWSTG Art. 37). Diese Methode '
      + 'wird nicht unterstützt: sie rechnet auf dem Bruttoumsatz inklusive Steuer, kennt keinen '
      + 'Vorsteuerteil und bucht auf ein eigenes Konto. Es werden deshalb keine Steuercodes '
      + 'angelegt.',
  },
  NO_CHART: {
    title: 'Noch kein Kontenplan',
    description: 'Es gibt noch keinen Kontenplan. Die Steuercodes entstehen zusammen mit ihm.',
  },
  NOT_COPIED: {
    title: 'Keine Steuercodes',
    description:
      'Dieser Kontenplan ist ohne Vorlage entstanden, deshalb gibt es keine Steuercodes. Sie '
      + 'werden mit der Buchhaltung der nächsten Stufe pflegbar.',
  },
}

/**
 * The empty list with its reason.
 *
 * <p>The reason is the answer of the backend and is shown as it comes. Without one — an answer
 * this endpoint does not give — the screen stays honest and says that it does not know rather
 * than guessing one of the four.
 */
function NoTaxCodes({ reason }: { reason?: TaxCodeEmptyReason | null }) {
  const state = reason ? EMPTY_STATES[reason] : undefined

  return (
    <EmptyState
      title={state?.title ?? 'Keine Steuercodes'}
      description={state?.description ?? 'Für diesen Mandanten sind keine Steuercodes hinterlegt.'}
    >
      {/* The only way out of an empty state that has one: the codes are copied along with the
          chart, so the chart is where this ends. */}
      {reason === 'NO_CHART' && <LinkButton to={CHART_OF_ACCOUNTS_PATH}>Zum Kontenplan</LinkButton>}
    </EmptyState>
  )
}
