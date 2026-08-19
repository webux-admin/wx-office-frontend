import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDate, formatPercent, toIsoDate } from '../lib/format'
import type { Tenant, VatRates } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'

/**
 * The VAT rates a document line is charged with, and the settings of this tenant behind them.
 *
 * <p>The screen shows and explains, it does not offer to change anything: the percentages are
 * federal, are delivered with the application and carry no tenant, so the backend serves them
 * read-only and there is nothing here to save. What a tenant does decide — whether it is
 * liable at all and by which method it accounts — belongs to the tenant mask and is only
 * repeated here, next to the rates it applies to.
 */
export function VatPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <Vat tenantId={tenantId} />}
    </RequireTenant>
  )
}

/**
 * Why an empty answer points at the delivered data: the rates belong to no tenant, so a
 * missing one cannot be a setting somebody here forgot to make.
 */
const NO_RATES =
  'Zu diesem Leistungsdatum liefert die Anwendung keinen Satz. Das deutet auf eine Lücke in ' +
  'den mitgelieferten Daten hin, nicht auf eine fehlende Einstellung dieses Mandanten.'

/** One rate as the table lists it: the category code and its percentage on the chosen day. */
type RateRow = { code: string; rate: number | undefined }

function Vat({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const categoryLabel = useCatalogueLabel(tenantId, 'vat-category')
  const [dateOfSupply, setDateOfSupply] = useState(toIsoDate())

  // An emptied field leaves the parameter out rather than sending an empty one: without it the
  // backend answers for today, which is what an empty field means here.
  const rates = useQuery({
    queryKey: ['vat-rates', tenantId, dateOfSupply],
    queryFn: () =>
      api.get<VatRates>(
        `/api/tenants/${tenantId}/vat-rates${dateOfSupply ? `?dateOfSupply=${dateOfSupply}` : ''}`,
      ),
  })

  // The backend sends the categories in enum order, which is the order they are read in.
  const rows: RateRow[] = Object.entries(rates.data ?? {}).map(([code, rate]) => ({ code, rate }))

  const columns: Column<RateRow>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[220px]',
      render: (row) => <span className="font-mono text-[12px]">{row.code}</span>,
    },
    {
      key: 'category',
      header: 'MwSt-Behandlung',
      render: (row) => <span className="font-medium">{categoryLabel(row.code)}</span>,
    },
    {
      key: 'rate',
      header: 'Satz',
      align: 'right',
      width: 'w-[130px]',
      render: (row) => formatPercent(row.rate),
    },
  ]

  return (
    <>
      <PageHeader
        title="Mehrwertsteuer"
        subtitle="Welcher Satz auf eine Belegzeile kommt, und wo die Einstellungen dahinter liegen."
      />

      <div className="grid max-w-[820px] gap-6 px-8 pb-12">
        <Panel title="Sätze zum Leistungsdatum" padded={false}>
          <div className="border-b border-line-subtle p-5">
            <TextField
              label="Leistungsdatum"
              type="date"
              value={dateOfSupply}
              onChange={(event) => setDateOfSupply(event.target.value)}
              hint="Massgebend ist das Datum der Leistung, nicht das Datum des Belegs."
              className="max-w-[240px]"
            />
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(row) => row.code}
            loading={rates.isPending}
            error={rates.error}
            empty={<EmptyState title="Keine Sätze" description={NO_RATES} />}
          />

          <p className="border-t border-line-subtle px-5 py-3.5 text-[12px] text-text-tertiary">
            Die Sätze sind eidgenössisch festgelegt, werden mit der Anwendung ausgeliefert und
            lassen sich nicht pro Mandant pflegen. Ändern lässt sich nur die Bezeichnung einer
            MwSt-Behandlung, unter{' '}
            <Link to="/feste-werte" className="text-accent-text hover:underline">
              Feste Werte
            </Link>
            .
          </p>
        </Panel>

        {can('TENANT_READ') && <VatSettings tenantId={tenantId} />}
      </div>
    </>
  )
}

/** How this tenant accounts for the tax, read from the tenant and shown without a way to edit. */
function VatSettings({ tenantId }: { tenantId: number }) {
  const methodLabel = useCatalogueLabel(tenantId, 'vat-method')

  const tenant = useQuery({
    // Same key as the tenant mask, which reads the id from the route as a string: one entry in
    // the cache instead of two for the same record.
    queryKey: ['tenant', String(tenantId)],
    queryFn: () => api.get<Tenant>(`/api/tenants/${tenantId}`),
  })

  const vat = tenant.data?.vat
  const liable = vat?.vatLiable === true

  return (
    <Panel
      title="Abrechnung dieses Mandanten"
      description="Was der Mandant selbst entscheidet: ob er abrechnet und nach welcher Methode."
    >
      {tenant.isPending && <LoadingBlock label="Einstellungen werden geladen" />}
      {tenant.error !== null && <ErrorNotice error={tenant.error} />}

      {tenant.data && (
        <>
          <div>
            <SettingRow label="Steuerpflichtig">
              <Badge tone={liable ? 'accent' : 'muted'}>{liable ? 'Ja' : 'Nein'}</Badge>
            </SettingRow>
            <SettingRow label="Abrechnungsmethode">
              {liable ? methodLabel(vat?.vatMethod) : '-'}
            </SettingRow>
            {vat?.vatMethod === 'SALDO' && (
              <SettingRow label="Saldosteuersatz">
                <span className="font-mono text-[12px] tabular-nums">
                  {formatPercent(vat.vatSaldoRate)}
                </span>
              </SettingRow>
            )}
            <SettingRow label="Steuerpflichtig ab">{formatDate(vat?.vatLiableFrom)}</SettingRow>
            <SettingRow label="UID">
              <span className="font-mono text-[12px]">{tenant.data.uid ?? '-'}</span>
            </SettingRow>
          </div>

          <p className="mt-4 text-[12px] text-text-tertiary">
            Geändert werden diese Angaben in der{' '}
            <Link to={`/mandanten/${tenantId}`} className="text-accent-text hover:underline">
              Mandantenmaske
            </Link>
            , nicht hier.
          </p>
        </>
      )}
    </Panel>
  )
}

/** One label and its value, the way a read-only setting is listed. */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line-subtle py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-[12px] text-text-tertiary">{label}</span>
      <span className="text-right text-[13px]">{children}</span>
    </div>
  )
}
