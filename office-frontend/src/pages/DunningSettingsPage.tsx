import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_GROUPINGS,
  DUNNING_GROUPING_HINTS,
  DUNNING_LEVELS_PATH,
  DUNNING_RIGHTS,
  FEE_BOOKINGS,
  FEE_VAT_MODES,
  dunningSettingsKey,
  fetchDunningSettings,
  saveDunningSettings,
} from '../lib/dunning'
import { useMasterDataList } from '../masterdata/useMasterData'
import type { DunningGrouping, DunningSettings, FeeBooking, FeeVatMode } from '../lib/types'

/** What the mask edits. Strings, because a half-typed amount is not a number. */
type SettingsForm = {
  numberRangeCode: string
  minimumOpenAmount: string
  showPaymentPart: boolean
  grouping: DunningGrouping
  feeBooking: FeeBooking
  feeVatMode: FeeVatMode
  feeRevenueAccountId: string
}

function formOf(settings: DunningSettings): SettingsForm {
  return {
    numberRangeCode: settings.numberRangeCode,
    minimumOpenAmount: settings.minimumOpenAmount.toFixed(2),
    showPaymentPart: settings.showPaymentPart,
    grouping: settings.grouping,
    feeBooking: settings.feeBooking,
    feeVatMode: settings.feeVatMode,
    feeRevenueAccountId:
      settings.feeRevenueAccountId === undefined ? '' : String(settings.feeRevenueAccountId),
  }
}

/**
 * How the tenant runs its dunning.
 *
 * <p>The configuration comes into being the first time this screen is opened — a tenant that
 * never looks carries no settings and no levels (backend ADR-0093). The levels themselves have
 * a screen of their own; what stands here is everything that applies to all of them.
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
      <>
        <PageHeader title="Mahnwesen" />
        <div className="px-8 pb-12">
          <ErrorNotice error={settings.error} />
        </div>
      </>
    )
  }

  if (settings.data === undefined) {
    return (
      <>
        <PageHeader title="Mahnwesen" />
        <div className="px-8 pb-12">
          <p className="text-[13px] text-text-secondary">Wird geladen ...</p>
        </div>
      </>
    )
  }

  // Keyed on what is stored, like the header sections of the document mask: what somebody
  // typed has to give way when a save or another user rewrites the state underneath it.
  return (
    <SettingsMask
      key={`${settings.data.numberRangeCode}-${settings.data.minimumOpenAmount}-${settings.data.grouping}-${settings.data.feeBooking}-${settings.data.feeVatMode}-${settings.data.feeRevenueAccountId ?? ''}`}
      tenantId={tenantId}
      stored={settings.data}
    />
  )
}

function SettingsMask({ tenantId, stored }: { tenantId: number; stored: DunningSettings }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(DUNNING_RIGHTS.configure)

  const accounts = useMasterDataList(tenantId, 'revenue-accounts')

  const [form, setForm] = useState<SettingsForm>(() => formOf(stored))

  const save = useMutation({
    mutationFn: (body: SettingsForm) =>
      saveDunningSettings(tenantId, {
        numberRangeCode: body.numberRangeCode.trim(),
        minimumOpenAmount: Number(body.minimumOpenAmount.replace(',', '.')),
        showPaymentPart: body.showPaymentPart,
        grouping: body.grouping,
        feeBooking: body.feeBooking,
        feeVatMode: body.feeVatMode,
        feeRevenueAccountId:
          body.feeRevenueAccountId === '' ? null : Number(body.feeRevenueAccountId),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dunningSettingsKey(tenantId) })
    },
  })

  return (
    <>
      <PageHeader
        title="Mahnwesen"
        subtitle={`${stored.activeLevelCount} Mahnstufen aktiv`}
      >
        {mayConfigure && (
          <Button onClick={() => save.mutate(form)} busy={save.isPending}>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {save.error !== null && <ErrorNotice error={save.error} />}

        <Panel
          title="Mahnlauf"
          description="Was für alle Stufen gilt. Die Stufen selbst stehen unter «Mahnstufen»."
        >
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nummernkreis"
                value={form.numberRangeCode}
                onChange={(event) =>
                  setForm({ ...form, numberRangeCode: event.target.value })
                }
                disabled={!mayConfigure}
                hint="Code des Kreises, aus dem Mahnungen ihre Nummer ziehen."
              />
              <TextField
                label="Bagatellgrenze"
                value={form.minimumOpenAmount}
                onChange={(event) =>
                  setForm({ ...form, minimumOpenAmount: event.target.value })
                }
                disabled={!mayConfigure}
                inputMode="decimal"
                numeric
                hint="In der Buchführungswährung des Mandanten. 0.00 heisst: jeder Rappen wird gemahnt."
              />
            </div>

            <CheckboxField
              label="Zahlteil auf der Mahnung drucken"
              hint="Ein QR-Zahlteil, damit der Kunde direkt bezahlen kann."
              checked={form.showPaymentPart}
              onChange={(event) =>
                setForm({ ...form, showPaymentPart: event.target.checked })
              }
              disabled={!mayConfigure}
            />

            <SelectField
              label="Gruppierung"
              value={form.grouping}
              onChange={(event) =>
                setForm({ ...form, grouping: event.target.value as DunningGrouping })
              }
              disabled={!mayConfigure}
              hint={DUNNING_GROUPING_HINTS[form.grouping]}
            >
              {(Object.keys(DUNNING_GROUPINGS) as DunningGrouping[]).map((code) => (
                <option key={code} value={code}>
                  {DUNNING_GROUPINGS[code]}
                </option>
              ))}
            </SelectField>
            <p className="text-[12px] text-text-tertiary">
              Einzelne Kunden weichen davon an ihrer Kundenmaske ab. Wer nichts einträgt, folgt
              dieser Vorgabe — auch wenn sie später geändert wird.
            </p>
          </div>
        </Panel>

        <Panel
          title="Mahngebühr"
          description="Ab Werk 0.00 auf jeder Stufe. Was hier steht, entscheidet erst, wenn eine Stufe eine Gebühr trägt."
        >
          <div className="grid gap-4">
            <p className="text-[13px] text-text-secondary">
              Eine Mahngebühr ist nur geschuldet, wenn sie vertraglich vereinbart ist — im
              Vertrag, in der Offerte oder in einbezogenen AGB. Ob sie mehrwertsteuerpflichtig
              ist, klärt Ihr Treuhänder.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Verbuchung"
                value={form.feeBooking}
                onChange={(event) =>
                  setForm({ ...form, feeBooking: event.target.value as FeeBooking })
                }
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
                onChange={(event) =>
                  setForm({ ...form, feeVatMode: event.target.value as FeeVatMode })
                }
                disabled={!mayConfigure}
              >
                {(Object.keys(FEE_VAT_MODES) as FeeVatMode[]).map((code) => (
                  <option key={code} value={code}>
                    {FEE_VAT_MODES[code]}
                  </option>
                ))}
              </SelectField>
            </div>

            <SelectField
              label="Ertragskonto der Gebühr"
              value={form.feeRevenueAccountId}
              onChange={(event) =>
                setForm({ ...form, feeRevenueAccountId: event.target.value })
              }
              disabled={!mayConfigure || form.feeBooking === 'ON_DUNNING_ONLY'}
              hint="Aus der Liste «Ertragskonten». Nötig, sobald eine Stufe eine Gebühr verlangt."
            >
              <option value="">– kein Konto –</option>
              {(accounts.data ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </SelectField>

            {!stored.feeBookable && (
              <p className="text-[12px] text-text-secondary">
                Solange Konto und Belegart fehlen, lässt sich auf keiner Stufe eine Gebühr
                setzen. Die Belegart der Gebührenrechnung kommt mit der Gebührenlogik.
              </p>
            )}
          </div>
        </Panel>

        <p className="text-[12px] text-text-secondary">
          Die Mahnstufen mit Fristen und Gebühren stehen unter{' '}
          <a className="text-accent-text" href={DUNNING_LEVELS_PATH}>
            Mahnstufen
          </a>
          .
        </p>
      </div>
    </>
  )
}
