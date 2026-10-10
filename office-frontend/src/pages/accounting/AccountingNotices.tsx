import { Link } from 'react-router-dom'
import { WarningNotice } from '../../components/Notice'
import {
  ACCOUNTING_SETTINGS_PATH,
  DRAFT_PATH,
  NO_POSTING_START_SENTENCE,
  UNPOSTED_PATH,
  unpostedBankSentence,
  unpostedDocumentsSentence,
} from '../../lib/accounting'
import { BANK_TRANSACTION_PATH } from '../../lib/banking'
import { formatAmount, formatDate } from '../../lib/format'
import type { ModuleGap, ReportNotices, StatementNoteKind } from '../../lib/types'

/**
 * What stands above every evaluation: what has not reached the ledger, what is not in it yet, and
 * when the books were not being kept.
 *
 * <p>Built here once because the same two boxes belong over the trial balance, over the account
 * sheet and, with the next issue, over the balance sheet and the income statement. Written per
 * screen they would drift, and an evaluation that quietly says something different from the one
 * beside it is worse than one that says nothing.
 *
 * <p>Both read the `notices` of the answer they stand over — never a second request, so what the
 * figures leave out is on the screen at the same moment as the figures.
 */
export function AccountingNotices({ notices }: { notices: ReportNotices }) {
  return (
    <>
      <UnpostedNotice notices={notices} />
      <DraftNotice notices={notices} />
      <ModuleGapNotice gaps={notices.moduleGaps} />
    </>
  )
}

/**
 * What has not reached the ledger: the missing changeover day, and the two counters.
 *
 * <p><b>They replaced the sentence that nothing books itself yet</b>, which stopped being true
 * the day the documents started booking themselves. A count can be checked; that sentence could
 * not. A counter at zero says nothing, like the draft box.
 *
 * <p>The words are those of the backend `StatementNotes`, so the screen says what the paper says.
 */
export function UnpostedNotice({ notices }: { notices: ReportNotices }) {
  return (
    <>
      {!notices.postingStartsOn && (
        <WarningNotice>
          <NoteWithLink kind="NO_POSTING_START" text={NO_POSTING_START_SENTENCE} />
        </WarningNotice>
      )}
      {notices.unpostedDocuments > 0 && (
        <WarningNotice>
          <NoteWithLink
            kind="UNPOSTED_DOCUMENTS"
            text={unpostedDocumentsSentence(notices.unpostedDocuments)}
          />
        </WarningNotice>
      )}
      {notices.unpostedBankTransactions > 0 && (
        <WarningNotice>
          <NoteWithLink
            kind="UNPOSTED_BANK_TRANSACTIONS"
            text={unpostedBankSentence(notices.unpostedBankTransactions)}
          />
        </WarningNotice>
      )}
    </>
  )
}

/**
 * One note with the way to act on it beside it, where the note has one.
 *
 * <p>The missing changeover day leads to the confirmation dialog, the invoice counter to the
 * register «Nicht gebucht», the bank counter to the bank movements. Every other note is read and
 * not acted on, and stands alone.
 */
export function NoteWithLink({ kind, text }: { kind: StatementNoteKind; text: string }) {
  const way = wayOf(kind)
  if (way === null) return <>{text}</>
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <span>{text}</span>
      <Link to={way.to} className="underline">
        {way.label}
      </Link>
    </span>
  )
}

/**
 * @param kind what the note is about
 * @returns where its link leads and what it says, `null` for a note without one
 */
function wayOf(kind: StatementNoteKind): { to: string; label: string } | null {
  switch (kind) {
    case 'NO_POSTING_START':
      return { to: ACCOUNTING_SETTINGS_PATH, label: 'Stichtag bestätigen' }
    case 'UNPOSTED_DOCUMENTS':
      return { to: UNPOSTED_PATH, label: 'Ansehen' }
    case 'UNPOSTED_BANK_TRANSACTIONS':
      return { to: BANK_TRANSACTION_PATH, label: 'Ansehen' }
    default:
      return null
  }
}

/**
 * What is not in the figures yet.
 *
 * <p><b>Not a warning about a mistake.</b> In hand bookkeeping a draft is the normal state of an
 * entry somebody is in the middle of. It stands here because an evaluation that silently leaves
 * 12'480.55 out is one nobody can rely on — the reader has to know the amount exists and where to
 * look at it, not be told off for it. Hence the way to the drafts beside the sentence.
 *
 * <p>The currency comes out of the answer and is never guessed: the books of this tenant are kept
 * in what the settings say, not in what the browser assumes.
 */
export function DraftNotice({ notices }: { notices: ReportNotices }) {
  if (notices.drafts === 0) return null
  const amount = notices.draftTotal ?? 0
  const currency = notices.currencyCode ?? ''
  return (
    <WarningNotice>
      <span className="flex flex-wrap items-baseline gap-2">
        <span>
          {notices.drafts === 1
            ? `1 Buchung ist noch nicht verbucht (${formatAmount(amount)} ${currency}).`
            : `${notices.drafts} Buchungen sind noch nicht verbucht `
              + `(${formatAmount(amount)} ${currency}).`}{' '}
          Sie {notices.drafts === 1 ? 'ist' : 'sind'} in dieser Auswertung nicht enthalten.
        </span>
        <Link to={DRAFT_PATH} className="underline">
          Ansehen
        </Link>
      </span>
    </WarningNotice>
  )
}

/**
 * When the books were not being kept.
 *
 * <p>One sentence per stretch. A stretch still running is worded «seit dem …» rather than being
 * given an end that has not happened — this is a document somebody files for ten years.
 *
 * <p>No count of vouchers here: the evaluations name the period only. The count stands under the
 * reconciliation report, which asks the subsidiary ledger for it.
 */
export function ModuleGapNotice({ gaps }: { gaps: ModuleGap[] }) {
  if (gaps.length === 0) return null
  return (
    <>
      {gaps.map((gap) => (
        <WarningNotice key={`${gap.from}-${gap.to}`}>{sentenceFor(gap)}</WarningNotice>
      ))}
    </>
  )
}

/**
 * The wording of one switched-off stretch — the same sentence the printed page carries.
 *
 * @param gap the stretch, already cut to the fiscal year
 * @returns what the reader is told
 */
function sentenceFor(gap: ModuleGap): string {
  if (gap.open) {
    return `Die Buchhaltung ist seit dem ${formatDate(gap.from)} abgeschaltet.`
      + ' Seither liess sich nichts erfassen und nichts verbuchen.'
  }
  return `Die Buchhaltung war vom ${formatDate(gap.from)} bis ${formatDate(gap.to)}`
    + ' abgeschaltet. In dieser Zeit liess sich nichts erfassen und nichts verbuchen.'
}
