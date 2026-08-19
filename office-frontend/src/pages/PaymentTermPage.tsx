import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RowOrderButtons } from '../components/RowOrderButtons'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { defaultCodeOf, labelForm, labelPayload } from '../lib/masterData'
import type { PaymentTerm } from '../lib/types'
import { useMasterDataEntries, usePaymentTerms } from '../masterdata/useMasterData'
import { PaymentTermDialog } from './paymentterm/PaymentTermDialog'
import {
  EMPTY_TERM,
  describeDiscounts,
  describePeriod,
  termComplaint,
  toTermForm,
  toTermPayload,
  type TermForm,
} from './paymentterm/paymentTermForm'

/**
 * The payment terms of the tenant.
 *
 * <p>A term carries the payment period of a document and the discount stages that go with it.
 * One of them is the default: it is what a document starts with when the customer brings no
 * term of its own. What a term means for a concrete amount is computed by the backend, both on
 * the document and in the preview of the dialog.
 */
export function PaymentTermPage() {
  return (
    <RequireTenant permission="MASTERDATA_READ">
      {(tenantId) => <PaymentTerms tenantId={tenantId} />}
    </RequireTenant>
  )
}

function PaymentTerms({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('MASTERDATA_WRITE')
  const mayDeactivate = can('MASTERDATA_DEACTIVATE')

  const [editing, setEditing] = useState<PaymentTerm | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<TermForm>(EMPTY_TERM)
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [complaint, setComplaint] = useState<string | null>(null)
  const [removing, setRemoving] = useState<PaymentTerm | null>(null)

  const base = `/api/tenants/${tenantId}/payment-terms`
  const defaultLanguage = defaultCodeOf(useMasterDataEntries(tenantId, 'languages'))

  // Deactivated terms belong on this screen: they have to be visible to be switched on again.
  const terms = usePaymentTerms(tenantId, false)
  const rows = terms.data ?? []

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payment-terms', tenantId] })
    // The preview of the dialog is computed from the stored term, so a save changes its answer
    // as well — and its key does not begin with 'payment-terms'.
    void queryClient.invalidateQueries({ queryKey: ['payment-term-calculation', tenantId] })
  }

  const save = useMutation({
    mutationFn: () => {
      // The name is written twice: as `name` and as the translation for the default language,
      // which is what `labelPayload` is for.
      const payload = toTermPayload(form, labelPayload(form.name, translations, defaultLanguage))
      return editing
        ? api.put<PaymentTerm>(`${base}/${editing.id}`, payload)
        : api.post<PaymentTerm>(base, payload)
    },
    onSuccess: () => {
      refresh()
      close()
    },
  })

  const makeDefault = useMutation({
    mutationFn: (id: number) => api.put<PaymentTerm>(`${base}/${id}/default`, undefined),
    onSuccess: () => refresh(),
  })

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.put<PaymentTerm>(`${base}/${id}/${active ? 'activate' : 'deactivate'}`, undefined),
    onSuccess: () => refresh(),
  })

  const reorder = useMutation({
    mutationFn: (entryIds: number[]) => api.put<PaymentTerm[]>(`${base}/order`, { entryIds }),
    onSuccess: () => refresh(),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`${base}/${id}`),
    onSuccess: () => {
      refresh()
      setRemoving(null)
    },
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_TERM)
    setTranslations({})
    setComplaint(null)
    save.reset()
  }

  const openNew = () => {
    setForm(EMPTY_TERM)
    setTranslations({})
    setEditing(null)
    setComplaint(null)
    save.reset()
    setCreating(true)
  }

  const openEdit = (term: PaymentTerm) => {
    setForm(toTermForm(term))
    setTranslations(labelForm(term.labels, defaultLanguage))
    setEditing(term)
    setComplaint(null)
    save.reset()
    setCreating(false)
  }

  const submit = () => {
    const problem = termComplaint(form)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  /** Moves one term past its neighbour and sends the whole list in its new order. */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const order = rows.map((term) => term.id)
    const moved = order[index]
    order[index] = order[target]
    order[target] = moved
    reorder.mutate(order)
  }

  const columns: Column<PaymentTerm>[] = [
    {
      key: 'order',
      header: '',
      width: 'w-[74px]',
      render: (term) => {
        if (!mayWrite) return null
        const index = rows.indexOf(term)
        return (
          <RowOrderButtons
            name={term.name}
            upDisabled={index <= 0 || reorder.isPending}
            downDisabled={index === rows.length - 1 || reorder.isPending}
            onUp={() => move(index, -1)}
            onDown={() => move(index, 1)}
          />
        )
      },
    },
    {
      key: 'code',
      header: 'Code',
      width: 'w-[150px]',
      render: (term) => <span className="font-mono text-[12px]">{term.code}</span>,
    },
    {
      key: 'name',
      header: 'Bezeichnung',
      render: (term) => (
        <span className="grid gap-0.5">
          {mayWrite ? (
            <button
              type="button"
              onClick={() => openEdit(term)}
              className="justify-self-start text-left font-medium transition-colors hover:text-accent-text"
            >
              {term.name}
            </button>
          ) : (
            <span className="font-medium">{term.name}</span>
          )}
          {term.description !== undefined && term.description !== '' && (
            <span className="text-[12px] text-text-secondary">{term.description}</span>
          )}
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Frist',
      width: 'w-[170px]',
      render: (term) => <span className="text-text-secondary">{describePeriod(term)}</span>,
    },
    {
      key: 'discounts',
      header: 'Skonto',
      width: 'w-[210px]',
      render: (term) => {
        const stages = describeDiscounts(term)
        if (stages.length === 0) return <span className="text-text-secondary">-</span>
        return (
          <span className="flex flex-wrap items-center gap-1">
            {stages.map((stage) => (
              <Badge key={stage}>{stage}</Badge>
            ))}
          </span>
        )
      },
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[230px]',
      render: (term) => (
        <span className="flex flex-wrap items-center gap-1">
          {term.isDefault && <Badge tone="accent">Standard</Badge>}
          {term.active === false && <Badge tone="muted">Deaktiviert</Badge>}
          {term.system === true && <Badge tone="neutral">Ausgeliefert</Badge>}
          {mayWrite && !term.isDefault && term.active !== false && (
            <button
              type="button"
              onClick={() => makeDefault.mutate(term.id)}
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
      width: 'w-[170px]',
      render: (term) => (
        <span className="flex items-center justify-end gap-3">
          {mayDeactivate && !term.isDefault && (
            <button
              type="button"
              onClick={() => setActive.mutate({ id: term.id, active: term.active === false })}
              className="text-[12px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              {term.active === false ? 'Aktivieren' : 'Deaktivieren'}
            </button>
          )}
          {mayDeactivate && term.system !== true && (
            <button
              type="button"
              onClick={() => {
                remove.reset()
                setRemoving(term)
              }}
              aria-label={`${term.name} löschen`}
              className="text-text-tertiary transition-colors hover:text-danger"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </span>
      ),
    },
  ]

  const failure = makeDefault.error ?? setActive.error ?? reorder.error

  return (
    <>
      <PageHeader
        title="Zahlungskonditionen"
        subtitle="Zahlungsfrist und Skontostaffeln, die ein Beleg beim Ausstellen übernimmt."
      >
        {mayWrite && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Zahlungskondition
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {failure !== null && failure !== undefined && (
          <div className="mb-6">
            <ErrorNotice error={failure} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(term) => term.id}
            onRowOpen={mayWrite ? openEdit : undefined}
            loading={terms.isPending}
            error={terms.error}
            empty={
              <EmptyState
                title="Keine Zahlungskonditionen"
                description="Ohne Kondition fällt ein Beleg auf die Zahlungsfrist des Mandanten zurück."
              >
                {mayWrite && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Erste Zahlungskondition
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <PaymentTermDialog
        open={creating || editing !== null}
        onClose={close}
        onSubmit={submit}
        form={form}
        onChange={setForm}
        translations={translations}
        onTranslationsChange={setTranslations}
        busy={save.isPending}
        error={save.error ?? (complaint === null ? null : new Error(complaint))}
        editing={editing}
        tenantId={tenantId}
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Zahlungskondition löschen"
        description="Nur möglich, solange kein Beleg auf die Kondition zeigt."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => removing && remove.mutate(removing.id)} busy={remove.isPending}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          {removing?.name} wird endgültig entfernt. Wird die Kondition noch verwendet oder mit der
          Anwendung ausgeliefert, lehnt das Backend das ab — dann bleibt das Deaktivieren. Bereits
          ausgestellte Belege behalten in jedem Fall, was auf ihnen gedruckt steht.
        </p>
        {remove.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </Dialog>
    </>
  )
}

