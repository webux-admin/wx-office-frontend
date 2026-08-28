import { useRef, useState, type ReactNode } from 'react'
import { GitBranch, Mail } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { SplitButton } from '../components/SplitButton'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { TextAreaField } from '../components/TextAreaField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { showFile } from '../lib/files'
import { formatDate, formatDateTime } from '../lib/format'
import {
  booksStock,
  reservationReturnNotice,
  shortfallText,
  stockIssueNotice,
  stockReversalLabel,
} from '../lib/inventory'
import { openByLineId, openByLineNumber } from '../lib/openQuantity'
import { runsModule } from '../lib/modules'
import { originOf, originState } from '../lib/origin'
import {
  dispatchNote,
  documentMailMessagesKey,
  documentMailMessagesUrl,
  OUTBOX_MODULE,
  OUTBOX_PATH,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import {
  ORDER_KIND,
  offerTrackingKey,
  salesDocumentFor,
  salesDocumentKey,
  salesDocumentListKey,
  salesDocumentTrailKey,
  stockCheckKey,
  type SalesDocumentKind,
} from '../lib/salesDocument'
import type {
  DocumentChainEntry,
  DocumentParty,
  DocumentStatus,
  DocumentStatusEntry,
  DocumentType,
  OfferOutcome,
  OfferTracking,
  OutboxSummary,
  SalesDocument,
  StockReversalLine,
} from '../lib/types'
import { CatalogueSelect } from '../masterdata/CatalogueSelect'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { ChangePartnerDialog } from './document/ChangePartnerDialog'
import { SendDocumentDialog } from './document/SendDocumentDialog'
import { NewDocumentMask } from './document/NewDocumentMask'
import { DocumentHeaderPanel } from './document/DocumentHeaderPanel'
import { DocumentLines } from './document/DocumentLines'
import { DocumentDiscountPanel } from './document/DocumentDiscountPanel'
import { DocumentPaymentPanel } from './document/DocumentPaymentPanel'
import { DocumentChainPanel } from './document/DocumentChainPanel'
import { DocumentPrintouts } from './document/DocumentPrintouts'
import { OfferReminders } from './document/OfferReminders'
import { OfferTrackingPanel } from './document/OfferTrackingPanel'
import { TakeoverDialog } from './document/TakeoverDialog'
import { useOpenQuantities } from './document/useOpenQuantities'
import { useStockCheck } from './document/stockInfo'
import { headerKey, paymentKey } from './document/headerForm'
import { successorNotice } from './document/documentChain'
import { recipientNote } from './document/recipientNote'
import {
  itemLineCount,
  type FreeLine,
  type ProductLine,
  type StructureLine,
} from './document/lineForm'

/** The two registers of a mask whose kind is followed up (ADR-0010). */
type DocumentTab = 'beleg' | 'nachfassen' | 'zusammenhaenge'

/**
 * Reads the register a link asked the mask to open on.
 *
 * <p>Same route as the origin: the register is state of the screen, not of the address
 * (ADR-0005), so a link that means the follow-up names it in the router state. Every field
 * is checked rather than trusted, because history entries outlive versions of this code.
 */
function initialTabOf(state: unknown): DocumentTab {
  if (typeof state === 'object' && state !== null && 'tab' in state
    && state.tab === 'nachfassen') {
    return 'nachfassen'
  }
  return 'beleg'
}

/** What colour each dispatch state gets in the header. */
const DISPATCH_TONES: Record<'success' | 'danger' | 'neutral', string> = {
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-text-secondary',
}

/** Badge tone of each outcome of an issued offer. */
const OUTCOME_TONES: Record<OfferOutcome, 'accent' | 'success' | 'danger'> = {
  OPEN: 'accent',
  ACCEPTED: 'success',
  DECLINED: 'danger',
}

/**
 * One sales document: its positions, its texts and the way from draft to issued.
 *
 * <p>Offerte, Auftrag, Lieferschein and Rechnung share this mask. The kind carries what
 * differs between them — resource, rights and wording — so that four screens stay one screen.
 * A kind that is followed up gains a second register with the outcome, the win probability
 * and the reminders; the other kinds show no register strip at all.
 */
export function SalesDocumentPage({ kind }: { kind: SalesDocumentKind }) {
  return (
    <RequireTenant permission={kind.rights.read}>
      {(tenantId) => <DocumentLoader tenantId={tenantId} kind={kind} />}
    </RequireTenant>
  )
}

function DocumentLoader({ tenantId, kind }: { tenantId: number; kind: SalesDocumentKind }) {
  const { id } = useParams()

  // The kind belongs in the key. Without it the invoice mask would show the order that was
  // looked at before it, because both ask under the same number.
  const document = useQuery({
    queryKey: salesDocumentKey(kind, tenantId, id),
    queryFn: () => api.get<SalesDocument>(`/api/tenants/${tenantId}/${kind.resource}/${id}`),
    enabled: id !== 'neu',
  })

  if (id === 'neu') return <NewDocumentMask tenantId={tenantId} kind={kind} />
  if (document.isPending) return <LoadingBlock label={`${kind.singular} wird geladen`} />
  if (document.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={document.error} />
      </div>
    )
  }
  return (
    <DocumentMask
      tenantId={tenantId}
      kind={kind}
      document={document.data}
      refreshing={document.isFetching}
    />
  )
}

function DocumentMask({
  tenantId,
  kind,
  document,
  refreshing,
}: {
  tenantId: number
  kind: SalesDocumentKind
  document: SalesDocument
  /**
   * True while the document is being read again — which is what every change to it ends with.
   *
   * <p>A change to the positions is not over when the backend answers: the lines on screen
   * are still the ones from before it until the answer to the new read is in, and the backend
   * numbers them afresh on every change. Between the two the table would show position 3 as a
   * line that is about to become position 2.
   */
  refreshing: boolean
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const outcomeLabel = useCatalogueLabel(tenantId, 'offer-outcome')
  const { can, user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const locationState: unknown = useLocation().state
  // Falls back to the list of this kind when the mask was opened without naming a screen to
  // return to.
  const origin = originOf(locationState, { from: kind.path, label: kind.plural })

  const [cancelling, setCancelling] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [changingPartner, setChangingPartner] = useState(false)
  const [reason, setReason] = useState('')
  // Its own field and not the one above: the reason for a reversal has nothing to do with
  // the reason for taking a document back, and a leftover text in the other box invites
  // sending the wrong one.
  const [reopenReason, setReopenReason] = useState('')
  const [tab, setTab] = useState<DocumentTab>(() =>
    kind.tracking ? initialTabOf(locationState) : 'beleg',
  )
  const [askingToIssue, setAskingToIssue] = useState(false)
  const [sending, setSending] = useState(false)
  // What the mask says after a mail was queued. «In den Postausgang gelegt» and never
  // «gesendet»: the runner sends afterwards, and a message claiming more than happened is a
  // wrong message (backend ADR-0084).
  const [queued, setQueued] = useState(false)
  // The way back holds the focus, not the way on: a dialog that asks «trotzdem?» must not be
  // answered with a stray Enter.
  const backToMask = useRef<HTMLButtonElement>(null)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineNote, setDeclineNote] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)

  // The mask instance survives a route change between the categories, so a leftover
  // 'nachfassen' from an offer would blank an order. Clamped rather than reset, because a
  // reset would also throw away the register somebody deliberately opened.
  const activeTab: DocumentTab =
    tab === 'nachfassen' && !kind.tracking ? 'beleg' : tab

  const editable = document.status === 'DRAFT' && can(kind.rights.write)
  // Two reasons keep a section read-only, and they are not the same thing. An issued
  // document is finished; a draft without the permission is not, and saying so is the only
  // way the user learns why nothing can be typed.
  const readOnlyNote =
    document.status === 'DRAFT' && !can(kind.rights.write)
      ? `Zum Ändern fehlt das Recht ${kind.rights.write}.`
      : undefined
  const base = `/api/tenants/${tenantId}/${kind.resource}/${document.id}`

  // Loaded with the document, not with the register: the header warns about documents
  // written from this one, and a warning that only appears after a click is no warning.
  const chain = useQuery({
    queryKey: ['document-chain', tenantId, kind.resource, document.id],
    queryFn: () => api.get<DocumentChainEntry[]>(`${base}/related`),
  })
  const successors = successorNotice(chain.data)

  // What the document it was taken over from still has open, so a position entered for more
  // than that can be pointed out. Only while it is a draft: on an issued document nothing can
  // be corrected any more, and the hint would be a reproach without a way out.
  const openOfPredecessor = useOpenQuantities(
    tenantId,
    kind.resource,
    document.predecessorDocumentId,
    document.status === 'DRAFT',
  )
  // And what this document itself still has open, which is the question the sale asks of an
  // issued Auftrag: what is the customer still waiting for? The answer is about deliveries,
  // so it is the right to read Lieferscheine that decides whether the column appears.
  const deliveryNotes = salesDocumentFor('DELIVERY_NOTE')
  const showsOpenColumn =
    kind.category === 'ORDER' &&
    document.status === 'FINALISED' &&
    deliveryNotes !== undefined &&
    can(deliveryNotes.rights.read)
  const openOfOwnLines = useOpenQuantities(
    tenantId,
    deliveryNotes?.resource ?? '',
    document.id,
    showsOpenColumn,
  )

  // What issuing would be short of. A reading that books nothing, and only for a draft that
  // has something to issue — an issued document has already moved what it moves.
  const stockCheck = useStockCheck(
    tenantId,
    kind,
    document.id,
    document.status === 'DRAFT' && itemLineCount(document.lines) > 0,
  )
  // Read off the status and not off the query: react-query keeps the answer of a query that
  // has since been switched off, and the strip must never stand over an issued document — it
  // moved its stock already, and there is nothing left to warn about.
  const shortfalls =
    document.status === 'DRAFT' ? (stockCheck.data?.shortfalls ?? []) : []
  // What only warns. A shortfall the location refuses is not asked about: the backend turns
  // the issuing down, and its message is the honest one — the mask does not decide whether a
  // document may be issued.
  const warnings = shortfalls.filter((shortfall) => !shortfall.blocking)

  const refresh = () => {
    // Scoped by the kind, so that a saved invoice does not throw away the orders that were
    // loaded next to it.
    void queryClient.invalidateQueries({ queryKey: salesDocumentKey(kind, tenantId) })
    void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(kind, tenantId) })
    void queryClient.invalidateQueries({ queryKey: salesDocumentTrailKey(kind, tenantId) })
    // The figures behind the stock check are only true for the positions that were on screen
    // when they were read, so every change to them throws the check away.
    void queryClient.invalidateQueries({
      queryKey: stockCheckKey(kind, tenantId, document.id),
    })
    // The follow-up state hangs on the document: taking it back resets the outcome, and a
    // changed position moves the weighted amount. Cheaper to mark it stale once here than to
    // reason about which of the mutations above can touch it.
    if (kind.tracking) {
      void queryClient.invalidateQueries({ queryKey: offerTrackingKey(tenantId, document.id) })
    }
  }

  // Only a kind that is followed up asks; for the others the query never runs and the mask
  // stays what it was.
  const tracking = useQuery({
    queryKey: offerTrackingKey(tenantId, document.id),
    queryFn: () => api.get<OfferTracking>(`${base}/tracking`),
    enabled: kind.tracking,
  })
  const outcome = tracking.data?.outcome

  const setOutcome = useMutation({
    mutationFn: (body: { outcome: OfferOutcome; reasonCode?: string; note?: string }) =>
      api.put<OfferTracking>(`${base}/tracking/outcome`, body),
    onSuccess: () => {
      // The list shows the outcome as well, so the document caches go stale with it.
      refresh()
      setDeclining(false)
      setDeclineReason('')
      setDeclineNote('')
    },
  })

  // The kinds of the Auftrag, for handing an accepted offer over. Asked only while the
  // button that needs them is on screen, and only with the right the catalogue demands.
  const orderTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
    enabled:
      kind.tracking &&
      outcome === 'ACCEPTED' &&
      can(kind.rights.write) &&
      can(ORDER_KIND.rights.write) &&
      can('DOCUMENT_TYPE_READ'),
  })
  const activeOrderTypes = (orderTypes.data ?? []).filter(
    (type) => type.category === ORDER_KIND.category && type.active,
  )

  // The same way the list opens what it wrote: mark the order list stale, then walk into the
  // new draft. The way back leads to this offer, which is where the order came from.
  const openCreatedOrder = (created: SalesDocument) => {
    setCreatingOrder(false)
    void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(ORDER_KIND, tenantId) })
    void navigate(`${ORDER_KIND.path}/${created.id}`, {
      state: originState(
        `${kind.path}/${document.id}`,
        document.documentNumber ?? `Entwurf ${document.id}`,
      ),
    })
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
    onSuccess: () => {
      refresh()
      setAskingToIssue(false)
    },
  })

  /**
   * Issues the document, asking first where positions are not covered.
   *
   * <p>The check is read afresh on the click: somebody else may have delivered in the meantime,
   * and a question asked over figures from five minutes ago is worse than no question.
   *
   * <p><b>A failed check holds nobody up.</b> No permission to read the inventory, a refusal, a
   * broken connection — all of them issue without a second step. Binding is the check the
   * backend runs while issuing; this one is the warning in front of it, not its replacement.
   */
  const issue = async () => {
    if (!stockCheck.isEnabled) {
      finalise.mutate()
      return
    }
    const fresh = await stockCheck.refetch()
    const found = fresh.data?.shortfalls ?? []
    // Only what warns. A blocking shortfall goes to the backend, which refuses it with the
    // sentence that says what is really there.
    if (fresh.isError || found.every((shortfall) => shortfall.blocking)) {
      finalise.mutate()
      return
    }
    setAskingToIssue(true)
  }

  const cancel = useMutation({
    mutationFn: () => api.post<SalesDocument>(`${base}/cancel`, { reason: reason.trim() }),
    onSuccess: () => {
      refresh()
      setCancelling(false)
    },
  })

  // What taking the document back would put into stock again. A read that books nothing, and
  // only while the dialog is open: automatic is not the same as silent, and the goods may have
  // left the building long ago (ADR-0064 of the backend).
  const stockReversal = useQuery({
    queryKey: [...salesDocumentKey(kind, tenantId, document.id), 'stock-reversal'],
    queryFn: () => api.get<StockReversalLine[]>(`${base}/stock-reversal`),
    enabled: reopening && booksStock(document.stockEffect),
  })

  // Takes the document back to a draft. It keeps its number and is issued under the same one
  // again, so nothing is lost and no gap is torn (ADR-0046).
  const reopen = useMutation({
    mutationFn: () =>
      api.post<SalesDocument>(`${base}/reopen`, { reason: reopenReason.trim() }),
    onSuccess: () => {
      refresh()
      setReopening(false)
      setReopenReason('')
    },
  })

  // Both have to agree: the tenant runs the outbox, and this session may send. The backend
  // refuses either way — 409 for the module, 403 for the right — so this only tidies the mask.
  const runsOutbox = runsModule(user?.tenants, user?.activeTenantId, OUTBOX_MODULE)
  const sendable = runsOutbox && can(OUTBOX_RIGHTS.send)

  // What already went out about this document. Read from the outbox and never from a column on
  // the document: two places for the same fact drift apart on the second send (backend
  // ADR-0085). Only for an issued one — a draft cannot have been sent.
  const dispatched = useQuery({
    queryKey: documentMailMessagesKey(tenantId, kind.resource, document.id),
    queryFn: () =>
      api.get<OutboxSummary[]>(documentMailMessagesUrl(tenantId, kind.resource, document.id)),
    enabled: runsOutbox && can(OUTBOX_RIGHTS.read) && document.status !== 'DRAFT',
  })
  const dispatchLine = dispatchNote(dispatched.data ?? [])

  // A draft renders on the spot and comes back with a watermark; an issued document hands out
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
  // The read that follows a change counts as part of it. Otherwise the controls of the table
  // come alive again over the numbering from before the change, for as long as that read
  // takes — long enough to open a dialog on a position that is about to be another line.
  const lineBusy = lineMutations.some((mutation) => mutation.isPending) || refreshing
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
        title={document.documentNumber ?? `Entwurf ${document.id}`}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {/* An issued offer wears its outcome instead of the bare status: «Finalisiert»
                says nothing about the question this mask is opened for. Cancelled and draft
                read as everywhere else. Only the open offer can be expired — a mark wins
                over the calendar, and the backend already answers accepted and declined
                offers with expired false. */}
            {kind.tracking && document.status === 'FINALISED' && outcome !== undefined ? (
              outcome === 'OPEN' && tracking.data?.expired ? (
                <Badge tone="danger">{outcomeLabel('EXPIRED')}</Badge>
              ) : (
                <Badge tone={OUTCOME_TONES[outcome]}>{outcomeLabel(outcome)}</Badge>
              )
            ) : (
              <Badge
                tone={
                  document.status === 'CANCELLED'
                    ? 'danger'
                    : document.status === 'FINALISED'
                      ? 'accent'
                      : 'muted'
                }
              >
                {statusLabel(document.status)}
              </Badge>
            )}
            <span>{formatDate(document.documentDate)}</span>
            <span className="text-text-tertiary">·</span>
            <span>{document.recipient?.name ?? `Kunde ${document.partnerId}`}</span>
            {/* The one fact a document mask hid until now: that somebody already wrote on
                from it. It decides whether this document may still be taken back, so it
                belongs next to the status and not one register away. */}
            {successors !== null && (
              <button
                type="button"
                onClick={() => setTab('zusammenhaenge')}
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-sunken px-2 py-0.5 text-[12px] text-text-primary transition-colors hover:text-accent-text"
              >
                <GitBranch size={13} aria-hidden />
                {successors}
              </button>
            )}
            {/* Whether this document already went out, and to which address. Beside the status
                because that is the same kind of fact — and a link, because the whole story
                (text, attachment, reason of a failure) stands in the outbox. */}
            {dispatchLine !== null && (
              <Link
                to={OUTBOX_PATH}
                className={`inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline ${DISPATCH_TONES[dispatchLine.tone]}`}
              >
                <Mail size={13} aria-hidden />
                {dispatchLine.text}
              </Link>
            )}
          </span>
        }
      >
        {/* A draft that has already been issued once carries its number, and a number that
            belongs to nothing is the gap the series exists to avoid. */}
        {document.status === 'DRAFT' &&
          document.documentNumber === undefined &&
          can(kind.rights.write) && (
            <Button variant="secondary" onClick={() => setDeleting(true)}>
              Entwurf löschen
            </Button>
          )}
        {/* Sending is the second way to hand the same document out, so it sits behind the
            arrow of the printing button rather than beside it. A sixth button in this row
            would make life hard for the five that are already here (frontend ADR-0020).

            Without the module the entry is gone altogether, not greyed out: a switched-off
            outbox is a setting of the tenant, not a state of this document, and a greyed
            entry invites a question this mask cannot answer. */}
        {sendable ? (
          <SplitButton
            onClick={() => print.mutate()}
            busy={print.isPending}
            menuLabel={`Weitere Wege, ${kind.gender === 'feminine' ? 'die' : 'den'} ${kind.singular} herauszugeben`}
            actions={[
              {
                id: 'send',
                label: 'Als E-Mail senden',
                icon: <Mail size={15} aria-hidden />,
                // Greyed out with the reason, not hidden: a button that disappears explains
                // nothing, and «why can I not send this?» has an answer here.
                disabled: document.status === 'DRAFT',
                hint:
                  document.status === 'DRAFT'
                    ? 'Ein Entwurf kann nicht versendet werden'
                    : undefined,
                onSelect: () => setSending(true),
              },
            ]}
          >
            {document.status === 'DRAFT' ? 'Vorschau' : 'Drucken'}
          </SplitButton>
        ) : (
          <Button variant="secondary" onClick={() => print.mutate()} busy={print.isPending}>
            {document.status === 'DRAFT' ? 'Vorschau' : 'Drucken'}
          </Button>
        )}
        {document.status === 'FINALISED' && can(kind.rights.reopen) && (
          <Button variant="secondary" onClick={() => setReopening(true)}>
            Zurückstellen
          </Button>
        )}
        {document.status === 'FINALISED' && can(kind.rights.cancel) && (
          <Button variant="secondary" onClick={() => setCancelling(true)}>
            Stornieren
          </Button>
        )}
        {/* The mark is undone the way it was set: one click, no dialog. The contract allows
            it in every status, so a cancelled offer can shed a mark that no longer holds. */}
        {kind.tracking &&
          can(kind.rights.write) &&
          (outcome === 'ACCEPTED' || outcome === 'DECLINED') && (
            <Button
              variant="secondary"
              onClick={() => setOutcome.mutate({ outcome: 'OPEN' })}
              busy={setOutcome.isPending}
            >
              Markierung aufheben
            </Button>
          )}
        {kind.tracking &&
          outcome === 'ACCEPTED' &&
          can(kind.rights.write) &&
          can(ORDER_KIND.rights.write) && (
            <Button variant="secondary" onClick={() => setCreatingOrder(true)}>
              Auftrag erstellen…
            </Button>
          )}
        {/* Accepting is the everyday answer and costs one click, like issuing. Declining
            opens a small dialog, because the reason is worth a moment. */}
        {kind.tracking &&
          document.status === 'FINALISED' &&
          outcome === 'OPEN' &&
          can(kind.rights.write) && (
            <>
              {/* Filled like «Angenommen» next to it: the two are the same decision with
                  opposite answers, and one of them looking optional would tilt the choice. */}
              <Button
                variant="danger"
                onClick={() => {
                  setOutcome.reset()
                  setDeclining(true)
                }}
              >
                Abgelehnt
              </Button>
              <Button
                onClick={() => setOutcome.mutate({ outcome: 'ACCEPTED' })}
                busy={setOutcome.isPending}
              >
                Angenommen
              </Button>
            </>
          )}
        {document.status === 'DRAFT' && can(kind.rights.finalise) && (
          <Button
            onClick={() => void issue()}
            busy={finalise.isPending || stockCheck.isRefetching}
            disabled={itemLineCount(document.lines) === 0}
          >
            Ausstellen
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {/* Said out loud, because sending is the one action of this mask whose result is not
            visible on it. `aria-live` so a screen reader hears it too. */}
        <div aria-live="polite">
          {queued && (
            <p className="mb-6 text-[13px] text-success">
              Die E-Mail wurde in den Postausgang gelegt.{' '}
              <Link to={OUTBOX_PATH} className="underline underline-offset-2">
                Postausgang öffnen
              </Link>
            </p>
          )}
        </div>

        {/* Only where the button really moves stock. A permanent hint without content is the
            second worst mistake such a mask can make; the invisible rule is the worst. */}
        {document.status === 'DRAFT'
          && can(kind.rights.finalise)
          && stockIssueNotice(document.stockEffect, document.stockLocationName) !== '' && (
            <p className="mb-6 text-[13px] text-text-secondary">
              {stockIssueNotice(document.stockEffect, document.stockLocationName)}
            </p>
          )}

        {((finalise.error !== null && !askingToIssue) ||
          print.error !== null ||
          (setOutcome.error !== null && !declining)) && (
          <div className="mb-6 grid gap-4">
            {/* While the question about the stock is open it reports the refusal itself. */}
            {finalise.error !== null && !askingToIssue && (
              <ErrorNotice error={finalise.error} />
            )}
            {print.error !== null && <ErrorNotice error={print.error} />}
            {/* While the decline dialog is open it reports the failure itself. */}
            {setOutcome.error !== null && !declining && (
              <ErrorNotice error={setOutcome.error} />
            )}
          </div>
        )}

        <Tabs<DocumentTab>
          tabs={[
            { id: 'beleg', label: 'Beleg' },
            ...(kind.tracking
              ? [{ id: 'nachfassen' as const, label: 'Nachfassen' }]
              : []),
            { id: 'zusammenhaenge', label: 'Zusammenhänge' },
          ]}
          active={activeTab}
          onChange={setTab}
          label="Register"
        />

        {activeTab === 'beleg' && (
        <div className="grid gap-6">
        <DocumentLines
          tenantId={tenantId}
          kind={kind}
          document={document}
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
          openOfOwnLines={
            openOfOwnLines.data === undefined
              ? undefined
              : openByLineNumber(openOfOwnLines.data)
          }
          openOfPredecessorLines={
            openOfPredecessor.data === undefined
              ? undefined
              : openByLineId(openOfPredecessor.data)
          }
          shortfalls={shortfalls}
          busy={lineBusy}
          error={lineError}
          readOnlyNote={
            readOnlyNote === undefined
              ? undefined
              : `Zum Ändern der Positionen fehlt das Recht ${kind.rights.write}.`
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid gap-6 self-start">
            {/* Keyed by what is stored: the section holds what was typed, and that has to give
                way when a customer change rewrites language and currency underneath it. */}
            <DocumentHeaderPanel
              key={headerKey(document)}
              tenantId={tenantId}
              base={base}
              document={document}
              editable={editable}
              validity={kind.tracking}
              readOnlyNote={readOnlyNote}
              onChanged={refresh}
            />
            <DocumentTexts
              tenantId={tenantId}
              kind={kind}
              document={document}
              editable={editable}
            />
            <DocumentPrintouts
              tenantId={tenantId}
              base={base}
              editable={editable}
              readOnlyNote={readOnlyNote}
              draft={document.status === 'DRAFT'}
            />
          </div>

          <div className="grid gap-6 self-start">
            {/* Keyed by what is stored: the panel holds what was typed, and that has to give
                way when a save or a change to the positions rewrites it underneath. */}
            <DocumentDiscountPanel
              key={`${document.discountPercent ?? ''}-${document.discountAmount ?? ''}`}
              base={base}
              document={document}
              editable={editable}
              readOnlyNote={readOnlyNote}
              onChanged={refresh}
            />
            <DocumentPaymentPanel
              key={paymentKey(document)}
              tenantId={tenantId}
              base={base}
              document={document}
              editable={editable}
              readOnlyNote={readOnlyNote}
              onChanged={refresh}
            />
            <PartyPanel
              title="Empfänger"
              party={document.recipient}
              number={document.partnerNumber}
              status={document.status}
              action={
                editable ? (
                  <Button variant="secondary" onClick={() => setChangingPartner(true)}>
                    Kunde wechseln
                  </Button>
                ) : undefined
              }
            />
            <StatusTrail tenantId={tenantId} kind={kind} documentId={document.id} />
          </div>
        </div>
        </div>
        )}

        {kind.tracking &&
          activeTab === 'nachfassen' &&
          (tracking.isPending ? (
            <LoadingBlock label="Nachfassen wird geladen" />
          ) : tracking.error !== null ? (
            <ErrorNotice error={tracking.error} />
          ) : tracking.data !== undefined ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="grid gap-6 self-start">
                {/* Keyed by what is stored, like the header sections: what was typed has to
                    give way when a save or another user rewrites the state underneath it. */}
                <OfferTrackingPanel
                  key={`${tracking.data.outcome}-${tracking.data.winProbability ?? ''}`}
                  tenantId={tenantId}
                  base={base}
                  tracking={tracking.data}
                  currency={document.currency}
                  editable={
                    tracking.data.outcome === 'OPEN' &&
                    document.status !== 'CANCELLED' &&
                    can(kind.rights.write)
                  }
                  readOnlyNote={
                    can(kind.rights.write)
                      ? undefined
                      : `Zum Ändern fehlt das Recht ${kind.rights.write}.`
                  }
                  onChanged={refresh}
                />
              </div>
              <div className="grid gap-6 self-start">
                <OfferReminders
                  tenantId={tenantId}
                  base={base}
                  documentId={document.id}
                  mayWrite={can(kind.rights.write)}
                  cancelled={document.status === 'CANCELLED'}
                  readOnlyNote={
                    can(kind.rights.write)
                      ? undefined
                      : `Zum Ändern fehlt das Recht ${kind.rights.write}.`
                  }
                />
              </div>
            </div>
          ) : null)}

        {activeTab === 'zusammenhaenge' && (
          <DocumentChainPanel
            chain={chain.data ?? []}
            loading={chain.isPending}
            error={chain.error}
            currentId={document.id}
            backTo={`${kind.path}/${document.id}`}
            backLabel={document.documentNumber ?? kind.singular}
          />
        )}
      </div>

      {sendable && (
        <SendDocumentDialog
          open={sending}
          onClose={() => setSending(false)}
          onQueued={() => setQueued(true)}
          tenantId={tenantId}
          kind={kind}
          documentId={document.id}
        />
      )}

      <ChangePartnerDialog
        tenantId={tenantId}
        base={base}
        open={changingPartner}
        onClose={() => setChangingPartner(false)}
        document={document}
        onChanged={refresh}
      />

      {/* The question, not the decision. Whoever confirms issues, and the backend still has the
          last word — there is no flag anywhere that skips its check. */}
      <Dialog
        open={askingToIssue}
        onClose={() => setAskingToIssue(false)}
        title={`${kind.singular} ausstellen`}
        description="Der Bestand reicht für einzelne Positionen nicht."
        initialFocus={backToMask}
        footer={
          <>
            <Button
              ref={backToMask}
              variant="secondary"
              onClick={() => setAskingToIssue(false)}
            >
              Zurück zur Maske
            </Button>
            <Button onClick={() => finalise.mutate()} busy={finalise.isPending}>
              Trotzdem ausstellen
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-text-secondary">
          {warnings.length === 1
            ? '1 Position ist nicht gedeckt. Trotzdem ausstellen?'
            : `${warnings.length} Positionen sind nicht gedeckt. Trotzdem ausstellen?`}
        </p>
        <ul className="grid gap-1">
          {warnings.map((shortfall) => (
            <li key={shortfall.productId} className="text-[13px] text-text-primary">
              {shortfallText(shortfall)}
            </li>
          ))}
        </ul>
        {finalise.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={finalise.error} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={reopening}
        onClose={() => setReopening(false)}
        title={`${kind.singular} zurückstellen`}
        description="Der Beleg wird wieder zum Entwurf und lässt sich ändern."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopening(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => reopen.mutate()}
              busy={reopen.isPending}
              disabled={reopenReason.trim() === ''}
            >
              Zurückstellen
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[13px] text-text-secondary">
          Die Belegnummer {document.documentNumber} bleibt auf dem Beleg und wird beim erneuten
          Ausstellen wieder verwendet. Das bisher ausgestellte PDF bleibt im Archiv.
        </p>
        {booksStock(document.stockEffect) && (stockReversal.data ?? []).length > 0 && (
          <div className="mb-4 text-[13px] text-text-secondary">
            <p>
              Dieser Beleg hat Bestand abgebucht. Beim Zurückstellen wird zurückgebucht:
            </p>
            <ul className="mt-2 grid gap-1">
              {(stockReversal.data ?? []).map((line, index) => (
                <li key={index} className="font-mono text-[12px] text-text-primary">
                  {stockReversalLabel(line)}
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Hat die Ware das Haus bereits verlassen, zeigt das Lager bis zum erneuten
              Ausstellen mehr Bestand, als im Regal liegt.
            </p>
          </div>
        )}
        {/* The half nobody expects: the goods coming back is obvious, the reservation of the
            order behind it going back to open is not. */}
        {reservationReturnNotice(document.stockEffect) !== '' && (
          <p className="mb-4 text-[13px] text-text-secondary">
            {reservationReturnNotice(document.stockEffect)}
          </p>
        )}
        <TextField
          label="Grund"
          value={reopenReason}
          onChange={(event) => setReopenReason(event.target.value)}
          maxLength={200}
          hint="Wird im Verlauf festgehalten und bleibt dort."
        />
        {reopen.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={reopen.error} />
          </div>
        )}
      </Dialog>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`${kind.singular} stornieren`}
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
        {booksStock(document.stockEffect) && (
          <p className="mb-4 text-[13px] text-text-secondary">
            Der Storno bucht den Bestand zurück. Er tut das über den Gegenbeleg, also genau
            einmal.
          </p>
        )}
        {reservationReturnNotice(document.stockEffect) !== '' && (
          <p className="mb-4 text-[13px] text-text-secondary">
            {reservationReturnNotice(document.stockEffect)}
          </p>
        )}
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

      {kind.tracking && (
        <Dialog
          open={declining}
          onClose={() => setDeclining(false)}
          title={`${kind.singular} als abgelehnt markieren`}
          description="Grund und Notiz sind freiwillig und bleiben an der Offerte."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeclining(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() =>
                  setOutcome.mutate({
                    outcome: 'DECLINED',
                    reasonCode: declineReason === '' ? undefined : declineReason,
                    note: declineNote.trim() === '' ? undefined : declineNote.trim(),
                  })
                }
                busy={setOutcome.isPending}
              >
                Als abgelehnt markieren
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <CatalogueSelect
              tenantId={tenantId}
              catalogue="offer-decline-reason"
              label="Grund"
              value={declineReason}
              onChange={setDeclineReason}
              emptyLabel="Ohne Grund"
            />
            <TextField
              label="Notiz"
              value={declineNote}
              onChange={(event) => setDeclineNote(event.target.value)}
              maxLength={255}
              hint="Bleibt an der Offerte stehen, bis die Markierung aufgehoben wird."
            />
            {setOutcome.error !== null && <ErrorNotice error={setOutcome.error} />}
          </div>
        </Dialog>
      )}

      {kind.tracking && (
        <TakeoverDialog
          tenantId={tenantId}
          kind={ORDER_KIND}
          open={creatingOrder}
          onClose={() => setCreatingOrder(false)}
          documentTypes={activeOrderTypes}
          preselectedSourceId={document.id}
          onCreated={openCreatedOrder}
        />
      )}
    </>
  )
}

/** Header text, footer text and the reference of the customer. */
function DocumentTexts({
  tenantId,
  kind,
  document,
  editable,
}: {
  tenantId: number
  kind: SalesDocumentKind
  document: SalesDocument
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const [headerText, setHeaderText] = useState(document.headerText ?? '')
  const [footerText, setFooterText] = useState(document.footerText ?? '')
  const [reference, setReference] = useState(document.reference ?? '')

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`/api/tenants/${tenantId}/${kind.resource}/${document.id}/texts`, {
        headerText: headerText.trim() || undefined,
        footerText: footerText.trim() || undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: salesDocumentKey(kind, tenantId) }),
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
function StatusTrail({
  tenantId,
  kind,
  documentId,
}: {
  tenantId: number
  kind: SalesDocumentKind
  documentId: number
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const trail = useQuery({
    queryKey: salesDocumentTrailKey(kind, tenantId, documentId),
    queryFn: () =>
      api.get<DocumentStatusEntry[]>(
        `/api/tenants/${tenantId}/${kind.resource}/${documentId}/status-trail`,
      ),
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
