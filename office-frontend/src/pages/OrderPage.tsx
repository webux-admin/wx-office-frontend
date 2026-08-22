import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { showFile } from '../lib/files'
import { formatDate, formatDateTime } from '../lib/format'
import { originOf, type Origin } from '../lib/origin'
import type {
  DocumentParty,
  DocumentStatus,
  DocumentStatusEntry,
  SalesDocument,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { ChangePartnerDialog } from './order/ChangePartnerDialog'
import { NewOrderMask } from './order/NewOrderMask'
import { OrderHeaderPanel } from './order/OrderHeaderPanel'
import { OrderLines } from './order/OrderLines'
import { OrderPaymentPanel } from './order/OrderPaymentPanel'
import { OrderPrintouts } from './order/OrderPrintouts'
import { headerKey, paymentKey } from './order/headerForm'
import { recipientNote } from './order/recipientNote'
import {
  itemLineCount,
  type FreeLine,
  type ProductLine,
  type StructureLine,
} from './order/lineForm'

/** Where an order mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/auftraege', label: 'Aufträge' }

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
  const origin = originOf(useLocation().state, LIST)

  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changingPartner, setChangingPartner] = useState(false)
  const [reason, setReason] = useState('')

  const editable = order.status === 'DRAFT' && can('ORDER_WRITE')
  // Two reasons keep a section read-only, and they are not the same thing. An issued
  // document is finished; a draft without the permission is not, and saying so is the only
  // way the user learns why nothing can be typed.
  const readOnlyNote =
    order.status === 'DRAFT' && !can('ORDER_WRITE')
      ? 'Zum Ändern fehlt das Recht ORDER_WRITE.'
      : undefined
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

  const updateProductLine = useMutation({
    mutationFn: ({ lineNumber, line }: { lineNumber: number; line: ProductLine }) =>
      api.put<SalesDocument>(`${base}/lines/${lineNumber}`, line),
    onSuccess: refresh,
  })

  const addFreeLine = useMutation({
    mutationFn: (line: FreeLine) => api.post<SalesDocument>(`${base}/free-lines`, line),
    onSuccess: refresh,
  })

  const updateFreeLine = useMutation({
    mutationFn: ({ lineNumber, line }: { lineNumber: number; line: FreeLine }) =>
      api.put<SalesDocument>(`${base}/free-lines/${lineNumber}`, line),
    onSuccess: refresh,
  })

  const addStructureLine = useMutation({
    mutationFn: (line: StructureLine) =>
      api.post<SalesDocument>(`${base}/structure-lines`, line),
    onSuccess: refresh,
  })

  const updateStructureLine = useMutation({
    mutationFn: ({ lineNumber, line }: { lineNumber: number; line: StructureLine }) =>
      api.put<SalesDocument>(`${base}/structure-lines/${lineNumber}`, line),
    onSuccess: refresh,
  })

  // The position a line is moved to is its new line number, and the backend renumbers the
  // rest around it. The browser never renumbers anything itself.
  const moveLine = useMutation({
    mutationFn: ({ lineNumber, position }: { lineNumber: number; position: number }) =>
      api.put<SalesDocument>(`${base}/lines/${lineNumber}/position`, { position }),
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

  // A draft renders on the spot and comes back with a watermark; an issued Auftrag hands out
  // the PDF that was archived when it was issued, so a reprint is the same document.
  const print = useMutation({
    mutationFn: () => api.file(`${base}/pdf`),
    onSuccess: showFile,
  })

  const remove = useMutation({
    mutationFn: () => api.delete<void>(base),
    // The record is gone, so the mask has nothing left to show and closes to where it was
    // opened from.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const lineMutations = [
    addProductLine,
    updateProductLine,
    addFreeLine,
    updateFreeLine,
    addStructureLine,
    updateStructureLine,
    moveLine,
    removeLine,
  ]
  const lineBusy = lineMutations.some((mutation) => mutation.isPending)
  const lineError = lineMutations.map((mutation) => mutation.error).find((one) => one !== null)

  /**
   * Starts a change to the positions, with a clean slate.
   *
   * <p>react-query keeps the error of a mutation until that same mutation runs again, so a
   * free line that was refused would still be complained about after a catalogue position
   * went through. Only the attempt that is running may be on screen.
   *
   * @param run the mutation to start
   * @returns what the mutation answers, so the dialog can wait for it
   */
  const startLine = <T,>(run: () => Promise<T>): Promise<T> => {
    lineMutations.forEach((mutation) => mutation.reset())
    return run()
  }

  return (
    <>
      <PageHeader
        title={order.documentNumber ?? `Entwurf ${order.id}`}
        back={{ to: origin.from, label: origin.label }}
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
        <Button variant="secondary" onClick={() => print.mutate()} busy={print.isPending}>
          {order.status === 'DRAFT' ? 'Vorschau' : 'Drucken'}
        </Button>
        {order.status === 'FINALISED' && can('ORDER_CANCEL') && (
          <Button variant="secondary" onClick={() => setCancelling(true)}>
            Stornieren
          </Button>
        )}
        {order.status === 'DRAFT' && can('ORDER_FINALISE') && (
          <Button
            onClick={() => finalise.mutate()}
            busy={finalise.isPending}
            disabled={itemLineCount(order.lines) === 0}
          >
            Ausstellen
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {finalise.error !== null && <ErrorNotice error={finalise.error} />}
        {print.error !== null && <ErrorNotice error={print.error} />}

        <OrderLines
          tenantId={tenantId}
          order={order}
          editable={editable}
          onAddProductLine={(line) => startLine(() => addProductLine.mutateAsync(line))}
          onUpdateProductLine={(lineNumber, line) =>
            startLine(() => updateProductLine.mutateAsync({ lineNumber, line }))
          }
          onAddFreeLine={(line) => startLine(() => addFreeLine.mutateAsync(line))}
          onUpdateFreeLine={(lineNumber, line) =>
            startLine(() => updateFreeLine.mutateAsync({ lineNumber, line }))
          }
          onAddStructureLine={(line) => startLine(() => addStructureLine.mutateAsync(line))}
          onUpdateStructureLine={(lineNumber, line) =>
            startLine(() => updateStructureLine.mutateAsync({ lineNumber, line }))
          }
          onMoveLine={(lineNumber, position) =>
            startLine(() => moveLine.mutateAsync({ lineNumber, position })).catch(() => undefined)
          }
          onRemoveLine={(lineNumber) =>
            startLine(() => removeLine.mutateAsync(lineNumber)).catch(() => undefined)
          }
          busy={lineBusy}
          error={lineError}
          readOnlyNote={
            readOnlyNote === undefined
              ? undefined
              : 'Zum Ändern der Positionen fehlt das Recht ORDER_WRITE.'
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-6 self-start">
            {/* Keyed by what is stored: the section holds what was typed, and that has to give
                way when a customer change rewrites language and currency underneath it. */}
            <OrderHeaderPanel
              key={headerKey(order)}
              tenantId={tenantId}
              base={base}
              document={order}
              editable={editable}
              readOnlyNote={readOnlyNote}
              onChanged={refresh}
            />
            <OrderTexts tenantId={tenantId} order={order} editable={editable} />
            <OrderPrintouts
              tenantId={tenantId}
              base={base}
              editable={editable}
              readOnlyNote={readOnlyNote}
              draft={order.status === 'DRAFT'}
            />
          </div>

          <div className="grid gap-6 self-start">
            <OrderPaymentPanel
              key={paymentKey(order)}
              tenantId={tenantId}
              base={base}
              document={order}
              editable={editable}
              readOnlyNote={readOnlyNote}
              onChanged={refresh}
            />
            <PartyPanel
              title="Empfänger"
              party={order.recipient}
              number={order.partnerNumber}
              status={order.status}
              action={
                editable ? (
                  <Button variant="secondary" onClick={() => setChangingPartner(true)}>
                    Kunde wechseln
                  </Button>
                ) : undefined
              }
            />
            <StatusTrail tenantId={tenantId} orderId={order.id} />
          </div>
        </div>
      </div>

      <ChangePartnerDialog
        tenantId={tenantId}
        base={base}
        open={changingPartner}
        onClose={() => setChangingPartner(false)}
        document={order}
        onChanged={refresh}
      />

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
 * Name and address as they stand on the document.
 *
 * <p>How long they stand there depends on the status, and the section says which of the two
 * it is: a draft follows the partner record, while issuing the document freezes the copy so
 * that it still reads the way it was sent, even after the customer moves (ADR-0040).
 */
function PartyPanel({
  title,
  party,
  number,
  status,
  action,
}: {
  title: string
  party?: DocumentParty
  number?: string
  /** Decides whether the address still follows the partner record. */
  status: DocumentStatus
  /** Control in the top right, for example "Kunde wechseln". */
  action?: ReactNode
}) {
  if (!party) {
    if (!action) return null
    return (
      <Panel title={title} action={action}>
        <p className="text-[13px] text-text-secondary">
          Für diesen Beleg ist keine Adresse festgehalten.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title={title}
      description={recipientNote(status)}
      action={action}
    >
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
          {/* Newest first: what happened last is what someone opening the mask wants to see.
              The API answers in the order it happened, which is the order an audit trail is
              stored in. */}
          {[...trail.data].reverse().map((entry, index) => (
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
