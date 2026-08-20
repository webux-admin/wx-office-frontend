import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { LabelFields } from '../masterdata/LabelFields'
import { useMasterDataEntries } from '../masterdata/useMasterData'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { defaultCodeOf, labelForm, labelPayload } from '../lib/masterData'
import type { FreeFieldType, ProductFreeFieldDefinition } from '../lib/types'

/**
 * What the free fields of a product mean, for this tenant.
 *
 * <p>The application keeps fifteen places on every article — five for text, five for numbers,
 * five for yes or no — and knows nothing about any of them. Here the tenant says what they
 * are for. A place without a definition is offered nowhere.
 */
export function ProductFreeFieldPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <ProductFreeFields tenantId={tenantId} />}
    </RequireTenant>
  )
}

type FieldForm = {
  code: string
  name: string
  description: string
  sortOrder: string
  active: boolean
  printable: boolean
  translations: Record<string, string>
}

const EMPTY: FieldForm = {
  code: '',
  name: '',
  description: '',
  sortOrder: '100',
  active: true,
  printable: false,
  translations: {},
}

/** What each kind of place is called in the mask. */
const TYPE_LABELS: Record<FreeFieldType, string> = {
  TEXT: 'Text',
  NUMBER: 'Zahl',
  FLAG: 'Ja/Nein',
}

function ProductFreeFields({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRODUCT_WRITE')
  const defaultLanguage = defaultCodeOf(useMasterDataEntries(tenantId, 'languages'))

  const [editing, setEditing] = useState<ProductFreeFieldDefinition | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FieldForm>(EMPTY)
  const [clearing, setClearing] = useState<ProductFreeFieldDefinition | null>(null)

  const base = `/api/tenants/${tenantId}/product-free-fields`

  const fields = useQuery({
    queryKey: ['product-free-fields', tenantId],
    queryFn: () => api.get<ProductFreeFieldDefinition[]>(base),
  })

  // The places nobody has taken yet. Only needed while a new field is being defined, so it is
  // fetched then rather than on every visit.
  const available = useQuery({
    queryKey: ['product-free-fields-available', tenantId],
    queryFn: () => api.get<ProductFreeFieldDefinition[]>(`${base}/available`),
    enabled: creating,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product-free-fields', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['product-free-fields-available', tenantId] })
    // The product mask draws its inputs from these definitions, so it has to be asked again.
    void queryClient.invalidateQueries({ queryKey: ['product', tenantId] })
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<ProductFreeFieldDefinition>(`${base}/${form.code}`, {
        code: form.code,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        labels: labelPayload(form.name, form.translations, defaultLanguage),
        sortOrder: Number(form.sortOrder) || 100,
        active: form.active,
        printable: form.printable,
      }),
    onSuccess: () => {
      refresh()
      close()
    },
  })

  const remove = useMutation({
    mutationFn: (code: string) => api.delete<void>(`${base}/${code}`),
    onSuccess: () => {
      refresh()
      close()
    },
  })

  const clearValues = useMutation({
    mutationFn: (code: string) => api.delete<{ cleared: number }>(`${base}/${code}/values`),
    onSuccess: () => {
      refresh()
      setClearing(null)
    },
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY)
    save.reset()
    remove.reset()
  }

  const openNew = () => {
    setForm(EMPTY)
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (field: ProductFreeFieldDefinition) => {
    setForm({
      code: field.code,
      name: field.name ?? '',
      description: field.description ?? '',
      sortOrder: (field.sortOrder ?? 100).toString(),
      active: field.active !== false,
      printable: field.printable === true,
      translations: labelForm(field.labels, defaultLanguage),
    })
    setEditing(field)
    setCreating(false)
  }

  const columns: Column<ProductFreeFieldDefinition>[] = [
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (field) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(field)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {field.name ?? field.code}
          </button>
        ) : (
          <span className="font-medium">{field.name ?? field.code}</span>
        ),
    },
    {
      key: 'type',
      header: 'Art',
      width: 'w-[110px]',
      render: (field) => (
        <span className="text-text-secondary">
          {field.type ? TYPE_LABELS[field.type] : '-'}
        </span>
      ),
    },
    {
      key: 'code',
      header: 'Platz',
      width: 'w-[130px]',
      render: (field) => <span className="font-mono text-[12px]">{field.code}</span>,
    },
    {
      key: 'description',
      header: 'Hinweis',
      render: (field) => <span className="text-text-secondary">{field.description ?? '-'}</span>,
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[190px]',
      render: (field) => (
        <span className="flex flex-wrap items-center gap-1">
          {field.printable && <Badge tone="accent">Auf Belegen</Badge>}
          {field.active === false && <Badge tone="muted">Ausgeblendet</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[110px]',
      render: (field) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => setClearing(field)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
          >
            Werte leeren
          </button>
        ) : null,
    },
  ]

  const open = creating || editing !== null
  const slots = available.data ?? []

  return (
    <>
      <PageHeader
        title="Freifelder"
        subtitle={`${formatCount(fields.data?.length ?? 0)} von 15 Plätzen vergeben`}
      >
        {mayWrite && (
          <Button onClick={openNew} disabled={(fields.data?.length ?? 0) >= 15}>
            <Plus size={15} aria-hidden />
            Freifeld
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {clearValues.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={clearValues.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={fields.data ?? []}
            keyOf={(field) => field.code}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={fields.isPending}
            error={fields.error}
            empty={
              <EmptyState
                title="Keine Freifelder"
                description="Fünfzehn Plätze am Produkt stehen bereit: fünf für Text, fünf für Zahlen, fünf für Ja/Nein. Was sie bedeuten, entscheiden Sie hier."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Erstes Freifeld
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <Dialog
        open={open}
        onClose={close}
        title={editing ? 'Freifeld bearbeiten' : 'Neues Freifeld'}
        footer={
          <>
            {editing && mayWrite && (
              <Button
                variant="secondary"
                onClick={() => remove.mutate(editing.code)}
                busy={remove.isPending}
              >
                Definition löschen
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={form.code === '' || form.name.trim() === ''}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {editing ? (
            <TextField
              label="Platz"
              value={`${editing.code} — ${editing.type ? TYPE_LABELS[editing.type] : ''}`}
              disabled
              hint="Der Platz steht fest: an ihm hängen die bereits erfassten Werte."
            />
          ) : (
            <SelectField
              label="Platz"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              hint="Bestimmt die Art des Werts und lässt sich später nicht mehr wechseln."
            >
              <option value="">Bitte wählen</option>
              {slots.map((slot) => (
                <option key={slot.code} value={slot.code}>
                  {slot.type ? TYPE_LABELS[slot.type] : ''} — {slot.code}
                </option>
              ))}
            </SelectField>
          )}

          <TextField
            label="Bezeichnung"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            maxLength={60}
            hint="So heisst das Feld in der Produktmaske, zum Beispiel Garantie in Monaten."
          />

          <TextField
            label="Hinweis"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            maxLength={200}
            hint="Steht unter dem Feld. Leer lassen ist erlaubt."
          />

          <TextField
            label="Reihenfolge"
            value={form.sortOrder}
            onChange={(event) =>
              setForm((current) => ({ ...current, sortOrder: event.target.value }))
            }
            inputMode="numeric"
            numeric
            hint="Kleinere Zahlen stehen weiter oben. Üblich sind Hunderterschritte."
          />

          <CheckboxField
            label="In der Produktmaske zeigen"
            checked={form.active}
            onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            hint="Aus heisst: nicht mehr sichtbar. Erfasste Werte bleiben erhalten."
          />

          <CheckboxField
            label="Auf Belegen druckbar"
            checked={form.printable}
            onChange={(event) =>
              setForm((current) => ({ ...current, printable: event.target.checked }))
            }
            hint="Erst dann lässt sich im Formular-Designer eine Spalte dafür setzen. Aus heisst: bleibt im Haus."
          />

          <LabelFields
            tenantId={tenantId}
            translations={form.translations}
            onChange={(translations) => setForm((current) => ({ ...current, translations }))}
          />

          {(save.error !== null || remove.error !== null) && (
            <ErrorNotice error={save.error ?? remove.error} />
          )}
        </div>
      </Dialog>

      <Dialog
        open={clearing !== null}
        onClose={() => setClearing(null)}
        title="Werte leeren"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearing(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => clearing && clearValues.mutate(clearing.code)}
              busy={clearValues.isPending}
            >
              Leeren
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Der Wert von <strong>{clearing?.name ?? clearing?.code}</strong> wird bei jedem Produkt
          dieses Mandanten entfernt. Bereits geschriebene Belege behalten, was auf ihnen steht.
        </p>
      </Dialog>
    </>
  )
}
