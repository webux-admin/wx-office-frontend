import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Star } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import type { PriceGroup } from '../lib/types'

/**
 * The price groups of the tenant.
 *
 * <p>One of them is the default: it decides what a customer pays who is in no group of its
 * own. Making another one the default is a separate operation, because it takes the mark away
 * from the group that holds it.
 */
export function PriceGroupPage() {
  return (
    <RequireTenant permission="PRODUCT_READ">
      {(tenantId) => <PriceGroups tenantId={tenantId} />}
    </RequireTenant>
  )
}

type GroupForm = {
  code: string
  name: string
  description: string
  priceIncludesVat: boolean
}

const EMPTY: GroupForm = { code: '', name: '', description: '', priceIncludesVat: false }

function PriceGroups({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('PRODUCT_WRITE')

  const [editing, setEditing] = useState<PriceGroup | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<GroupForm>(EMPTY)

  const groups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['price-groups', tenantId] })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        priceIncludesVat: form.priceIncludesVat,
      }
      return editing
        ? api.put<PriceGroup>(`/api/tenants/${tenantId}/price-groups/${editing.id}`, payload)
        : api.post<PriceGroup>(`/api/tenants/${tenantId}/price-groups`, payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const makeDefault = useMutation({
    mutationFn: (id: number) =>
      api.put<PriceGroup>(`/api/tenants/${tenantId}/price-groups/${id}/default`, undefined),
    onSuccess: refresh,
  })

  const deactivate = useMutation({
    mutationFn: (id: number) => api.delete<PriceGroup>(`/api/tenants/${tenantId}/price-groups/${id}`),
    onSuccess: refresh,
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY)
    save.reset()
  }

  const openNew = () => {
    setForm(EMPTY)
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (group: PriceGroup) => {
    setForm({
      code: group.code,
      name: group.name,
      description: group.description ?? '',
      priceIncludesVat: group.priceIncludesVat === true,
    })
    setEditing(group)
    setCreating(false)
  }

  const columns: Column<PriceGroup>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[110px]',
      render: (group) => <span className="font-mono text-[12px]">{group.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (group) =>
        mayWrite ? (
          <button
            type="button"
            onClick={() => openEdit(group)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {group.name}
          </button>
        ) : (
          <span className="font-medium">{group.name}</span>
        ),
    },
    {
      key: 'description',
      header: 'Beschreibung',
      render: (group) => <span className="text-text-secondary">{group.description ?? '-'}</span>,
    },
    {
      key: 'vat',
      header: 'Preise',
      width: 'w-[130px]',
      render: (group) => (
        <span className="text-text-secondary">
          {group.priceIncludesVat ? 'inkl. MwSt' : 'exkl. MwSt'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[190px]',
      render: (group) => (
        <span className="flex flex-wrap items-center gap-1">
          {group.isDefault && <Badge tone="accent">Standard</Badge>}
          {group.active === false && <Badge tone="muted">Deaktiviert</Badge>}
          {mayWrite && !group.isDefault && group.active !== false && (
            <button
              type="button"
              onClick={() => makeDefault.mutate(group.id)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
            >
              <Star size={12} aria-hidden />
              Als Standard
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[120px]',
      render: (group) =>
        mayWrite && group.active !== false && !group.isDefault ? (
          <button
            type="button"
            onClick={() => deactivate.mutate(group.id)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
          >
            Deaktivieren
          </button>
        ) : null,
    },
  ]

  const open = creating || editing !== null

  return (
    <>
      <PageHeader
        title="Preisgruppen"
        subtitle={`${formatCount(groups.data?.length ?? 0)} Gruppen`}
      >
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Preisgruppe
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {(makeDefault.error || deactivate.error) && (
          <div className="mb-6">
            <ErrorNotice error={makeDefault.error ?? deactivate.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={groups.data ?? []}
            keyOf={(group) => group.id}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={groups.isPending}
            error={groups.error}
            empty={
              <EmptyState
                title="Keine Preisgruppen"
                description="Ohne Gruppe zahlt jeder Kunde den Grundpreis des Produkts."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Erste Preisgruppe
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
        title={editing ? 'Preisgruppe bearbeiten' : 'Neue Preisgruppe'}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={form.code.trim() === '' || form.name.trim() === ''}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <TextField
            label="Code"
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            maxLength={20}
            hint="Kurzzeichen, zum Beispiel WIEDERVERKAUF."
          />
          <TextField
            label="Name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            maxLength={60}
          />
          <TextField
            label="Beschreibung"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            maxLength={255}
          />
          <CheckboxField
            label="Preise verstehen sich inklusive MwSt"
            hint="Im Detailhandel üblich; im Geschäftsverkehr eher nicht."
            checked={form.priceIncludesVat}
            onChange={(event) =>
              setForm((current) => ({ ...current, priceIncludesVat: event.target.checked }))
            }
          />
          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Dialog>
    </>
  )
}
