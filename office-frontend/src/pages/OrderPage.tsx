import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatDate, formatDateTime } from '../lib/format'
import type { DocumentParty, DocumentStatusEntry, SalesDocument } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { NewOrderMask } from './order/NewOrderMask'
import { OrderLines, type FreeLine, type ProductLine } from './order/OrderLines'

/** One order: its positions, its texts and the way from draft to issued. */
export function OrderPage() {
  return (
    <RequireTenant permission="ORDER_READ">
      {(tenantId) => <OrderLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function OrderLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()

  const order = useQuery({
    queryKey: ['order', tenantId, id],
    queryFn: () => api.get<SalesDocument>(`/api/tenants/${tenantId}/orders/${id}`),
    enabled: id !== 'neu',
  })

  if (id === 'neu') return <NewOrderMask tenantId={tenantId} />
  if (order.isPending) return <LoadingBlock label="Auftrag wird geladen" />
  if (order.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={order.error} />
      </div>
    )
  }
  return <OrderMask tenantId={tenantId} order={order.data} />
}

function OrderMask({ tenantId, order }: { tenantId: number; order: SalesDocument }) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reason, setReason] = useState('')

  const editable = order.status === 'DRAFT' && can('ORDER_WRITE')
  const base = `/api/tenants/${tenantId}/orders/${order.id}`

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['orders', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['order-trail', tenantId] })
  }

  const addProductLine = useMutation({
    mutationFn: (line: ProductLine) => api.post<SalesDocument>(`${base}/lines`, line),
    onSuccess: refresh,
  })

  const addFreeLine = useMutation({
    mutationFn: (line: FreeLine) => api.post<SalesDocument>(`${base}/free-lines`, line),
    onSuccess: refresh,
  })

  const removeLine = useMutation({
    mutationFn: (lineNumber: number) => api.delete<SalesDocument>(`${base}/lines/${lineNumber}`),
    onSuccess: refresh,
  })

  const finalise = useMutation({
    mutationFn: () => api.post<SalesDocument>(`${base}/finalise`),
    onSuccess: refresh,
  })

  const cancel = useMutation({
    mutationFn: () => api.post<SalesDocument>(`${base}/cancel`, { reason: reason.trim() }),
    onSuccess: () => {
      refresh()
      setCancelling(false)
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete<void>(base),
    onSuccess: () => {
      refresh()
      void navigate('/auftraege', { replace: true })
    },
  })

  const lineBusy =
    addProductLine.isPending || addFreeLine.isPending || removeLine.isPending

  return (
    <>
      <PageHeader
        title={order.documentNumber ?? `Entwurf ${order.id}`}
        back={{ to: '/auftraege', label: 'Aufträge' }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                order.status === 'CANCELLED'
                  ? 'danger'
                  : order.status === 'FINALISED'
                    ? 'accent'
                    : 'muted'
              }
            >
              {statusLabel(order.status)}
            </Badge>
            <span>{formatDate(order.documentDate)}</span>
            <span className="text-text-tertiary">·</span>
            <span>{order.recipient?.name ?? `Kunde ${order.partnerId}`}</span>
          </span>
        }
      >
        {order.status === 'DRAFT' && can('ORDER_WRITE') && (
          <Button variant="secondary" onClick={() => setDeleting(true)}>
            Entwurf löschen
          </Button>
        )}
        {order.status === 'FINALISED' && can('ORDER_CANCEL') && (
          <Button variant="secondary" onClick={() => setCancelling(true)}>
            Stornieren
          </Button>
        )}
        {order.status === 'DRAFT' && can('ORDER_FINALISE') && (
          <Button
            onClick={() => finalise.mutate()}
            busy={finalise.isPending}
            disabled={(order.lines?.length ?? 0) === 0}
          >
            Ausstellen
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {finalise.error !== null && <ErrorNotice error={finalise.error} />}

        <OrderLines
          tenantId={tenantId}
          order={order}
          editable={editable}
          onAddProductLine={(line) => addProductLine.mutate(line)}
          onAddFreeLine={(line) => addFreeLine.mutate(line)}
          onRemoveLine={(lineNumber) => removeLine.mutate(lineNumber)}
          busy={lineBusy}
          error={addProductLine.error ?? addFreeLine.error ?? removeLine.error}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <OrderTexts tenantId={tenantId} order={order} editable={editable} />

          <div className="grid gap-6">
            <PaymentPanel order={order} />
            <PartyPanel title="Empfänger" party={order.recipient} number={order.partnerNumber} />
            <PartyPanel title="Absender" party={order.issuer} />
            <StatusTrail tenantId={tenantId} orderId={order.id} />
          </div>
        </div>
      </div>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Auftrag stornieren"
        description="Ein ausgestellter Beleg wird nicht gelöscht, sondern storniert."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => cancel.mutate()}
              busy={cancel.isPending}
              disabled={reason.trim() === ''}
            >
              Stornieren
            </Button>
          </>
        }
      >
        <TextField
          label="Grund"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={255}
          hint="Wird im Verlauf festgehalten und bleibt dort."
        />
        {cancel.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={cancel.error} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Entwurf löschen"
        description="Ein Entwurf hat noch keine Nummer gezogen und darf verschwinden."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => remove.mutate()} busy={remove.isPending}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Der Beleg wird endgültig entfernt. Rückgängig machen lässt sich das nicht.
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

/** Header text, footer text and the reference of the customer. */
function OrderTexts({
  tenantId,
  order,
  editable,
}: {
  tenantId: number
  order: SalesDocument
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const [headerText, setHeaderText] = useState(order.headerText ?? '')
  const [footerText, setFooterText] = useState(order.footerText ?? '')
  const [reference, setReference] = useState(order.reference ?? '')

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`/api/tenants/${tenantId}/orders/${order.id}/texts`, {
        headerText: headerText.trim() || undefined,
        footerText: footerText.trim() || undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', tenantId] }),
  })

  return (
    <Panel
      title="Texte"
      description="Erscheinen über und unter den Positionen."
      action={
        editable ? (
          <Button variant="secondary" onClick={() => save.mutate()} busy={save.isPending}>
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        <TextField
          label="Referenz des Kunden"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          disabled={!editable}
          maxLength={140}
          hint="Bestellnummer oder Projekt, damit der Kunde den Beleg zuordnen kann."
        />
        <TextAreaField
          label="Kopftext"
          value={headerText}
          onChange={(event) => setHeaderText(event.target.value)}
          disabled={!editable}
          rows={3}
        />
        <TextAreaField
          label="Fusstext"
          value={footerText}
          onChange={(event) => setFooterText(event.target.value)}
          disabled={!editable}
          rows={3}
        />
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Panel>
  )
}

/**
 * What was agreed about paying, as it stands on the document.
 *
 * <p>A draft shows the term and the due date; both follow from the term and the document
 * date. The printed sentence and the discount amounts appear only once the document is
 * issued, because they name figures that the final total settles (ADR-0027).
 */
function PaymentPanel({ order }: { order: SalesDocument }) {
  if (!order.paymentTerm) return null

  return (
    <Panel title="Zahlung" description="Kopie aus den Stammdaten, festgehalten beim Anlegen.">
      <dl className="grid gap-2.5 text-[13px]">
        <div className="flex gap-3">
          <dt className="w-[112px] shrink-0 text-text-tertiary">Kondition</dt>
          <dd>{order.paymentTermName ?? order.paymentTerm}</dd>
        </div>
        {order.dueDate && (
          <div className="flex gap-3">
            <dt className="w-[112px] shrink-0 text-text-tertiary">Fällig am</dt>
            <dd className="font-mono tabular-nums">{formatDate(order.dueDate)}</dd>
          </div>
        )}
        {order.paymentReference && (
          <div className="flex gap-3">
            <dt className="w-[112px] shrink-0 text-text-tertiary">Referenz</dt>
            <dd className="font-mono text-[12px] tabular-nums">{order.paymentReference}</dd>
          </div>
        )}
      </dl>

      {order.discountStages && order.discountStages.length > 0 && (
        <ul className="mt-4 grid gap-1.5 border-t border-line-subtle pt-3 text-[13px]">
          {order.discountStages.map((stage) => (
            <li key={stage.days} className="flex items-baseline justify-between gap-3">
              <span className="text-text-secondary">
                {stage.percent}% bis {formatDate(stage.discountDate)}
              </span>
              <span className="font-mono tabular-nums">
                {formatAmount(stage.amountAfterDiscount)}{' '}
                <span className="text-text-tertiary">{order.currency}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {order.paymentTermText && (
        <p className="mt-4 border-t border-line-subtle pt-3 text-[12px] text-text-secondary">
          {order.paymentTermText}
        </p>
      )}
    </Panel>
  )
}

/**
 * Name and address as they stand on the document.
 *
 * <p>These are a copy taken when the draft was created, not a view of the partner record: a
 * document must still read the way it was sent, even after the customer moves.
 */
function PartyPanel({
  title,
  party,
  number,
}: {
  title: string
  party?: DocumentParty
  number?: string
}) {
  if (!party) return null

  return (
    <Panel title={title} description="Kopie aus den Stammdaten, festgehalten beim Anlegen.">
      <address className="not-italic text-[13px] leading-6">
        <span className="block font-medium">{party.name}</span>
        {party.addressLine && <span className="block">{party.addressLine}</span>}
        <span className="block">
          {[party.street, party.buildingNumber].filter(Boolean).join(' ')}
        </span>
        <span className="block">
          {[party.country, party.postalCode].filter(Boolean).join('-')} {party.town}
        </span>
        {party.uid && (
          <span className="mt-1.5 block font-mono text-[12px] text-text-secondary">
            {party.uid}
          </span>
        )}
        {number && (
          <span className="block font-mono text-[12px] text-text-secondary">{number}</span>
        )}
      </address>
    </Panel>
  )
}

/** Who moved the document where, and when. */
function StatusTrail({ tenantId, orderId }: { tenantId: number; orderId: number }) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const trail = useQuery({
    queryKey: ['order-trail', tenantId, orderId],
    queryFn: () =>
      api.get<DocumentStatusEntry[]>(`/api/tenants/${tenantId}/orders/${orderId}/status-trail`),
  })

  return (
    <Panel title="Verlauf">
      {trail.isPending && <p className="text-[13px] text-text-secondary">Wird geladen ...</p>}
      {trail.error !== null && <ErrorNotice error={trail.error} />}
      {trail.data && (
        <ol className="grid gap-3">
          {trail.data.map((entry, index) => (
            <li key={`${entry.status}-${entry.changedAt}-${index}`} className="flex gap-3">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-[var(--radius-full)] bg-accent"
              />
              <span className="min-w-0 text-[13px]">
                <span className="block font-medium">{statusLabel(entry.status)}</span>
                <span className="block text-text-secondary">
                  {formatDateTime(entry.changedAt)}
                  {entry.changedBy ? ` · ${entry.changedBy}` : ''}
                </span>
                {entry.note && <span className="block text-text-secondary">{entry.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
