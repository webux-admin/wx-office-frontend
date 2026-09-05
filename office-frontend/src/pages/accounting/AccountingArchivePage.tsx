import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { EmptyState, LoadingBlock } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { RequireTenant } from '../../layout/RequireTenant'
import { api } from '../../lib/api'
import {
  ACCOUNTING_RIGHTS,
  accountingExportUrl,
  accountingPrintUrl,
  fetchFiscalYears,
  fiscalYearsKey,
  type AccountingReport,
} from '../../lib/accounting'
import { downloadFile } from '../../lib/files'
import { formatDate } from '../../lib/format'
import { printFile } from '../../lib/print'
import type { FiscalYear } from '../../lib/types'

/** What the three print buttons of a year are called, and which report each of them asks for. */
const REPORTS: { key: AccountingReport; label: string }[] = [
  { key: 'journal', label: 'Journal' },
  { key: 'account-sheets', label: 'Kontoblätter' },
  { key: 'trial-balance', label: 'Saldenliste' },
]

/**
 * «Archiv»: the two ways the books leave this application.
 *
 * <p><b>The one accounting screen without a module switch on its route, and the reason is the
 * law.</b> Switching the module off closes the writing ways; it must not hide the books. GeBüV
 * Art. 6 Abs. 1 wants a person holding the read right to be able to look at them within a
 * reasonable time — a fiduciary hired after the switch went off could otherwise never get at
 * them. So this screen answers whichever way the switch stands, and so do the two endpoints
 * behind its buttons.
 *
 * <p><b>Two ways out and not one, because they satisfy two different rules.</b> The ZIP of CSV
 * files satisfies OR Art. 958f Abs. 3 — the books can be made readable again at any time. It does
 * not satisfy GeBüV Art. 6 Abs. 3, which wants them readable «auch ohne Hilfsmittel»: without a
 * technical device, which in practice means on paper. That is what the printout is for.
 */
export function AccountingArchivePage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read}>
      {(tenantId) => <Archive tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Archive({ tenantId }: { tenantId: number }) {
  // The same endpoint the fiscal year screen and the year pickers read, and it answers with the
  // module off too. A second endpoint for two numbers would be a second cache going stale in one
  // of the two.
  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })

  if (years.isLoading) return <LoadingBlock />

  const available = years.data?.years ?? []
  const posted = available.reduce((sum, year) => sum + year.postedEntries, 0)

  return (
    <>
      <PageHeader
        title="Archiv"
        subtitle={
          posted === 0
            ? 'Die Bücher zum Herunterladen und zum Ausdrucken.'
            : `${posted} verbuchte ${posted === 1 ? 'Buchung' : 'Buchungen'} in `
              + `${available.length} ${available.length === 1 ? 'Geschäftsjahr' : 'Geschäftsjahren'}.`
        }
      />

      <div className="grid gap-4 px-8 pb-12">
        <Panel>
          <p className="text-[13px] text-text-secondary">
            Diese Seite bleibt erreichbar, auch wenn die Buchhaltung abgeschaltet ist.
            Geschäftsbücher und Buchungsbelege sind zehn Jahre aufzubewahren (OR Art. 958f).
          </p>
        </Panel>

        {posted === 0 ? (
          <EmptyState title="Noch nichts verbucht">
            Für diesen Mandanten ist noch nichts verbucht. Sobald die erste Buchung im Journal
            steht, lässt sie sich hier herunterladen und drucken.
          </EmptyState>
        ) : (
          available.map((year) => <Year key={year.id} tenantId={tenantId} year={year} />)
        )}

        {posted > 0 && (
          <p className="text-[13px] text-text-secondary">
            Das ZIP enthält Journal, Kontoblätter und Saldenliste als CSV, je Geschäftsjahr. Es
            erfüllt OR Art. 958f Abs. 3. Die Anforderung von GeBüV Art. 6 Abs. 3 — «auch ohne
            Hilfsmittel lesbar» — erfüllt erst der Ausdruck auf Papier.
          </p>
        )}
      </div>
    </>
  )
}

/**
 * One fiscal year with its two ways out.
 *
 * <p>A year without a single posted entry is listed but its buttons are off: an empty archive is
 * refused by the backend rather than delivered, so offering the button would be offering a
 * refusal.
 */
function Year({ tenantId, year }: { tenantId: number; year: FiscalYear }) {
  const empty = year.postedEntries === 0
  return (
    <Panel>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-medium">Geschäftsjahr {year.label}</span>
          <span className="text-[13px] text-text-secondary">
            {formatDate(year.startDate)} – {formatDate(year.endDate)}
          </span>
          <span className="text-[13px] text-text-tertiary">
            {year.postedEntries} {year.postedEntries === 1 ? 'Buchung' : 'Buchungen'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            disabled={empty}
            onClick={() => void download(tenantId, year.id)}
          >
            Alles herunterladen (ZIP)
          </Button>
          <span className="text-[13px] text-text-secondary">Drucken:</span>
          {REPORTS.map((report) => (
            <Button
              key={report.key}
              variant="ghost"
              disabled={empty}
              onClick={() => void print(tenantId, report.key, year.id)}
            >
              {report.label}
            </Button>
          ))}
        </div>
      </div>
    </Panel>
  )
}

/**
 * Fetches the archive and hands it to the download folder.
 *
 * <p>`downloadFile` and not `showFile`: a ZIP opened in a tab is a download with an extra step
 * and a blank page in between. Through the API client rather than a plain link, so an expired
 * session leads to the login screen instead of a bare 401 in a new tab.
 */
async function download(tenantId: number, fiscalYearId: number) {
  downloadFile(await api.file(accountingExportUrl(tenantId, fiscalYearId)))
}

/**
 * Fetches one report and opens the print dialog on it.
 *
 * <p>The bytes go into a hidden frame as a blob. A frame pointed straight at the endpoint would
 * stay empty — Spring Security forbids framing by default — and the handling of an expired
 * session, which lives in one place in `api.ts`, would be lost with it.
 */
async function print(tenantId: number, report: AccountingReport, fiscalYearId: number) {
  printFile(await api.file(accountingPrintUrl(tenantId, report, fiscalYearId)))
}
