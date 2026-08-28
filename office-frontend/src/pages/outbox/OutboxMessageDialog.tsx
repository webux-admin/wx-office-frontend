import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Paperclip, RotateCcw } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { showFile } from '../../lib/files'
import { formatByteCount, formatDateTime } from '../../lib/format'
import {
  messageStatusLabel,
  messageStatusTone,
  outboxAttachmentUrl,
  outboxMessageKey,
  outboxMessagesUrl,
  OUTBOX_RIGHTS,
} from '../../lib/outbox'
import { salesDocumentFor } from '../../lib/salesDocument'
import type { DocumentCategory, OutboxMessage, OutboxSummary } from '../../lib/types'

/**
 * One mail as it was sent, or as it failed.
 *
 * <p>The three questions this box exists for: what went out, to whom, and — where nothing went
 * out — why not. The reason is shown in plain words rather than as a status, because the status
 * is what the list already showed.
 */
export function OutboxMessageDialog({
  message,
  tenantId,
  onClose,
}: {
  /** The row that was opened, `null` while the box is closed. */
  message: OutboxSummary | null
  tenantId: number
  onClose: () => void
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const maySend = can(OUTBOX_RIGHTS.send)
  const id = message?.id ?? 0

  // Only the row travels in the page answer; text, recipients and attachments are read when
  // somebody opens one. A list of two hundred mails would otherwise carry two hundred texts.
  const detail = useQuery({
    queryKey: outboxMessageKey(tenantId, id),
    queryFn: () => api.get<OutboxMessage>(`${outboxMessagesUrl(tenantId)}/${id}`),
    enabled: message !== null,
  })

  const attachment = useMutation({
    mutationFn: (attachmentId: number) =>
      api.file(outboxAttachmentUrl(tenantId, id, attachmentId)),
    onSuccess: showFile,
  })

  const resend = useMutation({
    mutationFn: () => api.post<void>(`${outboxMessagesUrl(tenantId)}/${id}/resend`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outbox-messages', tenantId] })
      void queryClient.invalidateQueries({ queryKey: outboxMessageKey(tenantId, id) })
      onClose()
    },
  })

  const full = detail.data
  const documentLink = full === undefined ? undefined : linkTo(full)

  return (
    <Dialog
      open={message !== null}
      onClose={onClose}
      wide
      title={message?.subject ?? ''}
      description={message === null ? undefined : formatDateTime(message.createdAt)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
          {/* Only on a failed one. On a sent one it stays off with the reason in its tooltip:
              sending again is a new mail, and the outbox is the record of what went out
              (backend ADR-0084). */}
          {maySend && (
            <Button
              onClick={() => resend.mutate()}
              busy={resend.isPending}
              disabled={message?.status !== 'FAILED'}
              title={
                message?.status === 'SENT'
                  ? 'Eine gesendete Nachricht geht nicht zweimal hinaus. Ein erneuter Versand wäre eine neue Mail.'
                  : undefined
              }
            >
              <RotateCcw size={15} aria-hidden />
              Erneut senden
            </Button>
          )}
        </>
      }
    >
      {detail.isPending && message !== null && <LoadingBlock />}
      {detail.error !== null && <ErrorNotice error={detail.error} />}
      {resend.error !== null && <ErrorNotice error={resend.error} />}

      {full !== undefined && (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={messageStatusTone(full.status)}>
              {messageStatusLabel(full.status)}
            </Badge>
            {full.attempts > 0 && (
              <span className="text-text-tertiary">
                {full.attempts} {full.attempts === 1 ? 'Versuch' : 'Versuche'}
              </span>
            )}
            {full.sentAt !== undefined && (
              <span className="text-text-secondary">gesendet {formatDateTime(full.sentAt)}</span>
            )}
          </div>

          {/* In plain words. The status says that it failed; this says what to fix. */}
          {full.lastError !== undefined && full.lastError !== '' && (
            <div className="rounded-[var(--radius-md)] bg-danger/8 p-3">
              <p className="text-[12px] font-medium text-danger">Grund</p>
              <p className="mt-1 break-words whitespace-pre-wrap text-text-primary">
                {full.lastError}
              </p>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[120px_1fr]">
            <Row label="Von">{full.senderAddress}</Row>
            <Row label="An">{full.to.join(', ')}</Row>
            {full.cc.length > 0 && <Row label="Kopie">{full.cc.join(', ')}</Row>}
            {full.bcc.length > 0 && <Row label="Blindkopie">{full.bcc.join(', ')}</Row>}
            {documentLink !== undefined && (
              <Row label="Beleg">
                <Link
                  to={documentLink.to}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  {documentLink.label}
                </Link>
              </Row>
            )}
          </dl>

          <div>
            <p className="text-[12px] font-medium text-text-secondary">Text</p>
            <p className="mt-1 rounded-[var(--radius-md)] bg-sunken p-3 whitespace-pre-wrap">
              {full.body}
            </p>
          </div>

          {full.attachments.length > 0 && (
            <div>
              <p className="text-[12px] font-medium text-text-secondary">Anhänge</p>
              <ul className="mt-1 space-y-1">
                {full.attachments.map((file) => (
                  <li key={file.id}>
                    {/* The bytes that went out, not a fresh rendering of the document. That is
                        what makes the outbox the proof of what a customer received. */}
                    <button
                      type="button"
                      onClick={() => attachment.mutate(file.id)}
                      className="inline-flex items-center gap-2 text-accent-text underline-offset-2 hover:underline"
                    >
                      <Paperclip size={14} aria-hidden />
                      {file.fileName}
                      <span className="text-text-tertiary">
                        {formatByteCount(file.byteCount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {attachment.error !== null && <ErrorNotice error={attachment.error} />}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-text-primary">{children}</dd>
    </>
  )
}

/**
 * Where the document of a mail can be looked at.
 *
 * <p>Only for a mail that came from a document, and only for a category with a mask of its
 * own: the Gutschrift has none yet, and a link into a screen that is not there is worse than
 * no link.
 *
 * @param message the mail
 * @returns route and wording, or undefined for a free mail and for a kind without a mask
 */
function linkTo(message: OutboxMessage): { to: string; label: string } | undefined {
  if (message.sourceModule !== 'DOCUMENT' || message.sourceId === undefined) return undefined
  const kind = salesDocumentFor(message.sourceKind as DocumentCategory)
  if (kind === undefined) return undefined
  return { to: `${kind.path}/${message.sourceId}`, label: `${kind.singular} öffnen` }
}
