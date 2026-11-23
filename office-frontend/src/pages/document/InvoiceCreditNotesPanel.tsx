import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, type BadgeTone } from '../../components/Badge'
import { Button } from '../../components/Button'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { invoiceCreditNotesKey, invoiceCreditNotesUrl } from '../../lib/creditNote'
import { formatAmount, formatDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { CREDIT_NOTE_KIND } from '../../lib/salesDocument'
import type { CreditNoteSummary, DocumentStatus } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'

const TITLE = 'Gutschriften'

const DESCRIPTION =
  'Was dieser Rechnung gutgeschrieben wurde. Eine ausgestellte Gutschrift mindert den offenen Posten; ihr Storno hebt das wieder auf.'

const STATUS_TONES: Record<DocumentStatus, BadgeTone> = {
  DRAFT: 'muted',
  FINALISED: 'success',
  CANCELLED: 'danger',
}

/**
 * The Gutschriften of one invoice, and the way to write another one.
 *
 * <p>The only place a Gutschrift starts: it has no list of its own, because it begins with the
 * invoice it credits (backend ADR-0047, ADR-0155). Drafts are listed too, so a Gutschrift that
 * was started and not issued is found again.
 *
 * @param tenantId  the tenant
 * @param invoiceId the invoice
 * @param backTo    route of the invoice, so the way back out of a Gutschrift leads here
 * @param backLabel what that way back is called
 * @param onCreate  opens the dialog for a new Gutschrift; left out where it cannot be written
 */
export function InvoiceCreditNotesPanel({
  tenantId,
  invoiceId,
  backTo,
  backLabel,
  onCreate,
}: {
  tenantId: number
  invoiceId: number
  backTo: string
  backLabel: string
  onCreate?: () => void
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const creditNotes = useQuery({
    queryKey: invoiceCreditNotesKey(tenantId, invoiceId),
    queryFn: () => api.get<CreditNoteSummary[]>(invoiceCreditNotesUrl(tenantId, invoiceId)),
  })

  const action = onCreate === undefined ? undefined : (
    <Button variant="secondary" onClick={onCreate}>
      Gutschrift erstellen…
    </Button>
  )

  return (
    <Panel title={TITLE} description={DESCRIPTION} action={action}>
      {creditNotes.isPending && <LoadingBlock label="Gutschriften werden geladen" />}
      {creditNotes.error !== null && <ErrorNotice error={creditNotes.error} />}
      {creditNotes.data !== undefined && creditNotes.data.length === 0 && (
        <p className="text-body text-text-secondary">
          Auf diese Rechnung wurde noch keine Gutschrift geschrieben.
        </p>
      )}
      {creditNotes.data !== undefined && creditNotes.data.length > 0 && (
        <ul className="grid gap-2">
          {creditNotes.data.map((creditNote) => (
            <li key={creditNote.id}>
              <Link
                to={`${CREDIT_NOTE_KIND.path}/${creditNote.id}`}
                state={originState(backTo, backLabel)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line-subtle px-3.5 py-2.5 transition-colors hover:bg-sunken"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-small">
                    {creditNote.documentNumber ?? 'Entwurf'}
                  </span>
                  <Badge tone={STATUS_TONES[creditNote.status]}>
                    {statusLabel(creditNote.status)}
                  </Badge>
                </span>
                <span className="shrink-0 text-small text-text-secondary">
                  {formatDate(creditNote.documentDate)} ·{' '}
                  <span className="font-mono tabular-nums">
                    {formatAmount(creditNote.totalGross)}
                  </span>{' '}
                  {creditNote.currency}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
