import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { FactList, type Fact } from '../components/FactList'
import { FormMask } from '../components/FormMask'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS, isAccountNumber } from '../lib/accounting'
import { useRunsModule } from '../lib/modules'
import {
  DUNNING_GROUPINGS,
  DUNNING_GROUPING_HINTS,
  DUNNING_RIGHTS,
  FEE_BOOKINGS,
  FEE_VAT_MODES,
  dunningSettingsKey,
  fetchDunningSettings,
  saveDunningSettings,
} from '../lib/dunning'
import type { DunningGrouping, DunningSettings, FeeBooking, FeeVatMode } from '../lib/types'
import { AccountSelect } from './accounting/AccountSelect'

/** Where the mask goes back to: the list of the Belege, which is where the dunning starts too. */
const BACK = { to: '/', label: 'Übersicht' }

/** What is said under the account field when a typed number cannot be stored. */
const ACCOUNT_COMPLAINT =
  'Nur Ziffern und Punkte, mit einer Ziffer am Anfang, höchstens 20 Zeichen.'

type Register = 'lauf' | 'gebuehr' | 'versand'

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'lauf', label: 'Mahnlauf' },
  { id: 'gebuehr', label: 'Gebühr' },
  { id: 'versand', label: 'Versand' },
]

/** What the mask edits. Strings, because a half-typed amount is not a number. */
type SettingsForm = {
  numberRangeCode: string
  minimumOpenAmount: string
  showPaymentPart: boolean
  grouping: DunningGrouping
  feeBooking: FeeBooking
  feeVatMode: FeeVatMode
  feeRevenueAccountNo: string
  attachInvoiceCopies: boolean
  noticeBcc: string
}

function formOf(settings: DunningSettings): SettingsForm {
  return {
    numberRangeCode: settings.numberRangeCode,
    minimumOpenAmount: settings.minimumOpenAmount.toFixed(2),
    showPaymentPart: settings.showPaymentPart,
    grouping: settings.grouping,
    feeBooking: settings.feeBooking,
    feeVatMode: settings.feeVatMode,
    feeRevenueAccountNo: settings.feeRevenueAccountNo ?? '',
    attachInvoiceCopies: settings.attachInvoiceCopies,
    noticeBcc: settings.noticeBcc ?? '',
  }
}

/**
 * How the tenant runs its dunning: one mask with three registers, the way the partner is
 * edited.
 *
 * <p>The configuration comes into being the first time this screen is opened — a tenant that
 * never looks carries no settings and no levels (backend ADR-0093). The levels have a screen of
 * their own; what stands here applies to all of them.
 */
export function DunningSettingsPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read}>
      {(tenantId) => <Settings tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Settings({ tenantId }: { tenantId: number }) {
  const settings = useQuery({
    queryKey: dunningSettingsKey(tenantId),
    queryFn: () => fetchDunningSettings(tenantId),
  })

  if (settings.error !== null) {
    return (
      <div className="px-8 py-6">
        <ErrorNotice error={settings.error} />
      </div>
    )
  }
  if (settings.data === undefined) return <LoadingBlock label="Mahnwesen wird geladen" />

  // Keyed on what is stored: what somebody typed gives way when a save, or another user,
  // rewrites the state underneath it.
  return (
    <SettingsMask
      key={JSON.stringify(settings.data)}
      tenantId={tenantId}
      stored={settings.data}
    />
  )
}

function SettingsMask({ tenantId, stored }: { tenantId: number; stored: DunningSettings }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const runs = useRunsModule()
  const mayConfigure = can(DUNNING_RIGHTS.configure)

  const [start] = useState<SettingsForm>(() => formOf(stored))
  const [form, setForm] = useState<SettingsForm>(start)
  const [tab, setTab] = useState<Register>('lauf')

  // The account is picked from the chart where the user may read it. Without that right the
  // field stays a text field: whoever configures the dunning must still be able to set it
  // (backend ADR-0127).
  const picksFromTheChart = runs(ACCOUNTING_MODULE) && can(ACCOUNTING_RIGHTS.read)

  const typedAccount = form.feeRevenueAccountNo.trim()
  const accountComplaint =
    typedAccount !== '' && !isAccountNumber(typedAccount) ? ACCOUNT_COMPLAINT : null

  const save = useMutation({
    mutationFn: (body: SettingsForm) =>
      saveDunningSettings(tenantId, {
        numberRangeCode: body.numberRangeCode.trim(),
        minimumOpenAmount: Number(body.minimumOpenAmount.replace(',', '.')),
        showPaymentPart: body.showPaymentPart,
        grouping: body.grouping,
        feeBooking: body.feeBooking,
        feeVatMode: body.feeVatMode,
        feeRevenueAccountNo:
          body.feeRevenueAccountNo.trim() === '' ? null : body.feeRevenueAccountNo.trim(),
        attachInvoiceCopies: body.attachInvoiceCopies,
        noticeBcc: body.noticeBcc.trim() === '' ? null : body.noticeBcc.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dunningSettingsKey(tenantId) })
    },
  })

  const change = (patch: Partial<SettingsForm>) => setForm((current) => ({ ...current, ...patch }))
  const dirty = JSON.stringify(form) !== JSON.stringify(start)
  const canSave = mayConfigure && !save.isPending && accountComplaint === null

  const facts: Fact[] = [
    { label: 'Mahnstufen aktiv', value: `${stored.activeLevelCount}` },
    { label: 'Nummernkreis', value: <span className="font-mono">{stored.numberRangeCode}</span> },
    { label: 'Gruppierung', value: DUNNING_GROUPINGS[stored.grouping] },
    {
      label: 'Versand',
      value: stored.mailReady ? (
        <Badge tone="success">Bereit</Badge>
      ) : (
        <Badge tone="muted">Nicht bereit</Badge>
      ),
    },
  ]

  return (
    <FormMask
      title="Mahnwesen"
      subtitle="Was für alle Mahnstufen gilt. Die Stufen selbst stehen unter «Mahnstufen»."
      back={BACK}
      dirty={dirty}
      onSubmit={canSave ? () => save.mutate(form) : undefined}
      actions={
        mayConfigure && (
          <Button onClick={() => save.mutate(form)} busy={save.isPending} disabled={!canSave} shortcut>
            Speichern
          </Button>
        )
      }
      summary={<FactList facts={facts} />}
      tabs={{ items: REGISTERS, active: tab, onChange: setTab }}
    >
      <div className="grid gap-6">
        {save.error !== null && <ErrorNotice error={save.error} />}

        {tab === 'lauf' && (
          <Panel
            title="Mahnlauf"
            description="Welche Forderungen gemahnt werden und wie die Mahnung aussieht."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nummernkreis"
                value={form.numberRangeCode}
                onChange={(event) => change({ numberRangeCode: event.target.value })}
                disabled={!mayConfigure}
                tooltip="Der Kreis, aus dem Mahnungen ihre Nummer ziehen."
              />
              <TextField
                label="Bagatellgrenze"
                value={form.minimumOpenAmount}
                onChange={(event) => change({ minimumOpenAmount: event.target.value })}
                disabled={!mayConfigure}
                inputMode="decimal"
                numeric
                tooltip="Kleinere offene Beträge werden nicht gemahnt. 0.00: jeder Rappen wird gemahnt. In Buchführungswährung."
              />
              <SelectField
                label="Gruppierung"
                value={form.grouping}
                onChange={(event) => change({ grouping: event.target.value as DunningGrouping })}
                disabled={!mayConfigure}
                className="sm:col-span-2"
                tooltip={`${DUNNING_GROUPING_HINTS[form.grouping]} Einzelne Kunden weichen an ihrer Kundenmaske ab.`}
              >
                {(Object.keys(DUNNING_GROUPINGS) as DunningGrouping[]).map((code) => (
                  <option key={code} value={code}>
                    {DUNNING_GROUPINGS[code]}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-4">
              <CheckboxField
                label="Zahlteil auf der Mahnung drucken"
                tooltip="Ein QR-Zahlteil, damit der Kunde direkt bezahlen kann."
                checked={form.showPaymentPart}
                onChange={(event) => change({ showPaymentPart: event.target.checked })}
                disabled={!mayConfigure}
              />
            </div>
          </Panel>
        )}

        {tab === 'gebuehr' && (
          <Panel
            title="Mahngebühr"
            description="Die Höhe steht auf jeder Mahnstufe. Hier wird nur geregelt, wie eine Gebühr gebucht wird. Ab Werk ist keine Gebühr gesetzt."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Verbuchung"
                value={form.feeBooking}
                onChange={(event) => change({ feeBooking: event.target.value as FeeBooking })}
                disabled={!mayConfigure}
              >
                {(Object.keys(FEE_BOOKINGS) as FeeBooking[]).map((code) => (
                  <option key={code} value={code}>
                    {FEE_BOOKINGS[code]}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="MwSt-Behandlung"
                value={form.feeVatMode}
                onChange={(event) => change({ feeVatMode: event.target.value as FeeVatMode })}
                disabled={!mayConfigure}
                tooltip="Ob die Gebühr mehrwertsteuerpflichtig ist, klärt Ihr Treuhänder."
              >
                {(Object.keys(FEE_VAT_MODES) as FeeVatMode[]).map((code) => (
                  <option key={code} value={code}>
                    {FEE_VAT_MODES[code]}
                  </option>
                ))}
              </SelectField>

              <div className="sm:col-span-2">
                {picksFromTheChart ? (
                  <AccountSelect
                    label="Ertragskonto der Gebühr"
                    tenantId={tenantId}
                    value={form.feeRevenueAccountNo}
                    onChange={(code) => change({ feeRevenueAccountNo: code })}
                    disabled={!mayConfigure || form.feeBooking === 'ON_DUNNING_ONLY'}
                    emptyLabel="– kein Konto –"
                    tooltip="Aus dem Kontenplan. Nötig, sobald eine Stufe eine Gebühr verlangt."
                  />
                ) : (
                  <TextField
                    label="Ertragskonto der Gebühr"
                    value={form.feeRevenueAccountNo}
                    onChange={(event) => change({ feeRevenueAccountNo: event.target.value })}
                    disabled={!mayConfigure || form.feeBooking === 'ON_DUNNING_ONLY'}
                    placeholder="3200"
                    error={accountComplaint ?? undefined}
                    tooltip={`Die Kontonummer aus dem Kontenplan, zum Beispiel 3200. Auswählen lässt sie sich mit dem Recht ${ACCOUNTING_RIGHTS.read}.`}
                  />
                )}
              </div>
            </div>

            {!stored.feeBookable && (
              <p className="mt-4 text-small text-text-secondary">
                Solange Konto und Belegart fehlen, lässt sich auf keiner Stufe eine Gebühr setzen.
              </p>
            )}
          </Panel>
        )}

        {tab === 'versand' && (
          <Panel
            title="Versand"
            description={
              stored.mailReady
                ? 'Wie die Mahnung per Mail hinausgeht.'
                : (stored.mailBlockedReason ?? 'Der Mailversand ist noch nicht eingerichtet.')
            }
          >
            <div className="grid gap-4">
              {/* Both off at delivery. The customer already has the invoice, and a collective
                  reminder over ten of them would make a mail that mailboxes refuse; the outbox
                  logs every dispatch anyway, so a blind copy is a wish, not a default
                  (backend ADR-0095). */}
              <CheckboxField
                label="Rechnungskopien an die Mahnung anhängen"
                tooltip="Nur beim Mailversand. Schneidet die «habe ich nie erhalten»-Ausrede ab, macht die Mail aber gross."
                checked={form.attachInvoiceCopies}
                onChange={(event) => change({ attachInvoiceCopies: event.target.checked })}
                disabled={!mayConfigure || !stored.mailReady}
              />

              <TextField
                label="Blindkopie an"
                type="email"
                value={form.noticeBcc}
                onChange={(event) => change({ noticeBcc: event.target.value })}
                disabled={!mayConfigure || !stored.mailReady}
                placeholder="buchhaltung@example.ch"
                tooltip="Leer: keine Blindkopie. Der Postausgang protokolliert den Versand ohnehin."
              />
            </div>
          </Panel>
        )}
      </div>
    </FormMask>
  )
}
