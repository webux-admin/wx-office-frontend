import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import {
  REPORT_NAMES,
  fetchReportArchive,
  reportArchiveFileUrl,
  reportArchiveKey,
} from '../../lib/accountingReports'
import { api } from '../../lib/api'
import { showFile } from '../../lib/files'
import { formatByteCount, formatDate, formatDateTime } from '../../lib/format'
import type { AccountingReport, ArchivedReport, FiscalYear } from '../../lib/types'

const DESCRIPTION =
  'Die fünf Papiere eines Abschlusses — die drei Bücher von oben, dazu Bilanz und'
  + ' Erfolgsrechnung — und was von Hand abgelegt wurde. Jedes liegt seither unverändert im'
  + ' Archiv: Jeder Aufruf gibt dieselbe Datei zurück; neu gezeichnet wird sie nie.'

/**
 * The order the five papers of one close are listed in: the two statements first, because
 * they are what a reader opens the cupboard for, then the three books.
 *
 * <p>The backend files them in the order of `AccountingReport` and answers newest first, which
 * would put the income statement at the top and the journal at the bottom — a detail of the
 * filing loop, and the list should not read differently if that loop is ever reordered.
 */
const PAPER_ORDER: AccountingReport[] = [
  'balance-sheet',
  'income-statement',
  'trial-balance',
  'journal',
  'account-sheets',
]

/** One block of the list: the papers of one close, or everything filed by hand. */
type ArchiveGroup = {
  key: string
  heading: string
  papers: ArchivedReport[]
}

/**
 * The cupboard of one fiscal year: every paper filed for it, grouped by where it came from.
 *
 * <p>A close files five papers and a second close of the same year five more; the newer close
 * stands above the older one, and nothing is ever overwritten (backend ADR-0125). Papers filed
 * by hand stand in a block of their own below the closes, so nobody takes one for the paper of
 * a close it is not. The list is not paged: by hand there is at most one paper per kind and
 * day, so the stock is capped rather than growing.
 *
 * <p>Every click hands out the bytes that were written when the paper was filed. It is not
 * rendered again — a balance sheet has to look the same in ten years (backend ADR-0024).
 *
 * <p>Answers with the module off, like the screen around it: what is kept for ten years has to
 * be reachable for ten years (OR Art. 958f, GeBüV Art. 6 Abs. 1).
 *
 * @param tenantId the tenant
 * @param year the fiscal year whose cupboard is read
 */
export function ReportArchivePanel({ tenantId, year }: { tenantId: number; year: FiscalYear }) {
  const archive = useQuery({
    queryKey: reportArchiveKey(tenantId, year.id),
    queryFn: () => fetchReportArchive(tenantId, year.id),
  })

  const open = useMutation({
    mutationFn: (paper: ArchivedReport) => api.file(reportArchiveFileUrl(tenantId, paper.id)),
    onSuccess: showFile,
  })

  const groups = groupsOf(archive.data ?? [])

  return (
    <Panel
      title={`Archivierte Auswertungen ${year.label}`}
      description={DESCRIPTION}
      padded={false}
    >
      {archive.isPending && (
        <p className="px-5 py-3 text-[13px] text-text-secondary">Wird geladen ...</p>
      )}
      {archive.error !== null && (
        <div className="p-5">
          <ErrorNotice error={archive.error} />
        </div>
      )}
      {/* Above the list and not instead of it: a paper that does not come back is one
          failure, and the other papers of the year are still there to be opened. */}
      {open.error !== null && (
        <div className="px-5 pt-5">
          <ErrorNotice error={open.error} />
        </div>
      )}
      {archive.isSuccess && groups.length === 0 && <NothingFiled year={year} />}
      {groups.map((group) => (
        <section key={group.key} className="border-b border-line-subtle last:border-b-0">
          <h3 className="px-5 pt-4 pb-1 text-[12px] font-medium text-text-tertiary">
            {group.heading}
          </h3>
          <ul className="divide-y divide-line-subtle">
            {group.papers.map((paper) => (
              <Paper
                key={paper.id}
                paper={paper}
                busy={open.isPending && open.variables?.id === paper.id}
                disabled={open.isPending}
                onOpen={() => open.mutate(paper)}
              />
            ))}
          </ul>
        </section>
      ))}
    </Panel>
  )
}

/**
 * One filed paper: what it is, the facts a person wants before clicking, and the way to open
 * it.
 *
 * <p>The name is the word of the screen (`REPORT_NAMES`) and not the title printed on the
 * paper: the paper carries the language of the tenant, the screen is German either way. The
 * facts are the kind of file, its size, and when and by whom it was filed — the audit trail of
 * a row that can never change.
 */
function Paper({
  paper,
  busy,
  disabled,
  onOpen,
}: {
  paper: ArchivedReport
  busy: boolean
  disabled: boolean
  onOpen: () => void
}) {
  const name = `${REPORT_NAMES[paper.report]} per ${formatDate(paper.asOfDate)}`
  const facts = [
    'PDF',
    formatByteCount(paper.byteCount),
    `erstellt am ${formatDateTime(paper.createdAt)} von ${paper.createdBy}`,
  ]
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[13px] font-medium">{name}</span>
        <span className="text-[12px] text-text-tertiary">{facts.join(' · ')}</span>
      </div>
      <Button
        variant="secondary"
        onClick={onOpen}
        busy={busy}
        disabled={disabled}
        aria-label={`${name} anzeigen`}
      >
        Anzeigen
      </Button>
    </li>
  )
}

/**
 * What stands where the papers would be.
 *
 * <p>Two sentences for two situations. A closed year without papers was closed before the
 * close started filing them, and nothing is rendered after the fact: a PDF drawn in December
 * for a close of March would carry December's fonts and date and still claim to be the paper
 * of the closing day — worse than the gap. An open year simply has not been closed yet.
 */
function NothingFiled({ year }: { year: FiscalYear }) {
  if (year.status === 'CLOSED') {
    return (
      <EmptyState
        title="Keine Papiere abgelegt"
        description={
          `Für ${year.label} wurden beim Abschluss keine Papiere archiviert — das Jahr wurde`
          + ' abgeschlossen, bevor der Abschluss welche ablegte. Nachträglich gezeichnet wird'
          + ' nichts; die Papiere lassen sich jederzeit neu erzeugen und von Hand ablegen.'
        }
      />
    )
  }
  return (
    <EmptyState
      title="Noch nichts abgelegt"
      description={
        `Für ${year.label} liegt noch kein Papier im Archiv. Der Abschluss legt fünf ab; von`
        + ' Hand lässt sich jedes Papier auf seiner Maske über «Drucken → Archivieren …»'
        + ' ablegen.'
      }
    />
  )
}

/**
 * Sorts the papers into their blocks: one per close, newest close first, then the ones filed
 * by hand in the order the backend answered them — newest first.
 */
function groupsOf(papers: ArchivedReport[]): ArchiveGroup[] {
  const closes = new Map<number, ArchivedReport[]>()
  const byHand: ArchivedReport[] = []
  for (const paper of papers) {
    // The second half narrows the type: the database refuses a paper of a close without its
    // number (`ck_accounting_report_archive_closing`), so it never decides anything.
    if (paper.origin === 'MANUAL' || typeof paper.closingNumber !== 'number') {
      byHand.push(paper)
      continue
    }
    closes.set(paper.closingNumber, [...(closes.get(paper.closingNumber) ?? []), paper])
  }

  const groups: ArchiveGroup[] = [...closes.entries()]
    .sort(([left], [right]) => right - left)
    .map(([number, filed]) => ({
      key: `closing-${number}`,
      heading: `Abschluss Nr. ${number}`,
      papers: [...filed].sort(byPaperOrder),
    }))
  if (byHand.length > 0) {
    groups.push({ key: 'by-hand', heading: 'Von Hand abgelegt', papers: byHand })
  }
  return groups
}

function byPaperOrder(left: ArchivedReport, right: ArchivedReport): number {
  return PAPER_ORDER.indexOf(left.report) - PAPER_ORDER.indexOf(right.report)
}
