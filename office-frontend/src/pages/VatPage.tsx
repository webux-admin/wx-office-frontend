import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDate, formatPercent, parseDecimal, toIsoDate } from '../lib/format'
import { originState } from '../lib/origin'
import type { Tenant, VatCategory, VatRatePeriod, VatRates } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'

/** The tenant mask is opened from here to change the settings, and comes back here. */
const ORIGIN = originState('/mehrwertsteuer', 'Mehrwertsteuer')

/**
 * The VAT rates a document line is charged with, and the settings of this tenant behind them.
 *
 * <p>The percentages are federal and carry no tenant: recording a rate change here changes it
 * for every tenant at once, which is why maintaining them takes its own permission. Products
 * hold a category, never a percentage — a recorded change reaches every document line by its
 * date of supply, without touching any product. What a tenant does decide — whether it is
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
 * Why an empty answer points at the rate timeline: the rates belong to no tenant, so a
 * missing one is a day no recorded period covers, not a setting of this tenant.
 */
const NO_RATES =
  'Zu diesem Leistungsdatum ist kein Satz erfasst. Das deutet auf eine Lücke in den ' +
  'Satzperioden hin, nicht auf eine fehlende Einstellung dieses Mandanten.'

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
            Die Bezeichnung einer MwSt-Behandlung lässt sich unter{' '}
            <Link to="/feste-werte" className="text-accent-text hover:underline">
              Feste Werte
            </Link>{' '}
            anpassen.
          </p>
        </Panel>

        <VatRateChanges tenantId={tenantId} categoryLabel={categoryLabel} />

        {can('TENANT_READ') && <VatSettings tenantId={tenantId} />}
      </div>
    </>
  )
}

/** The categories that carry a percentage; the exempt ones are zero by law and have none. */
const RATED_CATEGORIES: VatCategory[] = ['STANDARD', 'REDUCED', 'ACCOMMODATION']

type PeriodForm = {
  category: VatCategory
  validFrom: string
  rate: string
}

const EMPTY_PERIOD: PeriodForm = { category: 'STANDARD', validFrom: '', rate: '' }

/**
 * The rate timeline per category, and the way an announced change is recorded.
 *
 * <p>Only category, first day and percentage are entered: the backend closes the running
 * period on the day before, so the timeline can neither overlap nor tear a gap. Corrected or
 * removed is only the latest period of a category, and only while its first day still lies in
 * the future — what already applied to supplies is history and stays.
 */
function VatRateChanges({
  tenantId,
  categoryLabel,
}: {
  tenantId: number
  categoryLabel: (code: string | undefined | null) => string
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('VAT_RATE_WRITE')

  const [editing, setEditing] = useState<VatRatePeriod | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<PeriodForm>(EMPTY_PERIOD)

  const periods = useQuery({
    queryKey: ['vat-rate-periods', tenantId],
    queryFn: () => api.get<VatRatePeriod[]>(`/api/tenants/${tenantId}/vat-rates/periods`),
  })

  // The lookup table above answers from the same data, so it is refreshed along.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['vat-rate-periods', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['vat-rates', tenantId] })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        category: form.category,
        validFrom: form.validFrom,
        rate: parseDecimal(form.rate),
      }
      return editing
        ? api.put<VatRatePeriod>(
            `/api/tenants/${tenantId}/vat-rates/periods/${editing.id}`,
            payload,
          )
        : api.post<VatRatePeriod>(`/api/tenants/${tenantId}/vat-rates/periods`, payload)
    },
    onSuccess: () => {
      refresh()
      close()
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) =>
      api.delete<void>(`/api/tenants/${tenantId}/vat-rates/periods/${id}`),
    onSuccess: refresh,
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_PERIOD)
    save.reset()
  }

  const openNew = () => {
    setForm(EMPTY_PERIOD)
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (period: VatRatePeriod) => {
    setForm({
      category: period.category,
      validFrom: period.validFrom,
      rate: String(period.rate),
    })
    setEditing(period)
    setCreating(false)
  }

  // Mirrors the backend rule so the buttons only appear where the call would succeed: the
  // latest period of its category, and its first day still ahead. ISO dates compare as text.
  const today = toIsoDate()
  const latestOf = new Map<VatCategory, VatRatePeriod>()
  for (const period of periods.data ?? []) {
    const latest = latestOf.get(period.category)
    if (!latest || period.validFrom > latest.validFrom) latestOf.set(period.category, period)
  }
  const mayTouch = (period: VatRatePeriod) =>
    latestOf.get(period.category)?.id === period.id && period.validFrom > today

  const columns: Column<VatRatePeriod>[] = [
    {
      key: 'category',
      header: 'MwSt-Behandlung',
      render: (period) => (
        <span className="font-medium">
          {categoryLabel(period.category)}{' '}
          <span className="font-mono text-[11px] text-text-tertiary">{period.category}</span>
        </span>
      ),
    },
    {
      key: 'validFrom',
      header: 'Gültig ab',
      width: 'w-[110px]',
      render: (period) => <span className="tabular-nums">{formatDate(period.validFrom)}</span>,
    },
    {
      key: 'validTo',
      header: 'Gültig bis',
      width: 'w-[130px]',
      render: (period) =>
        period.validTo ? (
          <span className="tabular-nums">{formatDate(period.validTo)}</span>
        ) : (
          <Badge tone="accent">offen</Badge>
        ),
    },
    {
      key: 'rate',
      header: 'Satz',
      align: 'right',
      width: 'w-[100px]',
      render: (period) => formatPercent(period.rate),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[150px]',
      render: (period) =>
        mayWrite && mayTouch(period) ? (
          <span className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => openEdit(period)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={() => period.id !== undefined && remove.mutate(period.id)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
            >
              Zurücknehmen
            </button>
          </span>
        ) : null,
    },
  ]

  const parsedRate = parseDecimal(form.rate)
  const open = creating || editing !== null

  return (
    <>
      <Panel title="Satzänderungen" padded={false}>
        <div className="flex items-center justify-between gap-4 border-b border-line-subtle p-5">
          <p className="text-[12px] text-text-tertiary">
            Kündigt die ESTV eine Änderung an, wird hier der neue Satz mit seinem ersten
            Geltungstag erfasst. Die laufende Periode endet automatisch am Vortag; Produkte
            bleiben unangetastet, weil sie nur die MwSt-Behandlung tragen.
          </p>
          {mayWrite && (
            <Button onClick={openNew}>
              <Plus size={15} aria-hidden />
              Satzänderung
            </Button>
          )}
        </div>

        {remove.error !== null && (
          <div className="px-5 pt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}

        <DataTable
          columns={columns}
          rows={periods.data ?? []}
          keyOf={(period) => period.id ?? `${period.category}-${period.validFrom}`}
          loading={periods.isPending}
          error={periods.error}
          empty={
            <EmptyState
              title="Keine Satzperioden"
              description="Ohne erfasste Perioden kann kein Beleg einen Satz beziehen."
            />
          }
        />

        <p className="border-t border-line-subtle px-5 py-3.5 text-[12px] text-text-tertiary">
          Die Sätze sind eidgenössisch und gelten für alle Mandanten. Korrigieren lässt sich
          nur eine Änderung, die noch nicht in Kraft ist — was schon gegolten hat, bleibt.
        </p>
      </Panel>

      <Dialog
        open={open}
        onClose={close}
        title={editing ? 'Satzänderung korrigieren' : 'Neue Satzänderung'}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={form.validFrom === '' || parsedRate === null}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <SelectField
            label="MwSt-Behandlung"
            value={form.category}
            disabled={editing !== null}
            hint={
              editing
                ? 'Die Behandlung einer Periode steht fest; falsch erfasst wird zurückgenommen.'
                : 'Nur Behandlungen mit Prozentsatz; befreit und ausgenommen sind von Gesetzes wegen null.'
            }
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                category: event.target.value as VatCategory,
              }))
            }
          >
            {RATED_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Gültig ab"
            type="date"
            value={form.validFrom}
            onChange={(event) =>
              setForm((current) => ({ ...current, validFrom: event.target.value }))
            }
            hint="Erster Tag, an dem der neue Satz gilt. Die laufende Periode endet am Vortag."
          />
          <TextField
            label="Satz in %"
            value={form.rate}
            onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))}
            hint="Höchstens drei Nachkommastellen, zum Beispiel 8.5."
            className="max-w-[160px]"
          />
          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Dialog>
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
            <Link
              to={`/mandanten/${tenantId}`}
              state={ORIGIN}
              className="text-accent-text hover:underline"
            >
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
