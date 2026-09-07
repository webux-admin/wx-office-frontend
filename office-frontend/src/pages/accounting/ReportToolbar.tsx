import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Archive, ExternalLink, FileDown } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SplitButton, type SplitButtonAction } from '../../components/SplitButton'
import {
  ACCOUNTING_ARCHIVE_PATH,
  ACCOUNTING_RIGHTS,
  accountingPrintUrl,
  type ReportOptions,
} from '../../lib/accounting'
import {
  REPORT_NAMES,
  accountingPdfUrl,
  archiveReport,
  archivedReportIdOf,
  reportArchiveKey,
} from '../../lib/accountingReports'
import { api } from '../../lib/api'
import { showFile } from '../../lib/files'
import { formatDate } from '../../lib/format'
import { printFile } from '../../lib/print'
import type { AccountingReport } from '../../lib/types'

/**
 * The three ways to a report that end in a file: the PDF to the printer, the PDF to the viewer,
 * and the self-contained HTML page of #94 to a tab.
 */
type ReportWay = 'print' | 'pdf' | 'page'

/**
 * The head of the five report screens: «Drucken» and, behind the arrow, the rarer ways to the
 * same paper.
 *
 * <p>One `SplitButton` on the pattern of the inventory report, and the same one on all five
 * screens — two of them (the trial balance and the journal) had no print button at all before,
 * and the other three each carried a plain «Drucken» that fetched the HTML page.
 *
 * <p><b>The PDF is the usual way and the HTML page stays.</b> «Drucken» fetches the PDF and
 * opens the print dialog on it; «Im Browser anzeigen» fetches the printable page of #94, which
 * works where no PDF can be drawn and is the form that has satisfied GeBüV Art. 6 Abs. 3 since
 * then. One fetch, one busy flag and one failure for all three ways: whichever one fails says so
 * under the button rather than in the console, and the figures on the screen stay where they are.
 *
 * <p><b>«Archivieren …» stands only for whoever may close a year.</b> Filing writes a row that
 * can never be changed or removed, which is why the backend asks `ACCOUNTING_CLOSE` for it and
 * not the read right; the entry is set off by a rule because it is the one way here that writes.
 * The right is a convenience and no protection — the backend refuses without it either way.
 */
export function ReportToolbar({
  tenantId,
  report,
  fiscalYearId,
  yearLabel,
  options = {},
}: {
  tenantId: number
  /** Which of the five papers the screen is about. */
  report: AccountingReport
  /** The year the screen shows; `null` while none is chosen, which switches the button off. */
  fiscalYearId: number | null
  /** What that year is called, for the sentence of the archive dialog; left out where unknown. */
  yearLabel?: string
  /** What narrows the paper the way the screen is narrowed: the account, the day, the switches. */
  options?: ReportOptions
}) {
  const { can } = useAuth()
  const mayArchive = can(ACCOUNTING_RIGHTS.close)
  const [printing, setPrinting] = useState(false)
  const [printFailure, setPrintFailure] = useState<unknown>(null)
  const [archiving, setArchiving] = useState(false)
  // Counted up whenever the dialog is opened, so a fresh one is mounted each time and the
  // outcome of the filing before is gone. Reset on closing instead would flip the box from its
  // answer back to its question while it is still fading out.
  const [archiveRun, setArchiveRun] = useState(0)

  const openReport = async (way: ReportWay) => {
    if (fiscalYearId === null) return
    setPrinting(true)
    setPrintFailure(null)
    try {
      const address =
        way === 'page'
          ? accountingPrintUrl(tenantId, report, fiscalYearId, options)
          : accountingPdfUrl(tenantId, report, fiscalYearId, options)
      const file = await api.file(address)
      if (way === 'print') await printFile(file)
      else showFile(file)
    } catch (failure) {
      setPrintFailure(failure)
    } finally {
      setPrinting(false)
    }
  }

  const actions: SplitButtonAction[] = [
    {
      id: 'pdf',
      label: 'Als PDF speichern',
      hint: 'Öffnet das PDF in einem neuen Tab; von dort lässt es sich speichern.',
      icon: <FileDown size={15} aria-hidden />,
      onSelect: () => void openReport('pdf'),
    },
    {
      id: 'page',
      label: 'Im Browser anzeigen',
      hint: 'Der Weg, der auch ohne PDF funktioniert.',
      icon: <ExternalLink size={15} aria-hidden />,
      onSelect: () => void openReport('page'),
    },
    ...(mayArchive
      ? [
          {
            id: 'archive',
            label: 'Archivieren …',
            hint: 'Legt das Papier unveränderlich ab.',
            icon: <Archive size={15} aria-hidden />,
            separatorBefore: true,
            onSelect: () => {
              setArchiveRun((run) => run + 1)
              setArchiving(true)
            },
          },
        ]
      : []),
  ]

  return (
    <div className="grid justify-items-end gap-2">
      <SplitButton
        onClick={() => void openReport('print')}
        busy={printing}
        disabled={fiscalYearId === null}
        menuLabel="Weitere Wege zum Bericht"
        actions={actions}
      >
        Drucken
      </SplitButton>

      {printFailure !== null && <ErrorNotice error={printFailure} />}

      {fiscalYearId !== null && (
        <ArchiveDialog
          key={archiveRun}
          open={archiving}
          tenantId={tenantId}
          report={report}
          fiscalYearId={fiscalYearId}
          asOf={options.asOf}
          yearLabel={yearLabel}
          onClose={() => setArchiving(false)}
        />
      )}
    </div>
  )
}

/**
 * «Auswertung archivieren»: says what it is about to do, because it cannot be undone.
 *
 * <p>The dialog names the paper and the day, says that a filed paper never changes and never
 * goes, and says which form is filed — the statutory one, without the switches of the screen and
 * without the one account a sheet screen is open on. After the filing it turns into the answer:
 * the paper is in the cupboard, and here is the way there. A second filing of the same paper for
 * the same day is refused by the backend with 409 and the id of the existing one; the dialog then
 * shows that sentence and the same way.
 */
function ArchiveDialog({
  open,
  tenantId,
  report,
  fiscalYearId,
  asOf,
  yearLabel,
  onClose,
}: {
  open: boolean
  tenantId: number
  report: AccountingReport
  fiscalYearId: number
  asOf?: string
  yearLabel?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const filing = useMutation({
    mutationFn: () =>
      archiveReport(tenantId, {
        report,
        fiscalYearId,
        asOf: asOf === undefined || asOf === '' ? null : asOf,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: reportArchiveKey(tenantId, fiscalYearId) }),
  })
  const filed = filing.data
  const existing = archivedReportIdOf(filing.error)
  const settled = filed !== undefined || existing !== undefined

  const file = () => {
    if (filing.isPending || settled) return
    filing.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Auswertung archivieren"
      onSubmit={settled ? undefined : file}
      footer={
        settled ? (
          <Button variant="secondary" onClick={onClose}>
            Schliessen
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={file} busy={filing.isPending} shortcut>
              Archivieren
            </Button>
          </>
        )
      }
    >
      {filed !== undefined ? (
        <p className="text-[13px] text-text-primary">
          «{filed.title}» per {formatDate(filed.asOfDate)} liegt jetzt im Archiv.{' '}
          <ArchiveLink />
        </p>
      ) : (
        <div className="grid gap-3 text-[13px]">
          <p className="text-text-primary">{filingSentence(report, asOf, yearLabel)}</p>
          <p className="text-text-secondary">
            Ein archiviertes Papier lässt sich nicht mehr ändern und nicht mehr löschen. Es zeigt
            in zehn Jahren dieselben Zahlen und dasselbe Bild wie heute.
          </p>
          <p className="text-text-secondary">{presentationSentence(report)}</p>
          {filing.error !== null && (
            <ErrorNotice error={filing.error}>
              {existing !== undefined && <ArchiveLink />}
            </ErrorNotice>
          )}
        </div>
      )}
    </Dialog>
  )
}

/** The way into the cupboard — a link, so it can be opened in a new tab beside the report. */
function ArchiveLink() {
  return (
    <Link
      to={ACCOUNTING_ARCHIVE_PATH}
      className="text-accent-text underline-offset-2 hover:underline"
    >
      Im Archiv ansehen
    </Link>
  )
}

/**
 * «Bilanz per 30.06.2026 wird als PDF abgelegt.» — the paper, the day where one was chosen, the
 * year where its name is known, and the plural for the account sheets.
 */
function filingSentence(report: AccountingReport, asOf?: string, yearLabel?: string): string {
  const name = REPORT_NAMES[report]
  const verb = report === 'account-sheets' ? 'werden' : 'wird'
  if (asOf !== undefined && asOf !== '') {
    return `${name} per ${formatDate(asOf)} ${verb} als PDF abgelegt.`
  }
  if (yearLabel !== undefined && yearLabel !== '') {
    return `${name} ${yearLabel} ${verb} als PDF abgelegt.`
  }
  return `${name} ${verb} als PDF abgelegt.`
}

/**
 * Which form goes into the cupboard, said before the click because it is not the one on the
 * screen: the statutory presentation without the switches, every account and not one, every row
 * and not the page somebody narrowed (backend ADR-0125).
 *
 * <p><b>The cut-off day is the one thing of the screen that does travel</b>, so no sentence here
 * promises the whole year. Which period is filed stands in {@link filingSentence} right above:
 * the day where one was chosen, the year where none was.
 */
function presentationSentence(report: AccountingReport): string {
  switch (report) {
    case 'balance-sheet':
    case 'income-statement':
      return (
        'Abgelegt wird die gesetzliche Darstellung — ohne die Kontozeilen und ohne leere'
        + ' Positionen, in der Sprache des Mandanten.'
      )
    case 'account-sheets':
      return (
        'Abgelegt werden die Kontoblätter aller Konten mit Bewegung — nicht nur das Konto auf'
        + ' dem Bildschirm, in der Sprache des Mandanten.'
      )
    case 'trial-balance':
    case 'journal':
      return (
        'Abgelegt wird das Papier, das der Satz oben nennt — mit jeder Zeile, ohne Suche und'
        + ' Filter des Bildschirms, in der Sprache des Mandanten.'
      )
  }
}
