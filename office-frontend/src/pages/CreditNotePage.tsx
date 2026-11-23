import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { FormMask } from '../components/FormMask'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { creditableKey, creditNoteUrl, invoiceCreditNotesKey } from '../lib/creditNote'
import { showFile } from '../lib/files'
import { formatDate } from '../lib/format'
import { openItemsKey } from '../lib/openItem'
import { originOf, originState } from '../lib/origin'
import {
  CREDIT_NOTE_KIND,
  receivableKey,
  salesDocumentFor,
  salesDocumentKey,
  salesDocumentTrailKey,
} from '../lib/salesDocument'
import type { DocumentChainEntry, SalesDocument } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { CreditNoteDialog } from './document/CreditNoteDialog'
import { DocumentChainPanel } from './document/DocumentChainPanel'
import { DocumentTexts, PartyPanel, StatusTrail } from './document/DocumentPageParts'
import { LinesTable } from './document/LinesTable'

type CreditNoteTab = 'beleg' | 'zusammenhaenge'

const KIND = CREDIT_NOTE_KIND

/**
 * The mask of one Gutschrift, under `/gutschriften/:id`.
 *
 * <p>Reached from its invoice and never from a list: a Gutschrift begins with the invoice it
 * credits (backend ADR-0047, ADR-0155). The way back leads there, unless the mask was opened
 * from somewhere else.
 *
 * <p>Smaller than the mask of the four kinds on purpose. The parties, the currency and the
 * rates come from the invoice and cannot be changed here; a draft is rewritten as a whole in the
 * same dialog that wrote it. What is the same — texts, trail, chain, printing, issuing, the
 * Storno — is the same code.
 */
export function CreditNotePage() {
  return (
    <RequireTenant permission={KIND.rights.read}>
      {(tenantId) => <CreditNoteLoader tenantId={tenantId} />}
    </RequireTenant>
  )
}

function CreditNoteLoader({ tenantId }: { tenantId: number }) {
  const { id } = useParams()
  const creditNote = useQuery({
    queryKey: salesDocumentKey(KIND, tenantId, id),
    queryFn: () => api.get<SalesDocument>(creditNoteUrl(tenantId, id ?? '')),
  })

  if (creditNote.isPending) return <LoadingBlock label="Gutschrift wird geladen" />
  if (creditNote.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={creditNote.error} />
      </div>
    )
  }
  return <CreditNoteMask tenantId={tenantId} creditNote={creditNote.data} />
}

function CreditNoteMask({ tenantId, creditNote }: { tenantId: number; creditNote: SalesDocument }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const invoiceKind = salesDocumentFor('INVOICE')
  const invoiceId = creditNote.creditedDocumentId
  const invoicePath = invoiceKind !== undefined && invoiceId !== undefined
    ? `${invoiceKind.path}/${invoiceId}`
    : undefined
  const origin = originOf(useLocation().state, {
    from: invoicePath ?? '/',
    label: creditNote.creditedDocumentNumber ?? 'Rechnung',
  })

  const [tab, setTab] = useState<CreditNoteTab>('beleg')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [textsDirty, setTextsDirty] = useState(false)

  const base = creditNoteUrl(tenantId, creditNote.id)
  const editable = creditNote.status === 'DRAFT' && can(KIND.rights.write)
  const own = `${KIND.path}/${creditNote.id}`
  const title = creditNote.documentNumber === undefined
    ? 'Gutschrift (Entwurf)'
    : `Gutschrift ${creditNote.documentNumber}`

  const chain = useQuery({
    queryKey: [...salesDocumentKey(KIND, tenantId, creditNote.id), 'related'],
    queryFn: () => api.get<DocumentChainEntry[]>(`${base}/related`),
    enabled: tab === 'zusammenhaenge',
  })

  /**
   * Issuing and reversing change the invoice too: its open item, its register of Gutschriften
   * and what it still has to give. All of that is read again, not worked out here.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: salesDocumentKey(KIND, tenantId) })
    void queryClient.invalidateQueries({ queryKey: salesDocumentTrailKey(KIND, tenantId) })
    void queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: creditableKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: openItemsKey(tenantId) })
    if (invoiceKind !== undefined) {
      void queryClient.invalidateQueries({ queryKey: receivableKey(invoiceKind, tenantId) })
      void queryClient.invalidateQueries({ queryKey: salesDocumentKey(invoiceKind, tenantId) })
    }
  }

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
      void navigate(origin.from, { replace: true })
    },
  })

  // A draft renders on the spot and comes back with a watermark; an issued Gutschrift hands
  // out the PDF that was archived when it was issued.
  const print = useMutation({
    mutationFn: () => api.file(`${base}/pdf`),
    onSuccess: showFile,
  })

  return (
    <FormMask<CreditNoteTab>
      title={title}
      back={{ to: origin.from, label: origin.label }}
      dirty={textsDirty}
      tabs={{
        items: [
          { id: 'beleg', label: 'Beleg' },
          { id: 'zusammenhaenge', label: 'Zusammenhänge' },
        ],
        active: tab,
        onChange: setTab,
      }}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={creditNote.status === 'CANCELLED' ? 'danger' : 'neutral'}>
            {statusLabel(creditNote.status)}
          </Badge>
          <span className="text-small text-text-secondary">
            {formatDate(creditNote.documentDate)}
          </span>
          {creditNote.creditedDocumentNumber !== undefined && (
            <span className="text-small text-text-secondary">
              Gutschrift zu{' '}
              {invoicePath === undefined ? (
                `Rechnung ${creditNote.creditedDocumentNumber}`
              ) : (
                <Link
                  to={invoicePath}
                  state={originState(own, title)}
                  className="underline-offset-2 hover:underline"
                >
                  Rechnung {creditNote.creditedDocumentNumber}
                </Link>
              )}{' '}
              vom {formatDate(creditNote.creditedDocumentDate)}
            </span>
          )}
        </span>
      }
      actions={
        <>
          {creditNote.status === 'DRAFT' && creditNote.documentNumber === undefined
            && can(KIND.rights.write) && (
              <Button variant="secondary" onClick={() => setDeleting(true)}>
                Entwurf löschen
              </Button>
            )}
          {/* The dialog reads `creditable` of the invoice, and that endpoint asks for the read
              right of the invoice as well. Without it the button would open a 403. */}
          {editable && invoiceId !== undefined && invoiceKind !== undefined
            && can(invoiceKind.rights.read) && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Positionen bearbeiten…
            </Button>
          )}
          <Button variant="secondary" onClick={() => print.mutate()} busy={print.isPending}>
            {creditNote.status === 'DRAFT' ? 'Vorschau' : 'Drucken'}
          </Button>
          {creditNote.status === 'FINALISED' && can(KIND.rights.cancel) && (
            <Button
              variant="secondary"
              onClick={() => {
                cancel.reset()
                setReason('')
                setCancelling(true)
              }}
            >
              Stornieren
            </Button>
          )}
          {creditNote.status === 'DRAFT' && can(KIND.rights.finalise) && (
            <Button onClick={() => finalise.mutate()} busy={finalise.isPending}>
              Ausstellen
            </Button>
          )}
        </>
      }
    >
      {(finalise.error !== null || print.error !== null) && (
        <div className="mb-6 grid gap-4" aria-live="polite">
          {finalise.error !== null && <ErrorNotice error={finalise.error} />}
          {print.error !== null && <ErrorNotice error={print.error} />}
        </div>
      )}

      {tab === 'beleg' && (
        <div className="grid gap-6">
          <Panel title="Positionen" padded={false}>
            <LinesTable
              tenantId={tenantId}
              document={creditNote}
              editable={false}
              busy={false}
              onEdit={() => undefined}
              onMove={() => undefined}
              onRemove={() => undefined}
            />
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-6 self-start">
              <DocumentTexts
                tenantId={tenantId}
                kind={KIND}
                document={creditNote}
                editable={editable}
                onDirtyChange={setTextsDirty}
              />
            </div>
            <div className="grid gap-6 self-start">
              <PartyPanel
                title="Empfänger"
                party={creditNote.recipient}
                number={creditNote.partnerNumber}
                status={creditNote.status}
              />
              <StatusTrail tenantId={tenantId} kind={KIND} documentId={creditNote.id} />
            </div>
          </div>
        </div>
      )}

      {tab === 'zusammenhaenge' && (
        <DocumentChainPanel
          chain={chain.data ?? []}
          loading={chain.isPending}
          error={chain.error}
          currentId={creditNote.id}
          backTo={own}
          backLabel={title}
        />
      )}

      {invoiceId !== undefined && (
        <CreditNoteDialog
          tenantId={tenantId}
          invoiceId={invoiceId}
          open={editing}
          onClose={() => setEditing(false)}
          draft={creditNote}
          onSaved={() => {
            setEditing(false)
            refresh()
          }}
        />
      )}

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Gutschrift stornieren"
        description="Ein Gegenbeleg hebt die Gutschrift auf; der offene Posten der Rechnung steigt wieder um ihren Betrag."
        onSubmit={reason.trim() === '' || cancel.isPending ? undefined : () => cancel.mutate()}
        footer={
          <>
            <DialogCancelButton />
            <Button
              onClick={() => cancel.mutate()}
              busy={cancel.isPending}
              disabled={reason.trim() === ''}
              shortcut
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
          required
          tooltip="Wird im Verlauf festgehalten und bleibt dort."
        />
        {cancel.error !== null && (
          <div className="mt-4" aria-live="polite">
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
            <DialogCancelButton />
            <Button variant="danger" onClick={() => remove.mutate()} busy={remove.isPending}>
              Löschen
            </Button>
          </>
        }
      >
        {remove.error !== null ? (
          <ErrorNotice error={remove.error} />
        ) : (
          <p className="text-body text-text-secondary">
            Die Gutschrift wird gelöscht. Die Rechnung bleibt, wie sie ist.
          </p>
        )}
      </Dialog>
    </FormMask>
  )
}
