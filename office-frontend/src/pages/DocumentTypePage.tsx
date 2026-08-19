import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import type { DocumentCategory, DocumentType } from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { MasterDataSelect } from '../masterdata/MasterDataSelect'
import { useCatalogueLabel } from '../masterdata/useMasterData'

/**
 * The kinds of document the tenant writes.
 *
 * <p>Every category can be set up here, but only Auftrag has a mask of its own. The other
 * categories have no controller yet, so a kind of category Rechnung can be created and will
 * simply sit unused until that module exists. Saying so is better than hiding the choice and
 * making the catalogue look narrower than it is.
 */
export function DocumentTypePage() {
  return (
    <RequireTenant permission="DOCUMENT_TYPE_READ">
      {(tenantId) => <DocumentTypes tenantId={tenantId} />}
    </RequireTenant>
  )
}

type TypeForm = {
  category: DocumentCategory
  code: string
  name: string
  numberPrefix: string
  layoutTemplate: string
}

const EMPTY: TypeForm = {
  category: 'ORDER',
  code: '',
  name: '',
  numberPrefix: '',
  layoutTemplate: '',
}

function DocumentTypes({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')
  const mayWrite = can('DOCUMENT_TYPE_WRITE')

  const [editing, setEditing] = useState<DocumentType | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<TypeForm>(EMPTY)

  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['document-types', tenantId] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        category: form.category,
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        numberPrefix: form.numberPrefix.trim() || undefined,
        layoutTemplate: form.layoutTemplate || undefined,
      }
      return editing
        ? api.put<DocumentType>(`/api/tenants/${tenantId}/document-types/${editing.id}`, payload)
        : api.post<DocumentType>(`/api/tenants/${tenantId}/document-types`, payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const deactivate = useMutation({
    mutationFn: (id: number) =>
      api.delete<DocumentType>(`/api/tenants/${tenantId}/document-types/${id}`),
    onSuccess: refresh,
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY)
    save.reset()
  }

  const openEdit = (type: DocumentType) => {
    setForm({
      category: type.category,
      code: type.code,
      name: type.name,
      numberPrefix: type.numberPrefix ?? '',
      layoutTemplate: type.layoutTemplate ?? '',
    })
    setEditing(type)
    setCreating(false)
  }

  const columns: Column<DocumentType>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[100px]',
      render: (type) => <span className="font-mono text-[12px]">{type.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (type) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(type)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {type.name}
          </button>
        ) : (
          <span className="font-medium">{type.name}</span>
        ),
    },
    {
      key: 'category',
      header: 'Kategorie',
      width: 'w-[150px]',
      render: (type) => (
        <span className="text-text-secondary">{categoryLabel(type.category)}</span>
      ),
    },
    {
      key: 'prefix',
      header: 'Präfix',
      width: 'w-[110px]',
      render: (type) => (
        <span className="font-mono text-[12px] text-text-secondary">
          {type.numberPrefix ?? '-'}
        </span>
      ),
    },
    {
      key: 'address',
      header: 'Adresse',
      width: 'w-[140px]',
      render: (type) => (
        <span className="text-text-secondary">{usageLabel(type.addressUsage)}</span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[190px]',
      render: (type) => (
        <span className="flex items-center gap-2">
          {type.active ? (
            type.category === 'ORDER' ? (
              <Badge tone="accent">Maske vorhanden</Badge>
            ) : (
              <Badge tone="neutral">Ohne Maske</Badge>
            )
          ) : (
            <Badge tone="muted">Deaktiviert</Badge>
          )}
          {mayWrite && type.active && (
            <button
              type="button"
              onClick={() => deactivate.mutate(type.id)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
            >
              Deaktivieren
            </button>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Belegarten"
        subtitle="Eine Maske gibt es bisher nur für Aufträge. Andere Kategorien lassen sich anlegen, werden aber von keinem Modul bedient."
      >
        {mayWrite && (
          <Button
            onClick={() => {
              setForm(EMPTY)
              setEditing(null)
              setCreating(true)
            }}
          >
            <Plus size={15} aria-hidden />
            Belegart
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {deactivate.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={deactivate.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={types.data ?? []}
            keyOf={(type) => type.id}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={types.isPending}
            error={types.error}
            empty={
              <EmptyState
                title="Keine Belegarten"
                description="Ohne Belegart lässt sich kein Beleg anlegen. Sie bestimmt Nummernkreis und Adresse."
              />
            }
          />
        </Panel>
      </div>

      <Dialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? 'Belegart bearbeiten' : 'Neue Belegart'}
        description={
          editing ? 'Code und Kategorie stehen fest, sobald die Belegart existiert.' : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={form.name.trim() === '' || (editing === null && form.code.trim() === '')}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <CatalogueSelect
            label="Kategorie"
            tenantId={tenantId}
            catalogue="document-category"
            value={form.category}
            onChange={(code) =>
              setForm((current) => ({ ...current, category: code as DocumentCategory }))
            }
            disabled={editing !== null}
            hint={
              form.category === 'ORDER'
                ? undefined
                : 'Für diese Kategorie gibt es im Frontend noch keine Maske.'
            }
          />

          <TextField
            label="Code"
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            disabled={editing !== null}
            maxLength={20}
            hint="Pflicht und danach unveränderlich. Steht im Nummernkreis und auf dem Beleg."
          />

          <TextField
            label="Bezeichnung"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            maxLength={60}
          />

          <TextField
            label="Nummernpräfix"
            value={form.numberPrefix}
            onChange={(event) =>
              setForm((current) => ({ ...current, numberPrefix: event.target.value }))
            }
            maxLength={10}
            hint="Steht vor der laufenden Nummer, zum Beispiel AU."
          />

          {/* Only when editing: POST /document-types drops the layout template it is handed,
              so offering it while creating would promise a setting the backend throws away. */}
          {editing !== null ? (
            <MasterDataSelect
              label="Druckvorlage"
              tenantId={tenantId}
              list="layout-templates"
              value={form.layoutTemplate}
              onChange={(code) => setForm((current) => ({ ...current, layoutTemplate: code }))}
              emptyLabel="Ohne Vorlage"
            />
          ) : (
            <p className="text-[12px] text-text-tertiary">
              Die Druckvorlage lässt sich wählen, sobald die Belegart angelegt ist.
            </p>
          )}

          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Dialog>
    </>
  )
}
