import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { useAuth } from '../auth/useAuth'
import type { OriginState } from '../lib/origin'
import { INVOICE_KIND } from '../lib/salesDocument'
import { entryInvoicePath } from '../lib/timeBilling'
import { TIME_ENTRY_STATE_TONES, entryStateText } from '../lib/timetracking'
import type { TimeEntry } from '../lib/types'

/**
 * The state of an entry as a badge: «offen», «im Entwurf», «verrechnet RE-2026-0042», «nicht
 * verrechenbar».
 *
 * <p>An entry on an invoice leads there — the draft or the issued invoice — with `INVOICE_READ`,
 * which the invoice mask asks for; without it the badge says the same and leads nowhere
 * (backend ADR-0163, frontend ADR-0085).
 *
 * @param linked false where the badge stands inside a control of its own, such as a row that
 *   opens the entry: a link inside a button is a control nobody can reach
 * @param origin where the invoice mask leads back to
 */
export function TimeEntryStateBadge({
  entry,
  linked = true,
  origin,
}: {
  entry: TimeEntry
  linked?: boolean
  origin?: OriginState
}) {
  const { can } = useAuth()
  const badge = <Badge tone={TIME_ENTRY_STATE_TONES[entry.state]}>{entryStateText(entry)}</Badge>
  const path = entryInvoicePath(entry)
  if (!linked || path === null || !can(INVOICE_KIND.rights.read)) return badge
  return (
    <Link
      to={path}
      state={origin}
      title={entry.state === 'IN_DRAFT' ? 'Rechnungsentwurf öffnen' : 'Rechnung öffnen'}
      className="inline-flex rounded-[var(--radius-full)] transition-opacity hover:opacity-80"
    >
      {badge}
    </Link>
  )
}
