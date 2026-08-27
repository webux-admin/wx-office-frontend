import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { CheckboxField } from '../components/CheckboxField'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequirePermission } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { parseDecimal } from '../lib/format'
import { originOf, type Origin } from '../lib/origin'
import type { ReferenceType, Tenant, VatMethod } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { PaymentTermSelect } from '../masterdata/PaymentTermSelect'

/** The company the books belong to: address, VAT, bank and the defaults for its documents. */
export function TenantPage() {
  return (
    <RequirePermission permission="TENANT_READ">
      <TenantLoader />
    </RequirePermission>
  )
}

function TenantLoader() {
  const { id } = useParams()
  const creating = id === 'neu'

  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get<Tenant>(`/api/tenants/${id}`),
    enabled: !creating,
  })

  if (creating) return <TenantMask tenant={null} />
  if (tenant.isPending) return <LoadingBlock label="Mandant wird geladen" />
  if (tenant.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={tenant.error} />
      </div>
    )
  }
  return <TenantMask key={tenant.data.id} tenant={tenant.data} />
}

type TenantForm = {
  code: string
  name: string
  legalForm: string
  uid: string
  commercialRegisterName: string
  vatLiable: boolean
  vatMethod: VatMethod
  vatSaldoRate: string
  vatLiableFrom: string
  street: string
  buildingNumber: string
  postalCode: string
  town: string
  country: string
  email: string
  phone: string
  website: string
  iban: string
  qrIban: string
  bankName: string
  referenceType: ReferenceType
  qrCustomerId: string
  baseCurrency: string
  fiscalYearStartMonth: string
  defaultLanguage: string
  defaultPaymentTerm: string
  cashRoundingEnabled: boolean
  cashRoundingIncrement: string
  defaultRevenueAccount: string
  invoiceFooterText: string
}

function initial(tenant: Tenant | null): TenantForm {
  return {
    code: tenant?.code ?? '',
    name: tenant?.name ?? '',
    legalForm: tenant?.legalForm ?? '',
    uid: tenant?.uid ?? '',
    commercialRegisterName: tenant?.commercialRegisterName ?? '',
    vatLiable: tenant?.vat?.vatLiable === true,
    vatMethod: tenant?.vat?.vatMethod ?? 'EFFECTIVE',
    vatSaldoRate: tenant?.vat?.vatSaldoRate?.toString() ?? '',
    vatLiableFrom: tenant?.vat?.vatLiableFrom ?? '',
    street: tenant?.address?.street ?? '',
    buildingNumber: tenant?.address?.buildingNumber ?? '',
    postalCode: tenant?.address?.postalCode ?? '',
    town: tenant?.address?.town ?? '',
    country: tenant?.address?.country ?? '',
    email: tenant?.contact?.email ?? '',
    phone: tenant?.contact?.phone ?? '',
    website: tenant?.contact?.website ?? '',
    iban: tenant?.bank?.iban ?? '',
    qrIban: tenant?.bank?.qrIban ?? '',
    bankName: tenant?.bank?.bankName ?? '',
    referenceType: tenant?.bank?.referenceType ?? 'NON',
    qrCustomerId: tenant?.bank?.qrCustomerId ?? '',
    baseCurrency: tenant?.baseCurrency ?? '',
    fiscalYearStartMonth: `${tenant?.fiscalYearStartMonth ?? 1}`,
    defaultLanguage: tenant?.defaultLanguage ?? '',
    defaultPaymentTerm: tenant?.defaultPaymentTerm ?? '',
    cashRoundingEnabled: tenant?.cashRoundingEnabled === true,
    cashRoundingIncrement: tenant?.cashRoundingIncrement?.toString() ?? '0.05',
    defaultRevenueAccount: tenant?.defaultRevenueAccount ?? '',
    invoiceFooterText: tenant?.invoiceFooterText ?? '',
  }
}

/** Why the selection lists are out of reach while the tenant is being created. */
const AFTER_CREATION =
  'Wählbar, sobald der Mandant angelegt ist: seine Auswahllisten entstehen mit ihm.'

/** Where a tenant mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/mandanten', label: 'Mandanten' }

function TenantMask({ tenant }: { tenant: Tenant | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('TENANT_WRITE')
  const creating = tenant === null
  // A tenant that does not exist yet has no lists to read; see the hint on those fields.
  const tenantId = tenant?.id ?? null

  const [form, setForm] = useState<TenantForm>(initial(tenant))
  const [complaint, setComplaint] = useState<string | null>(null)

  const set = <K extends keyof TenantForm>(field: K, value: TenantForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const payload = (): Partial<Tenant> => ({
    code: form.code.trim(),
    name: form.name.trim(),
    legalForm: form.legalForm || undefined,
    uid: form.uid.trim() || undefined,
    commercialRegisterName: form.commercialRegisterName.trim() || undefined,
    vat: {
      vatLiable: form.vatLiable,
      vatMethod: form.vatLiable ? form.vatMethod : undefined,
      vatSaldoRate:
        form.vatLiable && form.vatMethod === 'SALDO'
          ? (parseDecimal(form.vatSaldoRate) ?? undefined)
          : undefined,
      vatLiableFrom: form.vatLiable ? form.vatLiableFrom || undefined : undefined,
    },
    address: {
      street: form.street.trim() || undefined,
      buildingNumber: form.buildingNumber.trim() || undefined,
      postalCode: form.postalCode.trim(),
      town: form.town.trim(),
      country: form.country || undefined,
    },
    contact: {
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      website: form.website.trim() || undefined,
    },
    bank: {
      iban: form.iban.replace(/\s/g, '') || undefined,
      qrIban: form.qrIban.replace(/\s/g, '') || undefined,
      bankName: form.bankName.trim() || undefined,
      referenceType: form.referenceType,
      qrCustomerId: form.qrCustomerId || undefined,
    },
    baseCurrency: form.baseCurrency || undefined,
    fiscalYearStartMonth: parseDecimal(form.fiscalYearStartMonth) ?? undefined,
    defaultLanguage: form.defaultLanguage || undefined,
    defaultPaymentTerm: form.defaultPaymentTerm || undefined,
    cashRoundingEnabled: form.cashRoundingEnabled,
    cashRoundingIncrement: form.cashRoundingEnabled
      ? (parseDecimal(form.cashRoundingIncrement) ?? undefined)
      : undefined,
    defaultRevenueAccount: form.defaultRevenueAccount || undefined,
    invoiceFooterText: form.invoiceFooterText.trim() || undefined,
    // Neither the module switch nor the two count thresholds are sent any more. They live on
    // «Systemeinstellungen → Module», and a payload that leaves a field out changes nothing
    // about it — which is what keeps every save of this form from switching the store off
    // (backend ADR-0078 and ADR-0079).
  })

  const save = useMutation({
    mutationFn: () =>
      tenant
        ? api.put<Tenant>(`/api/tenants/${tenant.id}`, payload())
        : api.post<Tenant>('/api/tenants', payload()),
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // The entry is replaced instead of pushed: a mask that has been saved is not a place to
    // return to with the back button.
    // Creating is the exception this mask makes for itself. VAT, bank and the document
    // defaults are out of reach until the tenant exists, and the panel above promises them
    // for afterwards; without a payment account there is no QR bill. So the new record opens
    // instead of closing, and the origin travels with it.
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['tenant'] })
      void queryClient.invalidateQueries({ queryKey: ['tenants'] })
      if (tenant) {
        void navigate(origin.from, { replace: true })
        return
      }
      void navigate(`/mandanten/${saved.id}`, { replace: true, state: { origin } })
    },
  })

  const submit = () => {
    const problem =
      form.code.trim() === '' || form.name.trim() === ''
        ? 'Code und Name sind Pflicht.'
        : form.postalCode.trim() === '' || form.town.trim() === ''
          ? 'Ohne Postleitzahl und Ort fehlt die Absenderadresse auf jedem Beleg.'
          : null
    setComplaint(problem)
    if (!problem) save.mutate()
  }

  // Ctrl+S and Ctrl+Enter do what the primary button does, so a mask can be
  // filled in and finished without reaching for the mouse.
  useSubmitShortcut(mayWrite && !save.isPending ? submit : undefined)

  return (
    <>
      <PageHeader
        title={tenant ? tenant.name : 'Neuer Mandant'}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          tenant ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px]">{tenant.code}</span>
              {tenant.active === false && <Badge tone="muted">Deaktiviert</Badge>}
            </span>
          ) : (
            'Der Mandant ist der Absender jedes Belegs.'
          )
        }
      >
        {mayWrite && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12 lg:grid-cols-2">
        {(complaint || save.error) && (
          <div className="lg:col-span-2">
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          </div>
        )}

        <Panel title="Firma">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Code"
              value={form.code}
              onChange={(event) => set('code', event.target.value)}
              disabled={!mayWrite}
              maxLength={20}
            />
            <MasterDataSelect
              label="Rechtsform"
              tenantId={tenantId}
              list="legal-forms"
              value={form.legalForm}
              storedLabel={tenant?.legalFormLabel}
              onChange={(code) => set('legalForm', code)}
              disabled={!mayWrite || creating}
              emptyLabel="Bitte wählen"
              hint={creating ? AFTER_CREATION : undefined}
            />
            <TextField
              label="Name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              disabled={!mayWrite}
              maxLength={70}
              className="sm:col-span-2"
            />
            <TextField
              label="UID"
              value={form.uid}
              onChange={(event) => set('uid', event.target.value)}
              disabled={!mayWrite}
              placeholder="CHE-123.456.789"
              hint="Die Prüfziffer kontrolliert das Backend."
            />
            <TextField
              label="Handelsregistername"
              value={form.commercialRegisterName}
              onChange={(event) => set('commercialRegisterName', event.target.value)}
              disabled={!mayWrite}
              maxLength={140}
            />
          </div>
        </Panel>

        <Panel title="Adresse und Kontakt">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Strasse"
              value={form.street}
              onChange={(event) => set('street', event.target.value)}
              disabled={!mayWrite}
            />
            <TextField
              label="Nummer"
              value={form.buildingNumber}
              onChange={(event) => set('buildingNumber', event.target.value)}
              disabled={!mayWrite}
            />
            <TextField
              label="PLZ"
              value={form.postalCode}
              onChange={(event) => set('postalCode', event.target.value)}
              disabled={!mayWrite}
            />
            <TextField
              label="Ort"
              value={form.town}
              onChange={(event) => set('town', event.target.value)}
              disabled={!mayWrite}
            />
            <MasterDataSelect
              label="Land"
              tenantId={tenantId}
              list="countries"
              value={form.country}
              storedLabel={tenant?.address?.countryLabel}
              onChange={(code) => set('country', code)}
              disabled={!mayWrite || creating}
              hint={creating ? AFTER_CREATION : undefined}
            />
            <TextField
              label="E-Mail"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              disabled={!mayWrite}
            />
            <TextField
              label="Telefon"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              disabled={!mayWrite}
            />
            <TextField
              label="Website"
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
              disabled={!mayWrite}
            />
          </div>
        </Panel>

        {creating && (
          <Panel title="Nach dem Anlegen" className="lg:col-span-2">
            <p className="text-[13px] text-text-secondary">
              Mehrwertsteuer, Bank und die Vorgaben für Belege werden eingestellt, sobald der
              Mandant angelegt ist. Er bekommt dabei seine eigenen Auswahllisten mit den
              ausgelieferten Werten — Währung, Sprache und Land stehen dann zur Wahl.
            </p>
          </Panel>
        )}

        {!creating && (
          <Panel title="Mehrwertsteuer">
            <div className="grid gap-4">
              <CheckboxField
                label="Mehrwertsteuerpflichtig"
                hint="Ohne Pflicht steht auf keinem Beleg ein Steuersatz."
                checked={form.vatLiable}
                onChange={(event) => set('vatLiable', event.target.checked)}
                disabled={!mayWrite}
              />

              {form.vatLiable && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <CatalogueSelect
                    label="Abrechnungsmethode"
                    tenantId={tenantId}
                    catalogue="vat-method"
                    value={form.vatMethod}
                    onChange={(code) => set('vatMethod', code as VatMethod)}
                    disabled={!mayWrite}
                  />

                  <TextField
                    label="Steuerpflichtig ab"
                    type="date"
                    value={form.vatLiableFrom}
                    onChange={(event) => set('vatLiableFrom', event.target.value)}
                    disabled={!mayWrite}
                  />

                  {form.vatMethod === 'SALDO' && (
                    <TextField
                      label="Saldosteuersatz in Prozent"
                      value={form.vatSaldoRate}
                      onChange={(event) => set('vatSaldoRate', event.target.value)}
                      disabled={!mayWrite}
                      inputMode="decimal"
                      numeric
                      hint="Der mit der Steuerverwaltung vereinbarte Satz."
                      className="sm:col-span-2"
                    />
                  )}
                </div>
              )}
            </div>
          </Panel>
        )}

        {!creating && (
          <Panel title="Bank">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="IBAN"
                value={form.iban}
                onChange={(event) => set('iban', event.target.value)}
                disabled={!mayWrite}
                className="sm:col-span-2"
              />
              <TextField
                label="QR-IBAN"
                value={form.qrIban}
                onChange={(event) => set('qrIban', event.target.value)}
                disabled={!mayWrite}
                hint="Nur nötig für Einzahlungsscheine mit QR-Referenz."
              />
              <TextField
                label="Kundenidentifikation der Bank"
                value={form.qrCustomerId}
                onChange={(event) => set('qrCustomerId', event.target.value)}
                disabled={!mayWrite}
                inputMode="numeric"
                hint="Sechs Ziffern. Ohne sie lässt sich keine QR-Referenz bilden."
              />
              <CatalogueSelect
                label="Referenzart"
                tenantId={tenantId}
                catalogue="reference-type"
                value={form.referenceType}
                onChange={(code) => set('referenceType', code as ReferenceType)}
                disabled={!mayWrite}
              />
              <TextField
                label="Bank"
                value={form.bankName}
                onChange={(event) => set('bankName', event.target.value)}
                disabled={!mayWrite}
                className="sm:col-span-2"
              />
            </div>
          </Panel>
        )}

        {!creating && (
          <Panel title="Vorgaben für Belege" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MasterDataSelect
                label="Währung"
                tenantId={tenantId}
                list="currencies"
                value={form.baseCurrency}
                storedLabel={tenant?.baseCurrencyLabel}
                onChange={(code) => set('baseCurrency', code)}
                disabled={!mayWrite || creating}
                hint={creating ? AFTER_CREATION : undefined}
              />
              <TextField
                label="Erster Monat des Geschäftsjahrs"
                value={form.fiscalYearStartMonth}
                onChange={(event) => set('fiscalYearStartMonth', event.target.value)}
                disabled={!mayWrite}
                inputMode="numeric"
                numeric
                hint="1 bis 12."
              />
              <MasterDataSelect
                label="Sprache"
                tenantId={tenantId}
                list="languages"
                value={form.defaultLanguage}
                storedLabel={tenant?.defaultLanguageLabel}
                onChange={(code) => set('defaultLanguage', code)}
                disabled={!mayWrite || creating}
                hint={creating ? AFTER_CREATION : undefined}
              />
              <PaymentTermSelect
                label="Zahlungskondition"
                tenantId={tenant?.id ?? null}
                value={form.defaultPaymentTerm}
                onChange={(code) => set('defaultPaymentTerm', code)}
                storedLabel={tenant?.defaultPaymentTermLabel}
                disabled={!mayWrite || creating}
                hint={creating ? AFTER_CREATION : 'Vorgabe für neue Belege.'}
              />
              <MasterDataSelect
                label="Ertragskonto"
                tenantId={tenantId}
                list="revenue-accounts"
                value={form.defaultRevenueAccount}
                storedLabel={tenant?.defaultRevenueAccountLabel}
                onChange={(code) => set('defaultRevenueAccount', code)}
                disabled={!mayWrite || creating}
                emptyLabel="Ohne Vorgabe"
                hint={creating ? AFTER_CREATION : 'Gilt, wo eine Zeile kein eigenes Konto trägt.'}
              />
              <CheckboxField
                label="Rappenrundung"
                hint="Rundet den Endbetrag auf das eingestellte Vielfache."
                checked={form.cashRoundingEnabled}
                onChange={(event) => set('cashRoundingEnabled', event.target.checked)}
                disabled={!mayWrite}
                className="items-center"
              />
              {form.cashRoundingEnabled && (
                <TextField
                  label="Rundungsschritt"
                  value={form.cashRoundingIncrement}
                  onChange={(event) => set('cashRoundingIncrement', event.target.value)}
                  disabled={!mayWrite}
                  inputMode="decimal"
                  numeric
                  hint="In der Schweiz 0.05."
                />
              )}
            </div>

            <TextAreaField
              label="Fusstext auf Rechnungen"
              value={form.invoiceFooterText}
              onChange={(event) => set('invoiceFooterText', event.target.value)}
              disabled={!mayWrite}
              maxLength={500}
              className="mt-4"
            />

            {/* «Lager verwenden» stood here, with the two count thresholds under it. Both
                moved to «Systemeinstellungen → Module»: a switch that decides whether a whole
                part of the application exists is not a field beside the invoice footer, and
                the thresholds belong beside the switch they were put next to (ADR-0074,
                backend ADR-0079). This form does not send either of them any more, and a
                payload that leaves a field out changes nothing about it. */}
          </Panel>
        )}
      </div>
    </>
  )
}
