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
 * <p>The longest text, a state with its invoice number, stays on one line from `sm` on; below it
 * breaks centred, in a box rather than a stretched pill.
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
  const text = entryStateText(entry)
  const number = entry.state === 'BILLED' ? entry.documentNumber : undefined
  const badge = (
    <Badge tone={TIME_ENTRY_STATE_TONES[entry.state]} wraps>
      {number ? (
        <span>
          {text.slice(0, text.length - number.length)}
          {/* A document number breaks as a whole or not at all. */}
          <span className="whitespace-nowrap">{number}</span>
        </span>
      ) : (
        text
      )}
    </Badge>
  )
  const path = entryInvoicePath(entry)
  if (!linked || path === null || !can(INVOICE_KIND.rights.read)) return badge
  return (
    <Link
      to={path}
      state={origin}
      title={entry.state === 'IN_DRAFT' ? 'Rechnungsentwurf öffnen' : 'Rechnung öffnen'}
      className="inline-flex rounded-[var(--radius-lg)] transition-opacity hover:opacity-80"
    >
      {badge}
    </Link>
  )
}
