import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextAreaField } from '../components/TextAreaField'
import { Tabs } from '../components/Tabs'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { originOf } from '../lib/origin'
import type { Partner, PartnerType } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { PaymentTermSelect } from '../masterdata/PaymentTermSelect'
import { AddressFields } from './partner/AddressFields'
import { PartnerAddresses } from './partner/PartnerAddresses'
import { PartnerContacts } from './partner/PartnerContacts'
import { PartnerHistory } from './partner/PartnerHistory'
import { PartnerPrices } from './partner/PartnerPrices'
import {
  addressComplaint,
  emptyAddress,
  isUntouched,
  toAddressPayload,
  type AddressForm,
} from './partner/addressForm'
import { emptyPartner, firstComplaint, toForm, toPayload, type PartnerForm } from './partner/partnerForm'
import { wordingFor, type PartnerRole, type RoleWording } from './partner/role'

type Tab = 'stammdaten' | 'adressen' | 'kontakte' | 'verlauf' | 'preise'

/** One customer or supplier, with its addresses, contact persons and agreed prices. */
export function PartnerPage({ role }: { role: PartnerRole }) {
  return (
    <RequireTenant permission="PARTNER_READ">
      {(tenantId) => <PartnerLoader key={role} tenantId={tenantId} role={role} />}
    </RequireTenant>
  )
}

function PartnerLoader({ tenantId, role }: { tenantId: number; role: PartnerRole }) {
  const { id } = useParams()
  const wording = wordingFor(role)
  const creating = id === 'neu'

  const partner = useQuery({
    queryKey: ['partner', tenantId, id],
    queryFn: () => api.get<Partner>(`/api/tenants/${tenantId}/partners/${id}`),
    enabled: !creating,
  })

  if (creating) return <PartnerMask tenantId={tenantId} partner={null} wording={wording} />
  if (partner.isPending) return <LoadingBlock label={wording.loadingLabel} />
  if (partner.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={partner.error} />
      </div>
    )
  }

  // Keyed by the record, so switching resets the mask instead of carrying values over.
  return (
    <PartnerMask
      key={partner.data.id}
      tenantId={tenantId}
      partner={partner.data}
      wording={wording}
    />
  )
}

function PartnerMask({
  tenantId,
  partner,
  wording,
}: {
  tenantId: number
  partner: Partner | null
  wording: RoleWording
}) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, {
    from: wording.path,
    label: wording.backLabel,
  })

  const [form, setForm] = useState<PartnerForm>(
    partner ? toForm(partner) : emptyPartner(wording.role),
  )
  // The first address of a new record travels with it: the create endpoint takes addresses in
  // the same payload, so nothing stands half finished when the address is refused.
  const [address, setAddress] = useState<AddressForm>(() => emptyAddress('', true))
  const [tab, setTab] = useState<Tab>('stammdaten')
  const [complaint, setComplaint] = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  const creating = partner === null
  const mayWrite = can('PARTNER_WRITE')
  const set = <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['partner', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['partners', tenantId] })
  }

  const base = `/api/tenants/${tenantId}/partners`

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form)
      if (partner) return api.put<Partner>(`${base}/${partner.id}`, payload)
      return api.post<Partner>(base, {
        ...payload,
        addresses: isUntouched(address) ? undefined : [toAddressPayload(address)],
      })
    },
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from
    // rather than staying open. The entry is replaced instead of pushed: a mask that has been
    // saved is not a place to return to with the back button.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const deactivate = useMutation({
    mutationFn: () => api.delete<Partner>(`${base}/${partner?.id}`),
    onSuccess: () => {
      refresh()
      setDeactivating(false)
    },
  })

  const submit = () => {
    const problem =
      firstComplaint(form, wording) ??
      (creating && !isUntouched(address) ? addressComplaint(address) : null)
    setComplaint(problem)
    if (!problem) save.mutate()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stammdaten', label: 'Stammdaten' },
    { id: 'adressen', label: 'Adressen' },
    { id: 'kontakte', label: 'Kontaktpersonen' },
    // For both roles: a supplier has a record with us just as a customer does.
    { id: 'verlauf', label: 'Verlauf' },
    // Pricing is agreed with a buyer; a supplier has no price list of ours.
    ...(wording.role === 'customer' ? [{ id: 'preise' as Tab, label: 'Preise' }] : []),
  ]

  return (
    <>
      <PageHeader
        title={partner ? partner.name : wording.newTitle}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          partner ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[12px]">
                {partner.partnerNumber ?? 'ohne Nummer'}
              </span>
              {partner.isCustomer && partner.isSupplier && (
                <Badge tone="neutral">{wording.alsoBadge}</Badge>
              )}
              {partner.active === false && <Badge tone="muted">Deaktiviert</Badge>}
            </span>
          ) : (
            wording.newSubtitle
          )
        }
      >
        {partner && mayWrite && partner.active !== false && can('PARTNER_DEACTIVATE') && (
          <Button variant="secondary" onClick={() => setDeactivating(true)}>
            Deaktivieren
          </Button>
        )}
        {mayWrite && tab === 'stammdaten' && (
          <Button onClick={submit} busy={save.isPending}>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {partner && (
          <Tabs tabs={tabs} active={tab} onChange={setTab} label="Register" />
        )}

        {tab === 'stammdaten' && (complaint !== null || save.error !== null) && (
          <div className="mb-6">
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          </div>
        )}

        {tab === 'stammdaten' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <BaseData
              tenantId={tenantId}
              partner={partner}
              form={form}
              set={set}
              disabled={!mayWrite}
              stored={!creating}
              wording={wording}
            />

            {creating && (
              <Panel
                title={wording.addressPanelTitle}
                description={wording.addressPanelHint}
                className="lg:col-span-2"
              >
                <AddressFields
                  tenantId={tenantId}
                  form={address}
                  onChange={setAddress}
                  disabled={!mayWrite}
                />
                <p className="mt-4 text-[12px] text-text-tertiary">
                  Leer lassen ist erlaubt. Adressen lassen sich später ergänzen und ändern.
                </p>
              </Panel>
            )}
          </div>
        )}

        {tab === 'adressen' && partner && (
          <PartnerAddresses
            tenantId={tenantId}
            partnerId={partner.id}
            partnerName={partner.name}
            addresses={partner.addresses ?? []}
            mayWrite={mayWrite}
          />
        )}

        {tab === 'kontakte' && partner && (
          <PartnerContacts
            tenantId={tenantId}
            partnerId={partner.id}
            contacts={partner.contacts ?? []}
            mayWrite={mayWrite}
          />
        )}

        {/* No permission check: the server narrows the rows to what the reader may see and
            answers with an empty page when that is nothing. */}
        {tab === 'verlauf' && partner && (
          <PartnerHistory tenantId={tenantId} partnerId={partner.id} role={wording.role} />
        )}

        {tab === 'preise' && partner && can('PRODUCT_READ') && (
          <PartnerPrices tenantId={tenantId} partnerId={partner.id} />
        )}
      </div>

      {partner && (
        <Dialog
          open={deactivating}
          onClose={() => setDeactivating(false)}
          title={wording.deactivateTitle}
          description="Nichts wird gelöscht, der Eintrag verschwindet nur aus der Auswahl."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeactivating(false)}>
                Abbrechen
              </Button>
              <Button onClick={() => deactivate.mutate()} busy={deactivate.isPending}>
                Deaktivieren
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-text-secondary">{wording.deactivateBody}</p>
          <p className="mt-2 text-[12px] text-text-tertiary">
            Ein Gegenstück dazu kennt die API nicht. Rückgängig macht das niemand über diese
            Oberfläche.
          </p>
          {deactivate.error !== null && (
            <div className="mt-4">
              <ErrorNotice error={deactivate.error} />
            </div>
          )}
        </Dialog>
      )}
    </>
  )
}

/**
 * The fields of the record itself.
 *
 * <p>What identifies the record (its type, its name, the legal form, the name of a private
 * person) is asked once and shown read-only afterwards: `PUT /partners/{id}` merges only the
 * remaining fields into what is stored, so an editable field there would take a change that
 * the next reload undoes.
 */
function BaseData({
  tenantId,
  partner,
  form,
  set,
  disabled,
  stored,
  wording,
}: {
  tenantId: number
  /** The stored record, for the labels of values its lists no longer offer. */
  partner: Partner | null
  form: PartnerForm
  set: <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) => void
  /** True when the user holds no write permission; then nothing on the mask is editable. */
  disabled: boolean
  /** True once the record exists, which freezes the fields that identify it. */
  stored: boolean
  wording: RoleWording
}) {
  const person = form.partnerType === 'PERSON'
  const frozen = disabled || stored
  const ownRole = wording.role === 'customer' ? 'isCustomer' : 'isSupplier'
  const otherRole = wording.role === 'customer' ? 'isSupplier' : 'isCustomer'

  return (
    <>
      <Panel
        title="Stammdaten"
        description={
          stored
            ? 'Art, Name und Rechtsform stehen mit dem Anlegen fest. Das Backend ändert sie nicht mehr.'
            : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={wording.numberLabel}
            value={form.partnerNumber}
            onChange={(event) => set('partnerNumber', event.target.value)}
            disabled={disabled}
            maxLength={20}
            hint={
              stored
                ? 'Muss im Mandanten eindeutig sein. Ersetzen geht, entfernen nicht.'
                : 'Leer lassen, dann vergibt sie das Backend.'
            }
          />

          <CatalogueSelect
            label="Art"
            tenantId={tenantId}
            catalogue="partner-type"
            value={form.partnerType}
            onChange={(code) => set('partnerType', code as PartnerType)}
            disabled={frozen}
          />

          {person ? (
            <>
              <MasterDataSelect
                label="Anrede"
                tenantId={tenantId}
                list="salutations"
                value={form.salutation}
                storedLabel={partner?.salutationLabel}
                onChange={(code) => set('salutation', code)}
                disabled={frozen}
                emptyLabel="Ohne Anrede"
              />
              <TextField
                label="Vorname"
                value={form.firstName}
                onChange={(event) => set('firstName', event.target.value)}
                disabled={frozen}
                maxLength={60}
              />
              <TextField
                label="Nachname"
                value={form.lastName}
                onChange={(event) => set('lastName', event.target.value)}
                disabled={frozen}
                maxLength={60}
                required
                hint="Der Name auf Belegen entsteht aus Vor- und Nachname."
                className="sm:col-span-2"
              />
            </>
          ) : (
            <>
              <TextField
                label="Firmenname"
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                disabled={frozen}
                maxLength={70}
                required
              />
              <MasterDataSelect
                label="Rechtsform"
                tenantId={tenantId}
                list="legal-forms"
                value={form.legalForm}
                storedLabel={partner?.legalFormLabel}
                onChange={(code) => set('legalForm', code)}
                disabled={frozen}
                emptyLabel="Bitte wählen"
              />
              <TextField
                label="UID"
                value={form.uid}
                onChange={(event) => set('uid', event.target.value)}
                disabled={disabled}
                maxLength={20}
                placeholder="CHE-123.456.789"
                hint="Die Prüfziffer kontrolliert das Backend."
              />
              <TextField
                label="Handelsregistername"
                value={form.commercialRegisterName}
                onChange={(event) => set('commercialRegisterName', event.target.value)}
                disabled={disabled}
                maxLength={140}
                hint="Nur nötig, wenn er vom Firmennamen abweicht."
              />
            </>
          )}

          <MasterDataSelect
            label="Sprache"
            tenantId={tenantId}
            list="languages"
            value={form.language}
            storedLabel={partner?.languageLabel}
            onChange={(code) => set('language', code)}
            disabled={disabled}
            hint="Belege an diesen Eintrag werden in dieser Sprache geschrieben."
          />
        </div>

        <fieldset className="mt-5 border-t border-line-subtle pt-4">
          <legend className="sr-only">Rolle</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxField
              label={wording.ownRoleLabel}
              hint={wording.ownRoleHint}
              checked={form[ownRole]}
              onChange={(event) => set(ownRole, event.target.checked)}
              disabled={disabled}
            />
            <CheckboxField
              label={wording.otherRoleLabel}
              hint={wording.otherRoleHint}
              checked={form[otherRole]}
              onChange={(event) => set(otherRole, event.target.checked)}
              disabled={disabled}
            />
          </div>
        </fieldset>
      </Panel>

      <div className="grid gap-6 self-start">
        <Panel
          title="Kontakt"
          description="Gilt für den Eintrag als Ganzes; eine Adresse kann eigene Angaben tragen."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="E-Mail"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              disabled={disabled}
              maxLength={255}
            />
            <TextField
              label="Telefon"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              disabled={disabled}
              maxLength={30}
            />
            <TextField
              label="Website"
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
              disabled={disabled}
              maxLength={255}
              className="sm:col-span-2"
            />
          </div>
        </Panel>

        <Panel title="Konditionen">
          <div className="grid gap-4 sm:grid-cols-2">
            <PaymentTermSelect
              label="Zahlungskondition"
              tenantId={tenantId}
              value={form.paymentTerm}
              onChange={(code) => set('paymentTerm', code)}
              storedLabel={partner?.paymentTermLabel}
              emptyLabel="Vorgabe des Mandanten"
              disabled={disabled}
              hint="Bestimmt Fälligkeit und Skonto auf den Belegen dieses Partners."
            />
            <TextField
              label="Kreditlimite"
              value={form.creditLimit}
              onChange={(event) => set('creditLimit', event.target.value)}
              disabled={disabled}
              inputMode="decimal"
              numeric
            />
            {form.isSupplier && (
              <TextField
                label="Kreditorenreferenz"
                value={form.creditorReference}
                onChange={(event) => set('creditorReference', event.target.value)}
                disabled={disabled}
                maxLength={40}
                hint="Die Nummer, unter der dieser Lieferant uns führt. Steht auf unserer Zahlung."
                className="sm:col-span-2"
              />
            )}
          </div>
        </Panel>

        <Panel
          title="Notiz"
          description="Nur für das Backoffice. Erscheint auf keinem Beleg."
        >
          <TextAreaField
            label="Notiz"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            disabled={disabled}
            rows={5}
          />
        </Panel>
      </div>
    </>
  )
}
