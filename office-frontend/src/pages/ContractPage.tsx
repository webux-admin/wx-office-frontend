import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { FormMask } from '../components/FormMask'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { Tabs } from '../components/Tabs'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useFieldErrors } from '../components/useFieldErrors'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import {
  CONTRACT_END_REASON_LABELS,
  CONTRACT_MODULE,
  CONTRACT_NOTE_MAX_LENGTH,
  CONTRACT_PATH,
  CONTRACT_RIGHTS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  CONTRACT_TITLE_MAX_LENGTH,
  NOTICE_UNIT_LABELS,
  agreementChanged,
  contractComplaints,
  contractCustomersUrl,
  contractStepUrl,
  contractUrl,
  contractsKey,
  contractsUrl,
  emptyContractForm,
  isAgreementEditable,
  isNoticePeriodUnit,
  toContractForm,
  toContractRequest,
  validFromComplaint,
  type ContractForm,
} from '../lib/contract'
import { isToldByFields } from '../lib/fieldErrors'
import { formatDate, formatDateTime } from '../lib/format'
import { originOf } from '../lib/origin'
import type { Contract, ContractCustomer } from '../lib/types'
import { ContractPositions } from './contract/ContractPositions'
import { ContractSlaValues } from './contract/ContractSlaValues'
import { ContractVersions } from './contract/ContractVersions'
import { EndContractDialog } from './contract/EndContractDialog'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import { partnerLabel, type CustomerHit, type CustomerSource } from './document/partnerSearch'

/** The fields of the head that can show a message of their own. */
const SHOWN_FIELDS = [
  'title',
  'partnerId',
  'startDate',
  'endDate',
  'noticePeriodAmount',
  'noticePeriodUnit',
  'note',
  'positions',
  'slaValues',
  'slaValues.metric',
  'slaValues.targetValue',
  'slaValues.unit',
  'slaValues.description',
  'validFrom',
] as const

/** Why the start of an active or ended contract takes no input. */
const START_FIXED =
  'Die Perioden des Abo-Laufs zählen ab dem Beginn. Für einen anderen Beginn den Vertrag beenden und einen neuen anlegen; das Ende bleibt änderbar.'

/** The two registers of a stored contract. */
type Register = 'contract' | 'versions'

/** One contract, new or stored: its customer, its term and what it bills how often. */
export function ContractPage() {
  return (
    <RequireTenant permission={CONTRACT_RIGHTS.read} module={CONTRACT_MODULE}>
      {(tenantId) => <ContractLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ContractLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()
  const creating = id === 'neu'

  const contract = useQuery({
    queryKey: [...contractsKey(tenantId), 'one', id],
    queryFn: () => api.get<Contract>(contractUrl(tenantId, id ?? '')),
    enabled: !creating && id !== undefined,
  })

  if (creating) return <ContractMask tenantId={tenantId} contract={null} />
  if (contract.isPending) return <LoadingBlock label="Vertrag wird geladen" />
  if (contract.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={contract.error} />
      </div>
    )
  }
  // Keyed by the record, so opening another contract resets the mask instead of carrying
  // values over.
  return <ContractMask key={contract.data.id} tenantId={tenantId} contract={contract.data} />
}

function ContractMask({ tenantId, contract }: { tenantId: number; contract: Contract | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, { from: CONTRACT_PATH, label: 'Verträge' })

  const initial = contract ? toContractForm(contract) : emptyContractForm()
  const [form, setForm] = useState<ContractForm>(initial)
  const [register, setRegister] = useState<Register>('contract')
  const [activating, setActivating] = useState(false)
  const [ending, setEnding] = useState(false)
  const mayWrite = can(CONTRACT_RIGHTS.write)
  const status = contract?.status ?? 'DRAFT'
  // An ended contract takes no new version: only its note stays open (backend ADR-0145).
  const editable = mayWrite && isAgreementEditable(status)
  const startFixed = status !== 'DRAFT'
  // Saving an active contract that changes what was agreed takes the next version, and that
  // one needs the day it holds from.
  const takesVersion = status === 'ACTIVE' && agreementChanged(initial, form)
  const set = <K extends keyof ContractForm>(field: K, value: ContractForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const save = useMutation({
    mutationFn: () => {
      const body = toContractRequest(
        takesVersion ? form : { ...form, validFrom: '' },
        contract?.lockVersion ?? null,
      )
      return contract
        ? api.put<Contract>(contractUrl(tenantId, contract.id), body)
        : api.post<Contract>(contractsUrl(tenantId), body)
    },
    // Saving finishes the mask and gives way to the list it came from. Replaced instead of
    // pushed: a saved mask is not a place to return to with the back button.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractsKey(tenantId) })
      void navigate(origin.from, { replace: true })
    },
  })

  // A step changes the status and nothing else: the mask stays open on the same contract, and
  // the query behind it brings the new status.
  const activate = useMutation({
    mutationFn: () =>
      api.post<Contract>(contractStepUrl(tenantId, contract?.id ?? 0, 'activate'), {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractsKey(tenantId) })
      setActivating(false)
    },
  })

  const fields = useFieldErrors(() => {
    const errors = { ...contractComplaints(form) }
    const day = takesVersion ? validFromComplaint(form) : null
    return day === null ? errors : { ...errors, validFrom: day }
  }, save.error)
  const submit = () => {
    if (fields.check()) save.mutate()
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  // The sums the backend sent hold only for the positions it sent them for.
  const positionsUnchanged = JSON.stringify(form.positions) === JSON.stringify(initial.positions)
  const told = save.error !== null && isToldByFields(save.error, SHOWN_FIELDS)

  return (
    <FormMask
      title={contract ? contract.title : 'Neuer Vertrag'}
      back={{ to: origin.from, label: origin.label }}
      subtitle={
        contract ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-small">{contract.contractNumber}</span>
            <Badge tone={CONTRACT_STATUS_TONES[status]}>{CONTRACT_STATUS_LABELS[status]}</Badge>
            {contract.currentVersionNo != null && (
              <span className="text-small text-text-secondary">
                Version {contract.currentVersionNo}
              </span>
            )}
            <span>
              {contract.customerName}
              {contract.customerTown ? `, ${contract.customerTown}` : ''}
            </span>
          </span>
        ) : (
          'Die Vertragsnummer wird beim Speichern vergeben.'
        )
      }
      actions={
        <>
          {contract && mayWrite && status === 'DRAFT' && (
            <Button
              variant="secondary"
              onClick={() => setActivating(true)}
              // A step takes the contract as stored; what is typed but not saved would be lost.
              disabled={dirty}
            >
              Aktivieren
            </Button>
          )}
          {contract && mayWrite && status === 'ACTIVE' && (
            <Button variant="secondary" onClick={() => setEnding(true)} disabled={dirty}>
              Beenden
            </Button>
          )}
          {mayWrite && (
            <Button onClick={submit} busy={save.isPending} shortcut>
              Speichern
            </Button>
          )}
        </>
      }
      dirty={dirty}
      onSubmit={mayWrite && !save.isPending ? submit : undefined}
    >
      <>
        {save.error !== null && !told && (
          <div className="mb-6" aria-live="polite">
            <ErrorNotice error={save.error} />
          </div>
        )}

        {contract && mayWrite && dirty && status !== 'ENDED' && (
          <p className="mb-6 text-small text-text-secondary">
            {status === 'DRAFT' ? 'Aktivieren' : 'Beenden'} geht erst, wenn die Änderungen
            gespeichert sind.
          </p>
        )}

        {contract && status === 'ACTIVE' && (
          <p className="mb-6 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-4 py-3 text-body text-text-secondary">
            Dieser Vertrag ist aktiv. Jede Änderung am Vereinbarten wird eine neue Version, gültig
            ab einem Tag, den Sie nennen; die bisherige bleibt unverändert. Die Notiz allein
            erzeugt keine Version.
          </p>
        )}

        {contract && status === 'ENDED' && (
          <p className="mb-6 rounded-[var(--radius-md)] border border-line-subtle bg-surface px-4 py-3 text-body text-text-secondary">
            Beendet, letzter Vertragstag {formatDate(contract.endedOn)}
            {contract.endReason ? ` (${CONTRACT_END_REASON_LABELS[contract.endReason]})` : ''}.
            Das Vereinbarte lässt sich nicht mehr ändern, nur noch die Notiz.
          </p>
        )}

        {contract && status !== 'DRAFT' && (
          <Tabs
            label="Register des Vertrags"
            active={register}
            onChange={setRegister}
            tabs={[
              { id: 'contract', label: 'Vertrag' },
              { id: 'versions', label: 'Versionen', count: contract.currentVersionNo ?? 0 },
            ]}
          />
        )}

        {contract && register === 'versions' ? (
          <ContractVersions tenantId={tenantId} contract={contract} />
        ) : (
          renderContractFields()
        )}

        {contract && status === 'DRAFT' && (
          <ConfirmDialog
            open={activating}
            title={`${contract.contractNumber} aktivieren?`}
            confirmLabel="Aktivieren"
            onConfirm={() => activate.mutate()}
            onCancel={() => {
              activate.reset()
              setActivating(false)
            }}
            busy={activate.isPending}
            error={activate.error}
          >
            Der Vertrag gilt damit als abgeschlossen und erhält Version 1, gültig ab Beginn am{' '}
            {formatDate(contract.startDate)}. Danach wird jede Änderung am Vereinbarten eine neue
            Version; gelöscht wird ein Vertrag nie, nur beendet.
          </ConfirmDialog>
        )}

        {contract && status === 'ACTIVE' && (
          <EndContractDialog
            tenantId={tenantId}
            contract={contract}
            open={ending}
            onClose={() => setEnding(false)}
            onEnded={() => {
              void queryClient.invalidateQueries({ queryKey: contractsKey(tenantId) })
              setEnding(false)
            }}
          />
        )}
      </>
    </FormMask>
  )

  /**
   * The fields of the contract, on the first register. A function and not a component, so the
   * fields are not mounted anew on every key stroke.
   */
  function renderContractFields() {
    return (
      <>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Vertrag">
            <div className="grid gap-4">
              <TextField
                label="Bezeichnung"
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                maxLength={CONTRACT_TITLE_MAX_LENGTH}
                disabled={!editable}
                required
                error={fields.errors.title}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Beginn"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => set('startDate', event.target.value)}
                  // Every billing period counts from the start, so it is fixed once the
                  // contract is active (backend ADR-0148). The end stays open.
                  disabled={!editable || startFixed}
                  required={!startFixed}
                  locked={startFixed ? START_FIXED : undefined}
                  hint={startFixed ? 'Steht fest seit der Aktivierung.' : undefined}
                  error={fields.errors.startDate}
                />
                <TextField
                  label="Ende"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => set('endDate', event.target.value)}
                  disabled={!editable}
                  error={fields.errors.endDate}
                  tooltip="Leer lassen für einen unbefristeten Vertrag."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Kündigungsfrist"
                  value={form.noticePeriodAmount}
                  onChange={(event) => set('noticePeriodAmount', event.target.value)}
                  inputMode="numeric"
                  numeric
                  disabled={!editable}
                  error={fields.errors.noticePeriodAmount}
                  tooltip="Leer lassen, wenn keine Frist vereinbart ist."
                />
                <SelectField
                  label="Einheit"
                  value={form.noticePeriodUnit}
                  onChange={(event) => {
                    const value = event.target.value
                    set('noticePeriodUnit', isNoticePeriodUnit(value) ? value : '')
                  }}
                  disabled={!editable}
                  error={fields.errors.noticePeriodUnit}
                >
                  <option value="">Keine</option>
                  {Object.entries(NOTICE_UNIT_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              </div>
              {takesVersion && (
                <TextField
                  label="Änderung gilt ab"
                  type="date"
                  value={form.validFrom}
                  onChange={(event) => set('validFrom', event.target.value)}
                  required
                  error={fields.errors.validFrom}
                  tooltip={`Das Vereinbarte ändert sich: gespeichert wird Version ${
                    (contract?.currentVersionNo ?? 0) + 1
                  }. Ab diesem Tag gilt sie; nicht vor der Version, der sie folgt.`}
                />
              )}
            </div>
          </Panel>

          <Panel title="Kunde">
            <div className="grid gap-4">
              <CustomerChoice
                tenantId={tenantId}
                partnerId={form.partnerId}
                knownName={contract?.customerName ?? null}
                disabled={!editable}
                error={fields.errors.partnerId}
                onChange={(partnerId) => set('partnerId', partnerId)}
              />
              <TextAreaField
                label="Notiz"
                value={form.note}
                onChange={(event) => set('note', event.target.value)}
                maxLength={CONTRACT_NOTE_MAX_LENGTH}
                rows={4}
                disabled={!mayWrite}
                error={fields.errors.note}
                tooltip="Intern. Gehört nicht zum Vereinbarten und steht auf keinem Beleg."
              />
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <ContractPositions
            tenantId={tenantId}
            positions={form.positions}
            totals={positionsUnchanged && contract ? contract.totals : null}
            onChange={(positions) => set('positions', positions)}
            editable={editable}
            partnerId={form.partnerId}
            dateOfSupply={form.startDate}
            mayReadProducts={can('PRODUCT_READ')}
            error={fields.errors.positions}
          />
        </div>

        <div className="mt-6">
          <ContractSlaValues
            values={form.slaValues}
            onChange={(slaValues) => set('slaValues', slaValues)}
            editable={editable}
            error={slaError()}
          />
        </div>

        {contract && (
          <p className="mt-6 text-small text-text-tertiary">
            Angelegt {formatDateTime(contract.createdAt)}
            {contract.createdBy ? ` von ${contract.createdBy}` : ''}
            {contract.changedAt ? ` · geändert ${formatDateTime(contract.changedAt)}` : ''}
            {contract.changedBy ? ` von ${contract.changedBy}` : ''}
          </p>
        )}

      </>
    )
  }

  /**
   * The first message about the service level values: one about the list, or one the backend
   * named at a single value, such as `slaValues[1].targetValue`. Its sentence names the value.
   */
  function slaError(): string | undefined {
    const entry = Object.entries(fields.errors).find(([field]) => field.startsWith('slaValues'))
    return entry?.[1]
  }
}

/**
 * The customers the contract form may choose from: the lookup of the contract module, so
 * maintaining contracts needs no partner right.
 *
 * @param tenantId the tenant
 * @returns at most twenty active customers per term, by name
 */
function contractCustomerSource(tenantId: number): CustomerSource<CustomerHit> {
  return {
    key: [...contractsKey(tenantId), 'customers'],
    load: async (term) => {
      const found = await api.get<ContractCustomer[]>(contractCustomersUrl(tenantId, term))
      return found.map((customer) => ({
        id: customer.partnerId,
        partnerNumber: customer.partnerNumber,
        name: customer.name,
      }))
    },
  }
}

/**
 * The customer of the contract: one field that searches as it is typed into and takes a hit
 * over, the same type-ahead the documents and projects use.
 *
 * <p>Typing gives the chosen customer up, so the field never shows one name while the
 * contract holds another.
 */
function CustomerChoice({
  tenantId,
  partnerId,
  knownName,
  disabled,
  error,
  onChange,
}: {
  tenantId: number
  partnerId: string
  knownName: string | null
  disabled: boolean
  error?: string
  onChange: (partnerId: string) => void
}) {
  const [term, setTerm] = useState(
    partnerId === '' ? '' : (knownName ?? `Kunde ${partnerId}`),
  )

  return (
    <div className="grid gap-1">
      <PartnerQuickSearch
        source={contractCustomerSource(tenantId)}
        term={term}
        onTerm={(next) => {
          setTerm(next)
          if (partnerId !== '') onChange('')
        }}
        chosen={partnerId !== ''}
        onChoose={(customer) => {
          setTerm(partnerLabel(customer))
          onChange(String(customer.id))
        }}
        chosenHint="Name und Ort werden beim Speichern an den Vertrag kopiert. Tippen sucht einen anderen Kunden."
        emptyHint="Es gibt noch keinen aktiven Kunden. Ein Vertrag braucht einen."
        disabled={disabled}
      />
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
