/**
 * The five papers of the bookkeeping as a PDF, and the cupboard they are filed in.
 *
 * <p>A file of its own beside `accounting.ts`, which already carries the screens, the rights and
 * the calls of the whole module on more than two thousand lines. What stands here is about a
 * file rather than about a figure: the address of a paper drawn now, the addresses of the
 * archive, and the name a paper is called by. `ReportToolbar` reads it for the five report
 * screens; the archive addresses are for the list of a year and for the closing screen, which
 * fetch a filed paper by its id (backend ADR-0125).
 */
import { accountingUrl, reportQuery, type ReportOptions } from './accounting'
import { ApiError, api } from './api'
import type { AccountingReport, ArchiveReportRequest, ArchivedReport } from './types'

/**
 * What each of the five papers is called on screen.
 *
 * <p>The one source of the word. Closed on purpose: a paper without a name here cannot slip
 * through, because every place that names one reads this record and TypeScript insists it is
 * complete — the same relation `MODULE_NAMES` has to `LicensedModuleCode`.
 */
export const REPORT_NAMES: Record<AccountingReport, string> = {
  journal: 'Journal',
  'account-sheets': 'Kontoblätter',
  'trial-balance': 'Saldenliste',
  'balance-sheet': 'Bilanz',
  'income-statement': 'Erfolgsrechnung',
}

/**
 * What the PDF may be asked for beyond what the printable page takes.
 *
 * <p>The language is the one thing only the PDF accepts: a look may be taken in French while
 * the books of the firm stay German. Nothing of such a look is ever filed.
 */
export type PdfOptions = ReportOptions & {
  /** The language to lay the paper out in; left out for the language of the tenant. */
  language?: string
}

/**
 * The address of one paper as a PDF, drawn now and kept nowhere.
 *
 * <p>The same five keys and the same query as the printable page, so the paper shows what the
 * screen showed; the language is appended last and only where one was asked for.
 *
 * @param tenantId the tenant
 * @param report which paper
 * @param fiscalYearId the year to draw
 * @param options the account for `account-sheets`, the cut-off day, the two switches, and the
 *   language
 * @returns address of the PDF
 */
export function accountingPdfUrl(
  tenantId: number,
  report: AccountingReport,
  fiscalYearId: number,
  options: PdfOptions = {},
): string {
  const language =
    options.language === undefined || options.language === ''
      ? ''
      : `&language=${encodeURIComponent(options.language)}`
  return `${accountingUrl(tenantId)}/pdf/${report}?${reportQuery(fiscalYearId, options)}${language}`
}

/**
 * The address of the archive: the list of one year for reading, the bare address for filing.
 *
 * @param tenantId the tenant
 * @param fiscalYearId the year whose cupboard is read; left out for the address a paper is
 *   filed under with `POST`
 * @returns address of the archive
 */
export function reportArchiveUrl(tenantId: number, fiscalYearId?: number): string {
  const year = fiscalYearId === undefined ? '' : `?fiscalYearId=${fiscalYearId}`
  return `${accountingUrl(tenantId)}/report-archive${year}`
}

/**
 * The address of one filed paper.
 *
 * <p>Always the bytes written when it was filed, never a fresh render — a balance sheet has to
 * look the same in ten years (backend ADR-0024).
 *
 * @param tenantId the tenant
 * @param archivedReportId the paper
 * @returns address of its bytes
 */
export function reportArchiveFileUrl(tenantId: number, archivedReportId: number): string {
  return `${accountingUrl(tenantId)}/report-archive/${archivedReportId}`
}

/**
 * @param tenantId the tenant
 * @param fiscalYearId the year
 * @returns cache key of the archive of one year
 */
export function reportArchiveKey(tenantId: number, fiscalYearId: number): readonly unknown[] {
  return ['accounting-report-archive', tenantId, fiscalYearId]
}

/**
 * Everything filed for one fiscal year, newest first and without the bytes.
 *
 * <p>Unpaged, and that is deliberate: a close files five papers and by hand there is at most one
 * per paper and reporting date, so the stock is capped rather than growing. Answers while the
 * module is off, like everything that reads here (OR Art. 958f).
 *
 * @param tenantId the tenant
 * @param fiscalYearId the year whose cupboard is read
 * @returns its papers, newest first; empty where nothing has been filed
 */
export function fetchReportArchive(
  tenantId: number,
  fiscalYearId: number,
): Promise<ArchivedReport[]> {
  return api.get<ArchivedReport[]>(reportArchiveUrl(tenantId, fiscalYearId))
}

/**
 * Files one paper by hand.
 *
 * <p>What is filed is the statutory presentation in the language of the tenant — the request
 * carries no display switch and no language on purpose. A filed row can never be changed or
 * removed; the second filing of the same paper for the same day answers 409 and names the
 * existing one (see {@link archivedReportIdOf}).
 *
 * @param tenantId the tenant
 * @param request which paper, of which year, as of which day
 * @returns the filed paper, without its bytes
 */
export function archiveReport(
  tenantId: number,
  request: ArchiveReportRequest,
): Promise<ArchivedReport> {
  return api.post<ArchivedReport>(reportArchiveUrl(tenantId), request)
}

/**
 * The paper that is already in the cupboard, out of the 409 a second filing is refused with.
 *
 * <p>The backend puts its id beside the sentence as the property `archivedReportId`, so a
 * screen can offer to open it instead of leaving the person to look for it. Anything else — a
 * network failure, a 500, a 409 of another kind — has no such paper and answers `undefined`.
 *
 * @param error whatever the call threw
 * @returns the id of the existing paper, or `undefined` where the failure names none
 */
export function archivedReportIdOf(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined
  const named = (error.details as { archivedReportId?: unknown } | null | undefined)
    ?.archivedReportId
  return typeof named === 'number' && Number.isInteger(named) ? named : undefined
}
