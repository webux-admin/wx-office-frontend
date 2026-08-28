import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Paperclip } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock, WarningNotice } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api, ApiError } from '../../lib/api'
import { formatByteCount } from '../../lib/format'
import {
  documentMailPreviewKey,
  documentMailUrl,
  OUTBOX_ACCOUNT_PATH,
  OUTBOX_RIGHTS,
  splitAddresses,
} from '../../lib/outbox'
import type { SalesDocumentKind } from '../../lib/salesDocument'
import type { DocumentMailPreview, OutboxMessage } from '../../lib/types'

/** The mail as it stands in the box, once somebody has typed in it. */
type Draft = {
  to: string
  cc: string
  subject: string
  body: string
  copyToSender: boolean
}

/**
 * Sends one document as a mail, after showing what would go out.
 *
 * <p>Not a «really send?» box: a mail to a customer cannot be taken back, so what it shows is
 * the mail itself — recipient, subject, text and the attachment with its name and size, all of
 * it changeable. Everything comes from the preview endpoint, which composes exactly what the
 * send composes (backend ADR-0085).
 *
 * <p>What is changed here changes <b>the mail</b>, never the document. The address frozen on
 * the document stays what it is (backend ADR-0019).
 */
export function SendDocumentDialog({
  open,
  onClose,
  onQueued,
  tenantId,
  kind,
  documentId,
}: {
  open: boolean
  onClose: () => void
  /** Called once the mail is in the queue, so the mask can say so. */
  onQueued: () => void
  tenantId: number
  kind: SalesDocumentKind
  documentId: number
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(OUTBOX_RIGHTS.configure)

  // Null until somebody types. The fields are drawn from the preview until then, so the box
  // needs no effect to fill itself and no second copy of the answer to fall out of step with.
  const [draft, setDraft] = useState<Draft | null>(null)
  const recipientField = useRef<HTMLInputElement>(null)

  const preview = useQuery({
    queryKey: documentMailPreviewKey(tenantId, kind.resource, documentId),
    queryFn: () =>
      api.get<DocumentMailPreview>(
        `${documentMailUrl(tenantId, kind.resource, documentId)}/preview`,
      ),
    enabled: open,
  })

  const data = preview.data
  const typed: Draft = draft ?? {
    to: data?.to.join(', ') ?? '',
    cc: '',
    subject: data?.subject ?? '',
    body: data?.body ?? '',
    copyToSender: false,
  }
  const edit = (change: Partial<Draft>) => setDraft({ ...typed, ...change })

  /** Closes and forgets what was typed, so the next opening starts from the preview again. */
  const close = () => {
    setDraft(null)
    onClose()
  }

  const send = useMutation({
    mutationFn: () =>
      api.post<OutboxMessage>(documentMailUrl(tenantId, kind.resource, documentId), {
        to: splitAddresses(typed.to),
        cc: splitAddresses(typed.cc),
        subject: typed.subject.trim(),
        body: typed.body,
        copyToSender: typed.copyToSender,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outbox-messages', tenantId] })
      // The line in the document header reads this. Without it the mask would keep saying
      // «noch nichts hinausgegangen» until somebody reloads.
      void queryClient.invalidateQueries({ queryKey: ['document-mail-messages', tenantId] })
      onQueued()
      close()
    },
  })

  const recipients = splitAddresses(typed.to)
  // 400 naming the mail account: none is set up, or it is switched off. Told apart from any
  // other failure because it has an answer — a link into the settings.
  const missingAccount = accountMissing(preview.error)

  const submit = () => {
    if (data === undefined || recipients.length === 0 || send.isPending) return
    send.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      onSubmit={submit}
      initialFocus={recipientField}
      title={`${kind.singular} als E-Mail senden`}
      description={data?.documentNumber}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button
            onClick={submit}
            busy={send.isPending}
            disabled={data === undefined || recipients.length === 0}
            shortcut
          >
            Senden
          </Button>
        </>
      }
    >
      {preview.isPending && open && <LoadingBlock />}
      {send.error !== null && <ErrorNotice error={send.error} />}

      {missingAccount && (
        <WarningNotice>
          Für diesen Mandanten ist kein Mailkonto eingerichtet oder es ist ausgeschaltet.{' '}
          {mayConfigure ? (
            <Link to={OUTBOX_ACCOUNT_PATH} className="underline underline-offset-2">
              Systemeinstellungen → Postausgang
            </Link>
          ) : (
            'Bitte an die Administration wenden.'
          )}
        </WarningNotice>
      )}
      {preview.error !== null && !missingAccount && <ErrorNotice error={preview.error} />}

      {data !== undefined && (
        <div className="space-y-4">
          {/* The box opens even without an address, with an empty field and a note. Locking
              the way out would leave somebody in front of an invoice they cannot send and no
              idea why. */}
          {data.to.length === 0 && (
            <WarningNotice>
              Am Kunden ist keine E-Mail-Adresse hinterlegt. Eine hier eingetippte Adresse gilt
              für diese Mail und ändert den Beleg nicht.
            </WarningNotice>
          )}

          <TextField
            ref={recipientField}
            label="An"
            value={typed.to}
            maxLength={1000}
            hint="Mehrere Adressen mit Komma trennen"
            invalid={recipients.length === 0}
            onChange={(event) => edit({ to: event.target.value })}
          />
          <TextField
            label="Kopie an"
            value={typed.cc}
            maxLength={1000}
            onChange={(event) => edit({ cc: event.target.value })}
          />
          <TextField
            label="Betreff"
            value={typed.subject}
            maxLength={255}
            onChange={(event) => edit({ subject: event.target.value })}
          />
          <TextAreaField
            label="Text"
            value={typed.body}
            rows={9}
            onChange={(event) => edit({ body: event.target.value })}
          />

          <div>
            <p className="text-[12px] font-medium text-text-secondary">Anhang</p>
            <p className="mt-1 inline-flex items-center gap-2 text-[13px]">
              <Paperclip size={14} aria-hidden />
              {data.fileName}
              <span className="text-text-tertiary">{formatByteCount(data.byteCount)}</span>
            </p>
          </div>

          <CheckboxField
            label="Kopie an mich"
            hint={`Als Blindkopie an ${data.senderAddress}, damit der Kunde sie nicht sieht.`}
            checked={typed.copyToSender}
            onChange={(event) => edit({ copyToSender: event.target.checked })}
          />
        </div>
      )}
    </Dialog>
  )
}

/**
 * Whether the preview failed because there is no usable mail account.
 *
 * <p>The backend answers 400 for that and names the screen in its sentence. Told apart from
 * any other 400 by the word it uses, so the box can offer the link instead of the bare
 * complaint.
 *
 * @param error what the preview threw
 * @returns true where the answer is about the mail account
 */
function accountMissing(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 400 && error.message.includes('Mailkonto')
  )
}
