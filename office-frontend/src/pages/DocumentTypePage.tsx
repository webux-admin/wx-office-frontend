import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { Tabs } from '../components/Tabs'
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
import {
  COPY_PRICE_MODES,
  emptyDocumentType,
  firstComplaint,
  toForm,
  toPayload,
  type DocumentTypeForm,
} from './documenttype/documentTypeForm'

/** Where the mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/belegarten', label: 'Belegarten' }

type Register = 'hauptdaten' | 'druck' | 'uebernahme'

const REGISTERS: { id: Register; label: string }[] = [
  { id: 'hauptdaten', label: 'Hauptdaten' },
  { id: 'druck', label: 'Druck' },
  { id: 'uebernahme', label: 'Übernahme' },
]

/**
 * One kind of document: what it is called, how its number looks, what it prints on, how
 * often, and out of which other kind it may be written.
 *
 * <p>A full screen rather than a dialog. Eight groups of settings with two hand-sorted lists
 * do not fit a window that has to stay small enough to see the page behind it.
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

function DocumentTypeMask({ tenantId, type }: { tenantId: number; type: DocumentType | null }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('DOCUMENT_TYPE_WRITE')
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')

  const [form, setForm] = useState<DocumentTypeForm>(
    type === null ? emptyDocumentType() : toForm(type),
  )
  const [tab, setTab] = useState<Register>('hauptdaten')
  const [complaint, setComplaint] = useState<string | null>(null)

  // Every kind of the tenant, for the predecessors and for the names in their list.
  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  const change = (patch: Partial<DocumentTypeForm>) =>
    setForm((current) => ({ ...current, ...patch }))

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form)
      return type === null
        ? api.post<DocumentType>(`/api/tenants/${tenantId}/document-types`, payload)
        : api.put<DocumentType>(`/api/tenants/${tenantId}/document-types/${type.id}`, payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-type', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
      // The forms carry which kinds print on them, so that list is stale now too.
      void queryClient.invalidateQueries({ queryKey: ['print-layouts', tenantId] })
      void navigate(origin.from, { replace: true })
    },
  })

  const deactivate = useMutation({
    mutationFn: () =>
      api.delete<DocumentType>(`/api/tenants/${tenantId}/document-types/${type?.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-type', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-type', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })
    },
  })

  const submit = () => {
    const problem = firstComplaint(form, type === null)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  // Ctrl+S and Ctrl+Enter do what the primary button does, so a mask can be
  // filled in and finished without reaching for the mouse.
  useSubmitShortcut(mayWrite && !save.isPending ? submit : undefined)

  return (
    <>
      <PageHeader
        title={type === null ? 'Neue Belegart' : type.name}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {type !== null && (
              <span className="font-mono text-[12px] text-text-secondary">{type.code}</span>
            )}
            <span>{categoryLabel(form.category)}</span>
            {type?.categoryDefault === true && <Badge tone="accent">Standard</Badge>}
            {type !== null && !type.active && <Badge tone="muted">Deaktiviert</Badge>}
          </span>
        }
      >
        {mayWrite && type !== null && type.active && (
          <Button
            variant="secondary"
            busy={deactivate.isPending}
            onClick={() => deactivate.mutate()}
          >
            Deaktivieren
          </Button>
        )}
        {mayWrite && (
          <Button onClick={submit} busy={save.isPending} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Tabs tabs={REGISTERS} active={tab} onChange={setTab} label="Register der Belegart" />

        <div className="grid gap-4">
          {(complaint !== null || save.error !== null) && (
            <ErrorNotice error={save.error ?? new Error(complaint ?? '')} />
          )}
          {deactivate.error !== null && <ErrorNotice error={deactivate.error} />}
          {markDefault.error !== null && <ErrorNotice error={markDefault.error} />}

          {tab === 'hauptdaten' && (
            <>
              <Panel title="Stammdaten">
                <div className="grid gap-4 sm:grid-cols-2">
                  <CatalogueSelect
                    label="Kategorie"
                    tenantId={tenantId}
                    catalogue="document-category"
                    value={form.category}
                    onChange={(code) => change({ category: code as DocumentCategory })}
                    disabled={!mayWrite || type !== null}
                    // Only the Gutschrift has no mask; it is written from the invoice it
                    // corrects. Saying so before saving is cheaper than finding out after.
                    hint={
                      salesDocumentFor(form.category) === undefined
                        ? 'Für diese Kategorie gibt es im Frontend noch keine Maske.'
                        : 'Steht fest, sobald die Belegart existiert.'
                    }
                  />
                  <TextField
                    label="Code"
                    value={form.code}
                    onChange={(event) => change({ code: event.target.value })}
                    disabled={!mayWrite || type !== null}
                    maxLength={20}
                    hint="Pflicht und danach unveränderlich. Steht im Nummernkreis und auf dem Beleg."
                  />
                  <TextField
                    label="Bezeichnung"
                    value={form.name}
                    onChange={(event) => change({ name: event.target.value })}
                    disabled={!mayWrite}
                    maxLength={60}
                    className="sm:col-span-2"
                  />
                  <TextField
                    label="Nummernpräfix"
                    value={form.numberPrefix}
                    onChange={(event) => change({ numberPrefix: event.target.value })}
                    disabled={!mayWrite}
                    maxLength={10}
                    hint="Steht vor der laufenden Nummer, zum Beispiel AU. Leer heisst: der Code."
                  />
                  {/* Only the offer promises something with an expiry, so only its kinds
                      carry the preset. */}
                  {form.category === 'OFFER' && (
                    <TextField
                      label="Gültigkeit in Tagen"
                      value={form.offerValidityDays}
                      onChange={(event) => change({ offerValidityDays: event.target.value })}
                      disabled={!mayWrite}
                      inputMode="numeric"
                      numeric
                      hint="Vorbelegt ‹Gültig bis› beim Anlegen: Belegdatum + Tage."
                    />
                  )}
                </div>
              </Panel>

              <Panel
                title="Aus der Kategorie"
                description="Diese Werte folgen aus der Kategorie und lassen sich nicht einstellen."
              >
                <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                  <div className="grid gap-0.5">
                    <dt className="text-[12px] text-text-tertiary">Adressverwendung</dt>
                    <dd>{type === null ? '—' : usageLabel(type.addressUsage)}</dd>
                  </div>
                  <div className="grid gap-0.5">
                    <dt className="text-[12px] text-text-tertiary">Maske im Frontend</dt>
                    <dd>
                      {salesDocumentFor(form.category) === undefined ? 'noch keine' : 'vorhanden'}
                    </dd>
                  </div>
                </dl>
              </Panel>

              {type !== null && (
                <Panel
                  title="Standardbelegart"
                  description={`Die Belegart, mit der ${categoryLabel(form.category)} normalerweise geschrieben wird. Sie wird beim Anlegen eines Belegs vorgeschlagen und gilt für jeden Kunden ohne eigene Abmachung.`}
                  action={
                    mayWrite && type.active && type.categoryDefault !== true ? (
                      <Button
                        variant="secondary"
                        busy={markDefault.isPending}
                        onClick={() => markDefault.mutate()}
                      >
                        Zur Standardbelegart machen
                      </Button>
                    ) : undefined
                  }
                >
                  <p className="text-[13px] text-text-secondary">
                    {type.categoryDefault === true
                      ? 'Diese Belegart ist der Standard ihrer Kategorie. Der Standard wird verschoben, nicht abgeschaltet: eine andere Belegart derselben Kategorie übernimmt ihn.'
                      : `Der Standard liegt bei einer anderen Belegart. ${
                          type.active
                            ? 'Übernehmen heisst: die bisherige verliert ihn.'
                            : 'Eine deaktivierte Belegart kann ihn nicht übernehmen.'
                        }`}
                  </p>
                  {type.categoryDefault === true && (
                    <p className="mt-2 text-[12px] text-text-tertiary">
                      Solange es eine andere aktive Belegart dieser Kategorie gibt, lässt sich
                      diese hier nicht deaktivieren — erst den Standard umhängen.
                    </p>
                  )}
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

          {tab === 'uebernahme' && (
            <>
              <PredecessorEditor
                all={types.data ?? []}
                editingId={type?.id}
                chosen={form.predecessorTypeIds}
                onChange={(predecessorTypeIds) => change({ predecessorTypeIds })}
                disabled={!mayWrite}
              />
              <Panel
                title="Kopie eines Belegs"
                description="Gilt für die Kopie eines Belegs dieser Art. Im Kopierdialog übersteuerbar."
              >
                <SelectField
                  label="Preise beim Kopieren"
                  value={form.copyPriceMode}
                  disabled={!mayWrite}
                  onChange={(event) =>
                    change({
                      copyPriceMode: event.target.value as DocumentTypeForm['copyPriceMode'],
                    })
                  }
                  hint={COPY_PRICE_MODES.find((mode) => mode.value === form.copyPriceMode)?.hint}
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
      </div>
    </>
  )
}
