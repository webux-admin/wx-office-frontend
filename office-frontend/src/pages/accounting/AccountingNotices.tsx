import { Link } from 'react-router-dom'
import { WarningNotice } from '../../components/Notice'
import { DRAFT_PATH } from '../../lib/accounting'
import { formatAmount, formatDate } from '../../lib/format'
import type { ModuleGap, ReportNotices } from '../../lib/types'

/**
 * The two things that stand above every evaluation: what is not in it yet, and when the books
 * were not being kept.
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
      <DraftNotice notices={notices} />
      <ModuleGapNotice gaps={notices.moduleGaps} />
    </>
  )
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
 * <p>No count of vouchers: only `document` knows that, and fetching it would be the very module
 * edge the whole cut avoids. It arrives with the issue in which a document posts itself.
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
