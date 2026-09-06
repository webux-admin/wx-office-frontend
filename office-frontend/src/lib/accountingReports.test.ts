// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REPORT_NAMES,
  accountingPdfUrl,
  archiveReport,
  archivedReportIdOf,
  fetchReportArchive,
  reportArchiveFileUrl,
  reportArchiveKey,
  reportArchiveUrl,
} from './accountingReports'
import { ApiError } from './api'
import type { AccountingReport, ArchivedReport } from './types'

/** What the backend answers for one filed paper — every field of `ArchivedReportDto`. */
const FILED: ArchivedReport = {
  id: 14,
  report: 'balance-sheet',
  origin: 'CLOSING',
  closingNumber: 1,
  title: 'Bilanz',
  asOfDate: '2026-12-31',
  languageCode: 'de',
  byteCount: 184_320,
  sha256: 'f'.repeat(64),
  entryCount: 34,
  lastChainNumber: 1842,
  createdAt: '2027-03-12T08:14:00Z',
  createdBy: 'system',
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('REPORT_NAMES', () => {
  /**
   * <b>Every paper has a name, and the name is the one the head of the paper carries.</b> The
   * record is closed over `AccountingReport`, so a sixth paper without a name would not compile;
   * this pins the five words at run time as well.
   */
  it('reportNamesCoverEveryReportTest', () => {
    const reports: AccountingReport[] = [
      'journal',
      'account-sheets',
      'trial-balance',
      'balance-sheet',
      'income-statement',
    ]

    expect(reports.map((report) => REPORT_NAMES[report])).toEqual([
      'Journal',
      'Kontoblätter',
      'Saldenliste',
      'Bilanz',
      'Erfolgsrechnung',
    ])
    expect(Object.keys(REPORT_NAMES)).toHaveLength(5)
  })
})

describe('accountingPdfUrl', () => {
  /** The same five keys and the same query as the printable page, under `/pdf/` instead. */
  it('accountingPdfUrlTest', () => {
    expect(accountingPdfUrl(7, 'balance-sheet', 3, { asOf: '2026-06-30', hideEmpty: true,
      withAccounts: false })).toBe(
      '/api/tenants/7/accounting/pdf/balance-sheet?fiscalYearId=3&asOf=2026-06-30'
        + '&hideEmpty=true&withAccounts=false',
    )
  })

  /** Without options only the year travels — the three reports without a breakdown want it so. */
  it('accountingPdfUrlWithoutOptionsTest', () => {
    expect(accountingPdfUrl(7, 'journal', 3)).toBe(
      '/api/tenants/7/accounting/pdf/journal?fiscalYearId=3',
    )
    expect(accountingPdfUrl(7, 'trial-balance', 3, {})).toBe(
      '/api/tenants/7/accounting/pdf/trial-balance?fiscalYearId=3',
    )
  })

  /** The account only travels for the sheets, in the same place the printable page puts it. */
  it('accountingPdfUrlWithOneAccountTest', () => {
    expect(accountingPdfUrl(7, 'account-sheets', 3, { accountId: 412, asOf: '2026-06-30' })).toBe(
      '/api/tenants/7/accounting/pdf/account-sheets?fiscalYearId=3&accountId=412&asOf=2026-06-30',
    )
  })

  /**
   * <b>The language is the one thing only the PDF takes</b>, and it goes last. An empty one is
   * left out rather than sent as `language=`, which the backend would read as a language.
   */
  it('accountingPdfUrlWithLanguageTest', () => {
    expect(accountingPdfUrl(7, 'income-statement', 3, { hideEmpty: false, language: 'fr' })).toBe(
      '/api/tenants/7/accounting/pdf/income-statement?fiscalYearId=3&hideEmpty=false&language=fr',
    )
    expect(accountingPdfUrl(7, 'journal', 3, { language: '' })).toBe(
      '/api/tenants/7/accounting/pdf/journal?fiscalYearId=3',
    )
  })

  /** An empty cut-off day is the whole year, not a day called «». */
  it('accountingPdfUrlWithEmptyDayTest', () => {
    expect(accountingPdfUrl(7, 'journal', 3, { asOf: '' })).toBe(
      '/api/tenants/7/accounting/pdf/journal?fiscalYearId=3',
    )
  })
})

describe('reportArchiveUrl', () => {
  /** The list of one year for reading, the bare address for filing. */
  it('reportArchiveUrlTest', () => {
    expect(reportArchiveUrl(7, 3)).toBe('/api/tenants/7/accounting/report-archive?fiscalYearId=3')
  })

  it('reportArchiveUrlWithoutAYearTest', () => {
    expect(reportArchiveUrl(7)).toBe('/api/tenants/7/accounting/report-archive')
  })
})

describe('reportArchiveFileUrl', () => {
  it('reportArchiveFileUrlTest', () => {
    expect(reportArchiveFileUrl(7, 14)).toBe('/api/tenants/7/accounting/report-archive/14')
  })
})

describe('reportArchiveKey', () => {
  it('reportArchiveKeyTest', () => {
    expect(reportArchiveKey(7, 3)).toEqual(['accounting-report-archive', 7, 3])
  })

  /** Two tenants, two years: four keys that never collide in the cache. */
  it('reportArchiveKeyIsPerTenantAndYearTest', () => {
    expect(reportArchiveKey(7, 3)).not.toEqual(reportArchiveKey(8, 3))
    expect(reportArchiveKey(7, 3)).not.toEqual(reportArchiveKey(7, 4))
  })
})

describe('fetchReportArchive', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchReportArchiveTest', async () => {
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/report-archive?fiscalYearId=3')
      expect(init?.method ?? 'GET').toBe('GET')
      return json([FILED, { ...FILED, id: 15, report: 'income-statement',
        title: 'Erfolgsrechnung' }])
    })

    const filed = await fetchReportArchive(7, 3)

    expect(filed.map((paper) => paper.id)).toEqual([14, 15])
    expect(filed[0]).toEqual(FILED)
  })

  /** A year with nothing filed answers an empty list, never 404 — an empty cupboard is no error. */
  it('fetchReportArchiveWithNothingFiledTest', async () => {
    vi.stubGlobal('fetch', () => json([]))

    expect(await fetchReportArchive(7, 3)).toEqual([])
  })

  it('fetchReportArchiveWithFailureTest', async () => {
    vi.stubGlobal('fetch', () => json({ detail: 'kaputt' }, 500))

    await expect(fetchReportArchive(7, 3)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('archiveReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A `POST` to the bare address, with the three fields and nothing else. */
  it('archiveReportTest', async () => {
    let sent: { url: string; method?: string; body: unknown } | undefined
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      sent = { url, method: init?.method, body: JSON.parse(String(init?.body)) }
      return json({ ...FILED, origin: 'MANUAL', closingNumber: null, asOfDate: '2026-06-30' }, 201)
    })

    const filed = await archiveReport(7, {
      report: 'balance-sheet',
      fiscalYearId: 3,
      asOf: '2026-06-30',
    })

    expect(sent?.url).toBe('/api/tenants/7/accounting/report-archive')
    expect(sent?.method).toBe('POST')
    expect(sent?.body).toEqual({ report: 'balance-sheet', fiscalYearId: 3, asOf: '2026-06-30' })
    expect(filed.origin).toBe('MANUAL')
    expect(filed.closingNumber).toBeNull()
  })

  /** Without a cut-off day the whole year is filed; `asOf` travels as `null`, not as a day. */
  it('archiveReportWithoutADayTest', async () => {
    let body: unknown
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return json(FILED, 201)
    })

    await archiveReport(7, { report: 'journal', fiscalYearId: 3, asOf: null })

    expect(body).toEqual({ report: 'journal', fiscalYearId: 3, asOf: null })
  })

  /** The second filing of the same paper for the same day is a 409 that names the first. */
  it('archiveReportTwiceTest', async () => {
    vi.stubGlobal('fetch', () =>
      json({ detail: '«Bilanz» per 30.06.2026 liegt bereits im Archiv.', archivedReportId: 14 },
        409),
    )

    const failure = await archiveReport(7, { report: 'balance-sheet', fiscalYearId: 3 })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(409)
    expect((failure as ApiError).message).toContain('liegt bereits im Archiv')
  })
})

describe('archivedReportIdOf', () => {
  /** The id the backend puts beside its sentence, so the screen can offer to open that paper. */
  it('archivedReportIdOfTest', () => {
    const refusal = new ApiError(409, 'liegt bereits im Archiv', {
      detail: 'liegt bereits im Archiv',
      archivedReportId: 14,
    })

    expect(archivedReportIdOf(refusal)).toBe(14)
  })

  /**
   * <b>Anything that names no paper answers `undefined`.</b> A 409 of another kind — the module
   * is off — carries no id, a 500 carries none, and a network failure is no `ApiError` at all.
   */
  it('archivedReportIdOfSomethingElseTest', () => {
    expect(archivedReportIdOf(new ApiError(409, 'Modul aus', { detail: 'Modul aus' })))
      .toBeUndefined()
    expect(archivedReportIdOf(new ApiError(500, 'kaputt', { archivedReportId: 14 })))
      .toBeUndefined()
    expect(archivedReportIdOf(new ApiError(409, 'x', { archivedReportId: '14' })))
      .toBeUndefined()
    expect(archivedReportIdOf(new ApiError(409, 'x', null))).toBeUndefined()
    expect(archivedReportIdOf(new Error('offline'))).toBeUndefined()
    expect(archivedReportIdOf(null)).toBeUndefined()
    expect(archivedReportIdOf(undefined)).toBeUndefined()
  })
})
