import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FactList, type Fact } from '../components/FactList'
import { FormMask } from '../components/FormMask'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { Panel } from '../components/Panel'
import { SegmentedControl } from '../components/SegmentedControl'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { Tooltip } from '../components/Tooltip'
import { useChangeTracker } from '../components/useChangeTracker'
import { useFieldErrors } from '../components/useFieldErrors'
import { useAuth } from '../auth/useAuth'
import { CUSTOMER_CREDIT_PATH, CUSTOMER_CREDIT_RIGHTS } from '../lib/customerCredit'
import { DUNNING_MODULE, DUNNING_RIGHTS } from '../lib/dunning'
import {
  isToldByFields,
  nestedErrors,
  prefixedErrors,
  type FieldErrors,
} from '../lib/fieldErrors'
import { formatAmount } from '../lib/format'
import { defaultCodeOf } from '../lib/masterData'
import { runsModule } from '../lib/modules'
import { PROJECT_MODULE, PROJECT_RIGHTS } from '../lib/project'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { originOf } from '../lib/origin'
import type { Partner, PartnerContact, PartnerType } from '../lib/types'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { useCatalogue, useMasterDataEntries } from '../masterdata/useMasterData'
import { AddressFields } from './partner/AddressFields'
import { NewContacts } from './partner/NewContacts'
import { DefaultAddressPanel } from './partner/DefaultAddressPanel'
import { PartnerConditionFields } from './partner/PartnerConditionFields'
import { PartnerRoleFields } from './partner/PartnerRoleFields'
import { PartnerAddresses } from './partner/PartnerAddresses'
import { PartnerContacts } from './partner/PartnerContacts'
import { PartnerPayerAccounts } from './partner/PartnerPayerAccounts'
import { PartnerDocumentTypes } from './partner/PartnerDocumentTypes'
import { PartnerDunningPanel } from './partner/PartnerDunningPanel'
import { PartnerHistory } from './partner/PartnerHistory'
import { PartnerPrices } from './partner/PartnerPrices'
import { PartnerProjects } from './partner/PartnerProjects'
import { usePartnerCredit } from './partner/usePartnerCredit'
import {
  addressComplaints,
  emptyAddress,
  toAddressPayload,
  type AddressForm,
} from './partner/addressForm'
import {
  displayNameOf,
  emptyPartner,
  partnerComplaints,
  toForm,
  toPayload,
  type PartnerForm,
} from './partner/partnerForm'
import { wordingFor, type PartnerRole, type RoleWording } from './partner/role'
import { invalidateAfterPartnerChange } from './partner/partnerRefresh'

type Tab =
  | 'stammdaten'
  | 'adressen'
  | 'kontakte'
  | 'preise'
  | 'einstellungen'
  | 'projekte'
  | 'verlauf'

/** The fields of the create mask that can show a message of their own. */
const CREATE_FIELDS = [
  'name',
  'legalForm',
  'uid',
  'salutation',
  'firstName',
  'lastName',
  'email',
  'phone',
  'website',
  'addresses.street',
  'addresses.buildingNumber',
  'addresses.postalCode',
  'addresses.town',
  'addresses.country',
  'paymentTerm',
  'currency',
  'language',
  'creditLimit',
  'creditorReference',
  'commercialRegisterName',
  'roles',
  'notes',
] as const

/** The fields of the register «Stammdaten» that can show a message of their own. */
const EDIT_FIELDS = [
  'partnerNumber',
  'partnerType',
  'name',
  'legalForm',
  'salutation',
  'firstName',
  'lastName',
  'uid',
  'commercialRegisterName',
  'language',
  'email',
  'phone',
  'website',
  'paymentTerm',
  'currency',
  'creditLimit',
  'creditorReference',
  'notes',
  'roles',
] as const

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

  if (creating) return <PartnerCreateMask tenantId={tenantId} wording={wording} />
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
    <PartnerEditMask
      key={partner.data.id}
      tenantId={tenantId}
      partner={partner.data}
      wording={wording}
    />
  )
}

/** Where the mask was opened from, and its way back there. */
function useOrigin(wording: RoleWording) {
  return originOf(useLocation().state, { from: wording.path, label: wording.backLabel })
}

/** The messages that stand at no field of the mask, from its own checks. */
function unshownMessages(own: FieldErrors, shown: readonly string[]): string[] {
  return Object.entries(own)
    .filter(([field]) => !shown.includes(field))
    .map(([, message]) => message)
}

/**
 * The notice above the form for what no field can tell: a rule about the record as a whole,
 * or a field this mask does not show.
 */
function FormNotice({
  error,
  own,
  shown,
}: {
  error: unknown
  own: FieldErrors
  shown: readonly string[]
}) {
  const messages = unshownMessages(own, shown)
  const serverUntold = error !== null && error !== undefined && !isToldByFields(error, shown)
  if (messages.length === 0 && !serverUntold) return null
  return (
    <div className="mb-6 grid gap-3" aria-live="polite">
      {messages.length > 0 && <ErrorNotice error={new Error(messages.join(' '))} />}
      {serverUntold && <ErrorNotice error={error} />}
    </div>
  )
}

/**
 * Creating a customer or supplier, on one page.
 *
 * <p>Left, what one types: kind, name, legal form and UID, the postal address (postcode and
 * town required) and how to reach them. Right, what starts from the tenant's defaults and only
 * needs a look when something differs: the terms, then the further details. Below, the contact
 * persons. The recipient of the address is the name of the record, and the address becomes the
 * default one. Contacts go with the record in the same request. Saving closes the mask and goes
 * back to the list (ADR-0003).
 */
function PartnerCreateMask({ tenantId, wording }: { tenantId: number; wording: RoleWording }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = useOrigin(wording)
  const { changed, track } = useChangeTracker()

  const [form, setForm] = useState<PartnerForm>(() => emptyPartner(wording.role))
  const [address, setAddress] = useState<AddressForm>(() => emptyAddress('', true))
  const [contacts, setContacts] = useState<PartnerContact[]>([])
  const set = <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const kinds = useCatalogue(tenantId, 'partner-type')
  const languages = useMasterDataEntries(tenantId, 'languages')
  // The dropdown fills in the tenant's language once the list is there; until then the
  // default stands in, so a quick save does not trip over a list still loading.
  const complete: PartnerForm = { ...form, language: form.language || defaultCodeOf(languages) }
  const fullAddress: AddressForm = { ...address, name: displayNameOf(form) }

  const mayWrite = can('PARTNER_WRITE')
  const base = `/api/tenants/${tenantId}/partners`

  const save = useMutation({
    mutationFn: () =>
      api.post<Partner>(base, {
        ...toPayload(complete),
        addresses: [toAddressPayload(fullAddress)],
        contacts: contacts.length > 0 ? contacts : undefined,
      }),
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // The entry is replaced instead of pushed: a mask that has been saved is not a place to
    // return to with the back button.
    onSuccess: () => {
      invalidateAfterPartnerChange(queryClient, tenantId)
      void navigate(origin.from, { replace: true })
    },
  })

  const { errors, own, check } = useFieldErrors(() => {
    // The recipient is the name of the record, which has a message of its own.
    const postal = Object.fromEntries(
      Object.entries(addressComplaints(fullAddress)).filter(([field]) => field !== 'name'),
    )
    return { ...partnerComplaints(complete, wording), ...prefixedErrors(postal, 'addresses.') }
  }, save.error)

  const submit = () => {
    if (check()) save.mutate()
  }

  const person = form.partnerType === 'PERSON'

  return (
    <FormMask
      title={wording.newTitle}
      subtitle={wording.newSubtitle}
      back={{ to: origin.from, label: origin.label }}
      // A contact is entered in a dialog, which the tracker leaves out, so it counts here.
      dirty={changed || contacts.length > 0}
      onSubmit={mayWrite && !save.isPending ? submit : undefined}
      actions={
        mayWrite && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )
      }
    >
      <FormNotice error={save.error} own={own} shown={CREATE_FIELDS} />

      <div {...track} className="grid gap-6">
        <div className="grid gap-6 lg:grid-cols-5">
          <Panel title="Stammdaten" className="lg:col-span-3">
            <div className="grid gap-5">
              {kinds.length > 0 && (
                <SegmentedControl
                  label="Art"
                  options={kinds.map((kind) => ({
                    value: kind.code as PartnerType,
                    label: kind.name,
                  }))}
                  value={form.partnerType}
                  onChange={(kind) => set('partnerType', kind)}
                  disabled={!mayWrite}
                />
              )}

              {person ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  <MasterDataSelect
                    label="Anrede"
                    tenantId={tenantId}
                    list="salutations"
                    value={form.salutation}
                    onChange={(code) => set('salutation', code)}
                    disabled={!mayWrite}
                    emptyLabel="Ohne Anrede"
                    error={errors.salutation}
                  />
                  <TextField
                    label="Vorname"
                    value={form.firstName}
                    onChange={(event) => set('firstName', event.target.value)}
                    disabled={!mayWrite}
                    maxLength={60}
                    autoFocus
                    error={errors.firstName}
                  />
                  <TextField
                    label="Nachname"
                    value={form.lastName}
                    onChange={(event) => set('lastName', event.target.value)}
                    disabled={!mayWrite}
                    maxLength={60}
                    required
                    error={errors.lastName}
                    className="sm:col-span-2"
                  />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Firmenname"
                    value={form.name}
                    onChange={(event) => set('name', event.target.value)}
                    disabled={!mayWrite}
                    maxLength={70}
                    required
                    autoFocus
                    error={errors.name}
                    className="sm:col-span-2"
                  />
                  <MasterDataSelect
                    label="Rechtsform"
                    tenantId={tenantId}
                    list="legal-forms"
                    value={form.legalForm}
                    onChange={(code) => set('legalForm', code)}
                    disabled={!mayWrite}
                    emptyLabel="Bitte wählen"
                    required
                    error={errors.legalForm}
                  />
                  <TextField
                    label="UID"
                    value={form.uid}
                    onChange={(event) => set('uid', event.target.value)}
                    disabled={!mayWrite}
                    maxLength={20}
                    placeholder="CHE-123.456.789"
                    error={errors.uid}
                  />
                </div>
              )}

              <fieldset className="border-t border-line-subtle pt-4">
                <legend className="mb-3 flex items-center gap-1 text-small font-medium text-text-secondary">
                  Adresse
                  <Tooltip text={wording.addressTooltip} label="Hinweis zur Adresse" />
                </legend>
                <AddressFields
                  tenantId={tenantId}
                  form={address}
                  onChange={setAddress}
                  disabled={!mayWrite}
                  errors={nestedErrors(errors, 'addresses.')}
                  variant="postal"
                />
              </fieldset>

              <div className="grid gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2">
                <TextField
                  label="E-Mail"
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                  disabled={!mayWrite}
                  maxLength={255}
                  error={errors.email}
                />
                <TextField
                  label="Telefon"
                  type="tel"
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  disabled={!mayWrite}
                  maxLength={30}
                  error={errors.phone}
                />
                <TextField
                  label="Website"
                  type="url"
                  value={form.website}
                  onChange={(event) => set('website', event.target.value)}
                  disabled={!mayWrite}
                  maxLength={255}
                  error={errors.website}
                  className="sm:col-span-2"
                />
              </div>
            </div>
          </Panel>

          <div className="grid gap-6 self-start lg:col-span-2">
            <Panel title="Konditionen">
              <PartnerConditionFields
                tenantId={tenantId}
                form={form}
                set={set}
                disabled={!mayWrite}
                errors={errors}
              />
            </Panel>

            <Panel title="Weitere Angaben">
              <div className="grid gap-5">
                {!person && (
                  <TextField
                    label="Handelsregistername"
                    value={form.commercialRegisterName}
                    onChange={(event) => set('commercialRegisterName', event.target.value)}
                    disabled={!mayWrite}
                    maxLength={140}
                    error={errors.commercialRegisterName}
                    tooltip="Nur ausfüllen, wenn der Eintrag im Handelsregister anders lautet als der Firmenname."
                  />
                )}
                <PartnerRoleFields
                  form={form}
                  set={set}
                  disabled={!mayWrite}
                  wording={wording}
                  errors={errors}
                />
                <TextAreaField
                  label="Interne Notiz"
                  value={form.notes}
                  onChange={(event) => set('notes', event.target.value)}
                  disabled={!mayWrite}
                  rows={3}
                  error={errors.notes}
                  tooltip="Nur für das Backoffice, erscheint auf keinem Beleg."
                />
              </div>
            </Panel>
          </div>
        </div>

        <Panel title="Kontaktpersonen">
          <NewContacts
            tenantId={tenantId}
            contacts={contacts}
            onChange={setContacts}
            disabled={!mayWrite}
          />
        </Panel>
      </div>
    </FormMask>
  )
}

/**
 * A stored customer or supplier, with everything that belongs to it.
 *
 * <p>The header answers the usual look-up — address, contact, phone, balance — without a click.
 * The register «Stammdaten» holds the record itself; saving works from every register, since
 * the record is the same whichever is open, and like every save it closes the mask (ADR-0003).
 */
function PartnerEditMask({
  tenantId,
  partner,
  wording,
}: {
  tenantId: number
  partner: Partner
  wording: RoleWording
}) {
  const { can, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = useOrigin(wording)
  const { changed, track } = useChangeTracker()

  const [form, setForm] = useState<PartnerForm>(() => toForm(partner))
  const [tab, setTab] = useState<Tab>('stammdaten')
  const [confirming, setConfirming] = useState<'deactivate' | 'reactivate' | null>(null)

  const mayWrite = can('PARTNER_WRITE')
  const mayDeactivate = mayWrite && can('PARTNER_DEACTIVATE')
  const active = partner.active !== false
  const set = <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const refresh = () => invalidateAfterPartnerChange(queryClient, tenantId)
  const base = `/api/tenants/${tenantId}/partners/${partner.id}`

  const save = useMutation({
    mutationFn: () => api.put<Partner>(base, toPayload(form)),
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const switchActive = useMutation({
    mutationFn: (step: 'deactivate' | 'reactivate') =>
      step === 'deactivate'
        ? api.delete<Partner>(base)
        : api.put<Partner>(`${base}/reactivate`),
    onSuccess: () => {
      refresh()
      setConfirming(null)
    },
  })

  const { errors, own, check } = useFieldErrors(
    () => partnerComplaints(form, wording),
    save.error,
  )

  const submit = () => {
    if (check()) {
      save.mutate()
      return
    }
    // The message stands at a field of the record; that register has to be open to show it.
    setTab('stammdaten')
  }

  const openConfirm = (step: 'deactivate' | 'reactivate') => {
    switchActive.reset()
    setConfirming(step)
  }

  // Sales documents belong to a customer. A supplier gets purchase documents, which do not
  // exist yet, so the sales registers stay away from it.
  const sellsToPartner = partner.isCustomer === true

  const showsProjects =
    wording.role === 'customer' &&
    can(PROJECT_RIGHTS.read) &&
    runsModule(user?.tenants, tenantId, PROJECT_MODULE)

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'stammdaten', label: 'Stammdaten' },
    { id: 'adressen', label: 'Adressen', count: partner.addresses?.length ?? 0 },
    { id: 'kontakte', label: 'Kontaktpersonen', count: partner.contacts?.length ?? 0 },
    // Pricing is agreed with a buyer; a supplier has no price list of ours.
    ...(wording.role === 'customer' && can('PRODUCT_READ')
      ? [{ id: 'preise' as Tab, label: 'Preise' }]
      : []),
    // What this one partner does differently: document types, dunning, learned payer IBANs.
    { id: 'einstellungen', label: 'Einstellungen' },
    // A project always belongs to a customer, never to a supplier (backend ADR-0129), and the
    // register needs the module switched on: without it there is no project list to read.
    ...(showsProjects ? [{ id: 'projekte' as Tab, label: 'Projekte' }] : []),
    // Last on purpose: the history is what happened, and one looks it up rather than works
    // in it. Only for a partner we sell to: it lists sales documents, and a supplier has none.
    ...(sellsToPartner ? [{ id: 'verlauf' as Tab, label: 'Verlauf' }] : []),
  ]

  return (
    <>
      <FormMask
        title={partner.name}
        back={{ to: origin.from, label: origin.label }}
        dirty={changed}
        onSubmit={mayWrite && !save.isPending ? submit : undefined}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono text-small">{partner.partnerNumber ?? 'ohne Nummer'}</span>
            {partner.isCustomer && partner.isSupplier && (
              <Badge tone="neutral">{wording.alsoBadge}</Badge>
            )}
            {!active && <Badge tone="muted">Deaktiviert</Badge>}
          </span>
        }
        actions={
          <>
            {mayDeactivate && (
              <Button
                variant="secondary"
                onClick={() => openConfirm(active ? 'deactivate' : 'reactivate')}
              >
                {active ? 'Deaktivieren' : 'Reaktivieren'}
              </Button>
            )}
            {mayWrite && (
              <Button onClick={submit} busy={save.isPending} shortcut>
                Speichern
              </Button>
            )}
          </>
        }
        summary={<PartnerSummary tenantId={tenantId} partner={partner} wording={wording} />}
        tabs={{ items: tabs, active: tab, onChange: setTab }}
      >
        {tab === 'stammdaten' && (
          <>
            <FormNotice error={save.error} own={own} shown={EDIT_FIELDS} />
            <div {...track}>
              <BaseData
                tenantId={tenantId}
                partner={partner}
                form={form}
                set={set}
                disabled={!mayWrite}
                wording={wording}
                errors={errors}
              />
            </div>
          </>
        )}

        {tab === 'adressen' && (
          <PartnerAddresses
            tenantId={tenantId}
            partnerId={partner.id}
            partnerName={partner.name}
            addresses={partner.addresses ?? []}
            mayWrite={mayWrite}
          />
        )}

        {tab === 'kontakte' && (
          <PartnerContacts
            tenantId={tenantId}
            partnerId={partner.id}
            contacts={partner.contacts ?? []}
            mayWrite={mayWrite}
          />
        )}

        {tab === 'preise' && <PartnerPrices tenantId={tenantId} partnerId={partner.id} />}

        {tab === 'einstellungen' && (
          <PartnerSettings tenantId={tenantId} partner={partner} sellsToPartner={sellsToPartner} />
        )}

        {tab === 'projekte' && showsProjects && (
          <PartnerProjects tenantId={tenantId} partnerId={partner.id} />
        )}

        {/* No permission check: the server narrows the rows to what the reader may see and
            answers with an empty page when that is nothing. */}
        {tab === 'verlauf' && sellsToPartner && (
          <PartnerHistory tenantId={tenantId} partnerId={partner.id} role={wording.role} />
        )}
      </FormMask>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'reactivate' ? wording.reactivateTitle : wording.deactivateTitle}
        confirmLabel={confirming === 'reactivate' ? 'Reaktivieren' : 'Deaktivieren'}
        onConfirm={() => confirming !== null && switchActive.mutate(confirming)}
        onCancel={() => setConfirming(null)}
        busy={switchActive.isPending}
        error={switchActive.error}
      >
        {confirming === 'reactivate' ? wording.reactivateBody : wording.deactivateBody}
      </ConfirmDialog>
    </>
  )
}

/**
 * The facts above the registers: the default address, the main contact, how to reach the
 * record and, for a customer, the money lying with us.
 */
function PartnerSummary({
  tenantId,
  partner,
  wording,
}: {
  tenantId: number
  partner: Partner
  wording: RoleWording
}) {
  const { can } = useAuth()
  const credit = usePartnerCredit(
    tenantId,
    partner.id,
    wording.role === 'customer' && can(CUSTOMER_CREDIT_RIGHTS.read),
  )

  const address =
    partner.addresses?.find((entry) => entry.useAsDefault) ?? partner.addresses?.[0]
  const contact = partner.contacts?.find((entry) => entry.isPrimary)

  const facts: Fact[] = [
    {
      label: 'Adresse',
      value: address
        ? [
            [address.street, address.buildingNumber].filter(Boolean).join(' '),
            `${address.postalCode} ${address.town}`,
          ]
            .filter(Boolean)
            .join(', ')
        : undefined,
    },
    {
      label: 'Hauptkontakt',
      value: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(' ')
        : undefined,
    },
    {
      label: 'Telefon',
      value: partner.phone ? (
        <a className="hover:text-accent-text" href={`tel:${partner.phone}`}>
          {partner.phone}
        </a>
      ) : undefined,
    },
    {
      label: 'E-Mail',
      value: partner.email ? (
        <a className="hover:text-accent-text" href={`mailto:${partner.email}`}>
          {partner.email}
        </a>
      ) : undefined,
    },
    {
      label: 'Guthaben',
      value:
        credit.length > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono tabular-nums">
              {credit.map((row) => `${formatAmount(row.balance)} ${row.currency}`).join(', ')}
            </span>
            <Tooltip
              text="Wird nicht gegen offene Rechnungen verrechnet, dazu braucht es eine Verrechnungserklärung (OR Art. 120 ff.)."
              label="Hinweis zum Guthaben"
            />
            <Link className="text-small underline" to={CUSTOMER_CREDIT_PATH}>
              Zum Guthaben
            </Link>
          </span>
        ) : undefined,
    },
  ]

  return <FactList facts={facts} />
}

/**
 * What this one partner does differently from the rest: its own document types, its dunning
 * settings and the payer accounts learned from its payments. The sales parts (document types,
 * dunning) are left out for a partner we do not sell to.
 */
function PartnerSettings({
  tenantId,
  partner,
  sellsToPartner,
}: {
  tenantId: number
  partner: Partner
  sellsToPartner: boolean
}) {
  const { can, user } = useAuth()
  const showsDunning =
    sellsToPartner && can(DUNNING_RIGHTS.read) && runsModule(user?.tenants, tenantId, DUNNING_MODULE)

  return (
    <div className="grid gap-6">
      {/* Needs the right on the catalogue: the data are kinds of document, not partner data
          (ADR-0054 of the backend). */}
      {sellsToPartner && can('DOCUMENT_TYPE_READ') && (
        <PartnerDocumentTypes
          tenantId={tenantId}
          partnerId={partner.id}
          mayWrite={can('DOCUMENT_TYPE_WRITE')}
        />
      )}

      {/* Only where the tenant runs the module — a panel for a module nobody switched on would
          answer 409 (backend ADR-0092). */}
      {showsDunning && (
        <PartnerDunningPanel
          tenantId={tenantId}
          partnerId={partner.id}
          partnerName={partner.name}
          mayWrite={can(DUNNING_RIGHTS.configure)}
          mayBlock={can(DUNNING_RIGHTS.write)}
        />
      )}

      {/* Shown so it can be removed: a learned payer IBAN is a personal datum on the master
          record. revDSG Art. 25 needs a place that shows it, and Art. 6 Abs. 4 a button that
          erases it. The component decides for itself whether there is anything to show
          (backend ADR-0108). */}
      <PartnerPayerAccounts tenantId={tenantId} partnerId={partner.id} />
    </div>
  )
}

/**
 * The fields of the stored record, with its default address beside them.
 *
 * <p>Everything here can be changed, the kind and the name included: a record entered as the
 * wrong kind or with a typo is corrected, not entered again (backend ADR-0133). Documents
 * already issued keep the name they were written to. The default address is shown, not
 * edited in place: it is saved through its own dialog.
 */
function BaseData({
  tenantId,
  partner,
  form,
  set,
  disabled,
  wording,
  errors,
}: {
  tenantId: number
  /** The stored record, for the labels of values its lists no longer offer. */
  partner: Partner
  form: PartnerForm
  set: <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) => void
  /** True when the user holds no write permission; then nothing on the mask is editable. */
  disabled: boolean
  wording: RoleWording
  errors: FieldErrors
}) {
  const person = form.partnerType === 'PERSON'
  const kinds = useCatalogue(tenantId, 'partner-type')

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid gap-6 self-start">
        <Panel title="Identität">
          <div className="grid gap-4 sm:grid-cols-2">
            {kinds.length > 0 && (
              <SegmentedControl
                label="Art"
                options={kinds.map((kind) => ({
                  value: kind.code as PartnerType,
                  label: kind.name,
                }))}
                value={form.partnerType}
                onChange={(kind) => set('partnerType', kind)}
                disabled={disabled}
              />
            )}
            <TextField
              label={wording.numberLabel}
              value={form.partnerNumber}
              onChange={(event) => set('partnerNumber', event.target.value)}
              disabled={disabled}
              maxLength={20}
              error={errors.partnerNumber}
              tooltip="Lässt sich durch eine andere ersetzen, die im Mandanten noch frei ist."
            />

            {person ? (
              <>
                <MasterDataSelect
                  label="Anrede"
                  tenantId={tenantId}
                  list="salutations"
                  value={form.salutation}
                  storedLabel={partner.salutationLabel}
                  onChange={(code) => set('salutation', code)}
                  disabled={disabled}
                  emptyLabel="Ohne Anrede"
                  error={errors.salutation}
                />
                <TextField
                  label="Vorname"
                  value={form.firstName}
                  onChange={(event) => set('firstName', event.target.value)}
                  disabled={disabled}
                  maxLength={60}
                  error={errors.firstName}
                />
                <TextField
                  label="Nachname"
                  value={form.lastName}
                  onChange={(event) => set('lastName', event.target.value)}
                  disabled={disabled}
                  maxLength={60}
                  required
                  error={errors.lastName}
                  className="sm:col-span-2"
                />
              </>
            ) : (
              <>
                <TextField
                  label="Firmenname"
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  disabled={disabled}
                  maxLength={70}
                  required
                  error={errors.name}
                  className="sm:col-span-2"
                  tooltip="Neue Belege tragen den neuen Namen, bereits ausgestellte behalten den alten."
                />
                <MasterDataSelect
                  label="Rechtsform"
                  tenantId={tenantId}
                  list="legal-forms"
                  value={form.legalForm}
                  storedLabel={partner.legalFormLabel}
                  onChange={(code) => set('legalForm', code)}
                  disabled={disabled}
                  emptyLabel="Bitte wählen"
                  required
                  error={errors.legalForm}
                />
                <TextField
                  label="UID"
                  value={form.uid}
                  onChange={(event) => set('uid', event.target.value)}
                  disabled={disabled}
                  maxLength={20}
                  placeholder="CHE-123.456.789"
                  error={errors.uid}
                />
                <TextField
                  label="Handelsregistername"
                  value={form.commercialRegisterName}
                  onChange={(event) => set('commercialRegisterName', event.target.value)}
                  disabled={disabled}
                  maxLength={140}
                  error={errors.commercialRegisterName}
                  tooltip="Nur ausfüllen, wenn der Eintrag im Handelsregister anders lautet als der Firmenname."
                  className="sm:col-span-2"
                />
              </>
            )}
          </div>

          <PartnerRoleFields
            form={form}
            set={set}
            disabled={disabled}
            wording={wording}
            errors={errors}
            className="mt-5 border-t border-line-subtle pt-4"
          />
        </Panel>

        <DefaultAddressPanel tenantId={tenantId} partner={partner} mayWrite={!disabled} />
      </div>

      <div className="grid gap-6 self-start">
        <Panel title="Kontakt">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="E-Mail"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              disabled={disabled}
              maxLength={255}
              error={errors.email}
            />
            <TextField
              label="Telefon"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              disabled={disabled}
              maxLength={30}
              error={errors.phone}
            />
            <TextField
              label="Website"
              type="url"
              value={form.website}
              onChange={(event) => set('website', event.target.value)}
              disabled={disabled}
              maxLength={255}
              error={errors.website}
              className="sm:col-span-2"
            />
          </div>
        </Panel>

        <Panel title="Konditionen">
          <PartnerConditionFields
            tenantId={tenantId}
            form={form}
            set={set}
            disabled={disabled}
            errors={errors}
            stored={partner}
          />
        </Panel>

        <Panel>
          <TextAreaField
            label="Interne Notiz"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            disabled={disabled}
            rows={4}
            error={errors.notes}
            tooltip="Nur für das Backoffice, erscheint auf keinem Beleg."
          />
        </Panel>
      </div>
    </div>
  )
}
