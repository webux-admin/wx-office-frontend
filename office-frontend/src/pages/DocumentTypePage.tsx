import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FactList, type Fact } from '../components/FactList'
import { FormMask } from '../components/FormMask'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { originOf, type Origin } from '../lib/origin'
import { salesDocumentFor } from '../lib/salesDocument'
import type { DocumentCategory, DocumentType } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { CopyEditor } from './documenttype/CopyEditor'
import { PredecessorEditor } from './documenttype/PredecessorEditor'
import { PrintPanel } from './documenttype/PrintPanel'
import { StockPanel } from './documenttype/StockPanel'
import {
  COPY_PRICE_MODES,
  describeCopies,
  emptyDocumentType,
  firstComplaint,
  toForm,
  toPayload,
  type DocumentTypeForm,
} from './documenttype/documentTypeForm'

/** Where the mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/belegarten', label: 'Belegarten' }

type Register = 'allgemein' | 'druck' | 'vorgaenger'

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'allgemein', label: 'Allgemein' },
  { id: 'druck', label: 'Druck' },
  { id: 'vorgaenger', label: 'Vorgänger' },
]

/** Said by the lock icon on the two fields that are fixed once the kind exists. */
const FIXED = 'Nach dem Anlegen fest: Nummern und bestehende Belege hängen daran.'

/**
 * One kind of document: what it is called, how its number looks, what it prints on, how
 * often, and out of which other kind it may be written.
 *
 * <p>A full screen rather than a dialog. Built on {@link FormMask} like the partner, so
 * Escape, Ctrl+S and the question before throwing changes away behave the same (ADR-0050).
 */
export function DocumentTypePage() {
  return (
    <RequireTenant permission="DOCUMENT_TYPE_READ">
      {(tenantId) => <DocumentTypeLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function DocumentTypeLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()
  const creating = id === 'neu'

  const type = useQuery({
    queryKey: ['document-type', tenantId, id],
    queryFn: () => api.get<DocumentType>(`/api/tenants/${tenantId}/document-types/${id}`),
    enabled: !creating,
  })

  if (creating) return <DocumentTypeMask tenantId={tenantId} type={null} />
  if (type.isPending) return <LoadingBlock label="Belegart wird geladen" />
  if (type.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={type.error} />
      </div>
    )
  }
  return <DocumentTypeMask key={type.data.id} tenantId={tenantId} type={type.data} />
}

/**
 * Whether the mask holds something the user would lose by leaving.
 *
 * <p>A new mask ignores the form: the dropdown fills it with the standard form by itself, and
 * that is not a change anybody made.
 */
function changedFrom(form: DocumentTypeForm, start: DocumentTypeForm, creating: boolean) {
  const comparable = (value: DocumentTypeForm) =>
    JSON.stringify(creating ? { ...value, documentLayoutId: '' } : value)
  return comparable(form) !== comparable(start)
}

function DocumentTypeMask({ tenantId, type }: { tenantId: number; type: DocumentType | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('DOCUMENT_TYPE_WRITE')
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const creating = type === null

  const [start] = useState<DocumentTypeForm>(() =>
    type === null ? emptyDocumentType() : toForm(type),
  )
  const [form, setForm] = useState<DocumentTypeForm>(start)
  const [tab, setTab] = useState<Register>('allgemein')
  const [complaint, setComplaint] = useState<string | null>(null)
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)

  // Every kind of the tenant, for the predecessors and for the names in their list.
  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  const change = (patch: Partial<DocumentTypeForm>) =>
    setForm((current) => ({ ...current, ...patch }))

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['document-type', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form)
      return type === null
        ? api.post<DocumentType>(`/api/tenants/${tenantId}/document-types`, payload)
        : api.put<DocumentType>(`/api/tenants/${tenantId}/document-types/${type.id}`, payload)
    },
    onSuccess: () => {
      refresh()
      // The forms carry which kinds print on them, so that list is stale now too.
      void queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })
      void navigate(origin.from, { replace: true })
    },
  })

  const deactivate = useMutation({
    mutationFn: () =>
      api.delete<DocumentType>(`/api/tenants/${tenantId}/document-types/${type?.id}`),
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  // Its own request, not part of Save: the mark belongs to the category and moving it
  // changes another kind of document too. Saving this one must not do that as a side effect.
  const markDefault = useMutation({
    mutationFn: () =>
      api.put<DocumentType>(
        `/api/tenants/${tenantId}/document-types/${type?.id}/default`,
        {},
      ),
    onSuccess: refresh,
  })

  const submit = () => {
    const problem = firstComplaint(form, creating)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  const isDefault = type?.categoryDefault === true
  // The default of a category cannot be switched off while another kind could take over;
  // the backend refuses it, so the mask does not offer it.
  const mayDeactivate = mayWrite && type !== null && type.active && !isDefault

  return (
    <>
      <FormMask
        title={type === null ? 'Neue Belegart' : type.name}
        back={{ to: origin.from, label: origin.label }}
        dirty={changedFrom(form, start, creating)}
        onSubmit={mayWrite && !save.isPending ? submit : undefined}
        subtitle={
          type === null ? (
            'Kategorie und Code sind nach dem Speichern fest.'
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-small">{type.code}</span>
              {isDefault && <Badge tone="accent">Standard</Badge>}
              {!type.active && <Badge tone="muted">Deaktiviert</Badge>}
            </span>
          )
        }
        actions={
          <>
            {mayDeactivate && (
              <Button variant="secondary" onClick={() => setConfirmingDeactivate(true)}>
                Deaktivieren
              </Button>
            )}
            {mayWrite && (
              <Button onClick={submit} busy={save.isPending} shortcut>
                Speichern
              </Button>
            )}
          </>
        }
        summary={type === null ? undefined : <Summary tenantId={tenantId} type={type} />}
        tabs={{ items: REGISTERS, active: tab, onChange: setTab }}
      >
        <div className="grid gap-4">
          {(complaint !== null || save.error !== null) && (
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          )}
          {markDefault.error !== null && <ErrorNotice error={markDefault.error} />}

          {tab === 'allgemein' && (
            <>
              <Panel title="Allgemein">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CatalogueSelect
                    label="Kategorie"
                    tenantId={tenantId}
                    catalogue="document-category"
                    value={form.category}
                    onChange={(code) => change({ category: code as DocumentCategory })}
                    disabled={!mayWrite || !creating}
                    locked={creating ? undefined : FIXED}
                    tooltip={
                      creating
                        ? 'Offerte, Auftrag, Lieferschein, Rechnung oder Gutschrift.'
                        : undefined
                    }
                  />
                  <TextField
                    label="Code"
                    value={form.code}
                    onChange={(event) => change({ code: event.target.value })}
                    disabled={!mayWrite || !creating}
                    required={creating}
                    maxLength={20}
                    locked={creating ? undefined : FIXED}
                    tooltip={
                      creating
                        ? 'Kurzes Kürzel, zum Beispiel RE. Es bestimmt die Nummernreihe.'
                        : undefined
                    }
                  />
                  <TextField
                    label="Bezeichnung"
                    value={form.name}
                    onChange={(event) => change({ name: event.target.value })}
                    disabled={!mayWrite}
                    required
                    maxLength={60}
                    className="sm:col-span-2"
                  />
                  <TextField
                    label="Nummernpräfix"
                    value={form.numberPrefix}
                    onChange={(event) => change({ numberPrefix: event.target.value })}
                    disabled={!mayWrite}
                    maxLength={10}
                    tooltip="Steht vor der Nummer, zum Beispiel AU-2026-0001. Leer: der Code."
                  />
                  {/* Only the offer promises something with an expiry, so only its kinds
                      carry the preset. */}
                  {form.category === 'OFFER' && (
                    <TextField
                      label="Gültig für Tage"
                      value={form.offerValidityDays}
                      onChange={(event) => change({ offerValidityDays: event.target.value })}
                      disabled={!mayWrite}
                      inputMode="numeric"
                      numeric
                      tooltip="Setzt «Gültig bis» einer neuen Offerte: Belegdatum plus diese Tage. Leer: kein Vorschlag."
                    />
                  )}
                </div>
              </Panel>

              <StockPanel
                tenantId={tenantId}
                form={form}
                mayWrite={mayWrite}
                onChange={change}
              />

              {type !== null && (
                <Panel
                  title="Standard"
                  description={`Neue ${categoryLabel(form.category)}-Belege nehmen standardmässig diese Belegart.`}
                  action={
                    mayWrite && type.active && !isDefault ? (
                      <Button
                        variant="secondary"
                        busy={markDefault.isPending}
                        onClick={() => markDefault.mutate()}
                      >
                        Als Standard festlegen
                      </Button>
                    ) : undefined
                  }
                >
                  <p className="text-body text-text-secondary">
                    {isDefault
                      ? 'Das ist der Standard. Um das zu ändern, eine andere Belegart derselben Kategorie als Standard festlegen.'
                      : type.active
                        ? 'Standard ist eine andere Belegart. Diese festlegen, ersetzt sie.'
                        : 'Eine deaktivierte Belegart kann nicht Standard werden.'}
                  </p>
                </Panel>
              )}
            </>
          )}

          {tab === 'druck' && (
            <>
              <PrintPanel
                tenantId={tenantId}
                documentTypeId={type?.id}
                documentTypeName={form.name.trim() === '' ? 'Belegart' : form.name.trim()}
                value={form.documentLayoutId}
                onChange={(documentLayoutId) => change({ documentLayoutId })}
                disabled={!mayWrite}
              />
              <CopyEditor
                tenantId={tenantId}
                copies={form.copies}
                onChange={(copies) => change({ copies })}
                disabled={!mayWrite}
              />
            </>
          )}

          {tab === 'vorgaenger' && (
            <>
              <PredecessorEditor
                all={types.data ?? []}
                editingId={type?.id}
                chosen={form.predecessorTypeIds}
                onChange={(predecessorTypeIds) => change({ predecessorTypeIds })}
                disabled={!mayWrite}
              />
              <Panel title="Kopieren" description="Wenn jemand einen Beleg dieser Art kopiert.">
                <SelectField
                  label="Preise"
                  value={form.copyPriceMode}
                  disabled={!mayWrite}
                  onChange={(event) =>
                    change({
                      copyPriceMode: event.target.value as DocumentTypeForm['copyPriceMode'],
                    })
                  }
                  tooltip={`${COPY_PRICE_MODES.find((mode) => mode.value === form.copyPriceMode)?.hint ?? ''} Beim Kopieren lässt sich das noch ändern.`}
                >
                  {COPY_PRICE_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </SelectField>
              </Panel>
            </>
          )}
        </div>
      </FormMask>

      <ConfirmDialog
        open={confirmingDeactivate}
        title="Belegart deaktivieren?"
        confirmLabel="Deaktivieren"
        onConfirm={() => deactivate.mutate()}
        onCancel={() => setConfirmingDeactivate(false)}
        busy={deactivate.isPending}
        error={deactivate.error}
      >
        Es lassen sich keine neuen Belege dieser Art mehr anlegen. Bestehende Belege bleiben unverändert.
      </ConfirmDialog>
    </>
  )
}

/** The facts above the registers: what kind of document it is and how it prints. */
function Summary({ tenantId, type }: { tenantId: number; type: DocumentType }) {
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')

  const facts: Fact[] = [
    {
      label: 'Kategorie',
      value:
        salesDocumentFor(type.category) === undefined ? (
          <span className="flex items-center gap-2">
            {categoryLabel(type.category)}
            <Badge tone="neutral">Entsteht aus der Rechnung</Badge>
          </span>
        ) : (
          categoryLabel(type.category)
        ),
    },
    { label: 'Adresse', value: usageLabel(type.addressUsage) },
    { label: 'Druckvorlage', value: type.documentLayoutName },
    { label: 'Ausdruck', value: describeCopies(type.copies) },
  ]
  return <FactList facts={facts} />
}
