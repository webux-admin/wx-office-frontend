import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { formatAmount, formatDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { salesDocumentFor } from '../../lib/salesDocument'
import type { DocumentChainEntry, DocumentRelation } from '../../lib/types'
import { chainEntryLabel, relationLabel } from './documentChain'

const TITLE = 'Zusammenhänge'

const DESCRIPTION =
  'Jeder Beleg, der mit diesem zusammenhängt: woraus er entstanden ist, was daraus geschrieben wurde, und die Stornos dazu.'

/** How each relation is drawn, so the eye finds the direction before it reads. */
const TONES: Record<DocumentRelation, 'accent' | 'neutral' | 'muted' | 'danger'> = {
  SELF: 'accent',
  PREDECESSOR: 'neutral',
  SUCCESSOR: 'neutral',
  REVERSAL: 'danger',
  RELATED: 'muted',
}

/**
 * The whole chain one document hangs on.
 *
 * <p>Answers the question a document mask cannot: where this one came from and what came out
 * of it. The backend walks both directions and says how each entry relates, so nothing here
 * works it out from the dates (ADR-0057 of the backend).
 *
 * @param chain the chain as the API returned it
 * @param loading true while it is still on its way
 * @param error what went wrong reading it, if anything
 * @param currentId the document the mask is showing, so its own row is not a link to itself
 * @param backTo route of this document, so the way back out of a related one leads here
 * @param backLabel what that way back is called
 */
export function DocumentChainPanel({
  chain,
  loading,
  error,
  currentId,
  backTo,
  backLabel,
}: {
  chain: DocumentChainEntry[]
  loading: boolean
  error: unknown
  currentId: number
  backTo: string
  backLabel: string
}) {
  if (loading) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <LoadingBlock label="Zusammenhänge werden geladen" />
      </Panel>
    )
  }
  if (error !== null && error !== undefined) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <ErrorNotice error={error} />
      </Panel>
    )
  }

  // One entry is always there: the document itself. Anything less means it stands alone.
  if (chain.length <= 1) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <p className="text-[13px] text-text-secondary">
          Dieser Beleg steht für sich. Er wurde aus keinem anderen übernommen, und aus ihm
          wurde noch keiner geschrieben.
        </p>
      </Panel>
    )
  }

  return (
    <Panel title={TITLE} description={DESCRIPTION}>
      <ol className="grid gap-2">
        {chain.map((entry) => (
          <ChainRow
            key={entry.id}
            entry={entry}
            current={entry.id === currentId}
            backTo={backTo}
            backLabel={backLabel}
          />
        ))}
      </ol>
    </Panel>
  )
}

/**
 * One document of the chain.
 *
 * <p>A link, except for the document being shown: a row that leads back to the page it sits
 * on reads as if something else were behind it. A kind of document the frontend has no mask
 * for is not a link either — the Gutschrift is the one that has none.
 */
function ChainRow({
  entry,
  current,
  backTo,
  backLabel,
}: {
  entry: DocumentChainEntry
  current: boolean
  backTo: string
  backLabel: string
}) {
  const kind = salesDocumentFor(entry.category)
  const body = (
    <>
      <span className="flex min-w-0 flex-wrap items-baseline gap-2">
        <Badge tone={TONES[entry.relation] ?? 'muted'}>{relationLabel(entry.relation)}</Badge>
        <span className="truncate font-mono text-[12px]">{chainEntryLabel(entry)}</span>
        {entry.status === 'CANCELLED' && <Badge tone="danger">Storniert</Badge>}
        {entry.status === 'DRAFT' && <Badge tone="muted">Entwurf</Badge>}
      </span>
      <span className="shrink-0 text-[12px] text-text-secondary">
        {formatDate(entry.documentDate)} · {formatAmount(entry.totalGross)}{' '}
        {entry.currencyCode}
      </span>
    </>
  )

  const shape =
    'flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5'

  if (current) {
    return (
      <li className={`${shape} border-accent bg-sunken`} aria-current="true">
        {body}
      </li>
    )
  }
  if (kind === undefined) {
    return <li className={`${shape} border-line-subtle`}>{body}</li>
  }
  return (
    <li>
      <Link
        to={`${kind.path}/${entry.id}`}
        state={originState(backTo, backLabel)}
        className={`${shape} border-line-subtle transition-colors hover:bg-sunken`}
      >
        {body}
      </Link>
    </li>
  )
}
