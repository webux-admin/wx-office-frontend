// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_ORDER,
  BOUNDARY_SOURCES,
  CHART_OF_ACCOUNTS_PATH,
  COMPUTED_POSITIONS,
  FISCAL_YEARS_PATH,
  FISCAL_YEAR_STATUS,
  JOURNAL_NUMBER_RANGE_CODE,
  POSITION_PREFIXES,
  TAX_CODES_PATH,
  accountClassOf,
  accountClassTitle,
  accountTypeLabel,
  accountUrl,
  accountingSettingsKey,
  accountingSettingsUrl,
  accountsKey,
  accountsUrl,
  chartTemplatesKey,
  chartTemplatesUrl,
  fetchPositionSuggestion,
  positionSuggestionKey,
  someRoleHoldsAccounting,
  systemKeysKey,
  systemKeysUrl,
  fiscalYearPreviewKey,
  fiscalYearPreviewUrl,
  fiscalYearStatusUrl,
  fiscalYearUrl,
  fiscalYearsKey,
  fiscalYearsUrl,
  suggestFiscalYearEnd,
  suggestFiscalYearStart,
  taxCodesKey,
  taxCodesUrl,
  DRAFT_PATH,
  ENTRY_DRAFT_PREFIX,
  ENTRY_PATH,
  ENTRY_SORT_FIELDS,
  JOURNAL_PATH,
  attentionKey,
  attentionUrl,
  clearEntryDraft,
  createEntry,
  deleteEntry,
  effectPhrase,
  emptyEntryDraft,
  emptyEntryRow,
  entriesKey,
  entriesUrl,
  entryBalance,
  entryDraftKey,
  entryKey,
  entryRequestOf,
  entryTemplateUrl,
  entryTemplatesKey,
  entryTemplatesUrl,
  entryUrl,
  fetchEntrySuggestions,
  ACCOUNTING_ARCHIVE_PATH,
  ACCOUNT_BALANCE_PATH,
  accountSheetPath,
  accountSheetUrl,
  accountingExportUrl,
  accountingPrintUrl,
  balanceSheetKey,
  balanceSheetUrl,
  incomeStatementKey,
  incomeStatementUrl,
  openingEntryKey,
  openingEntryUrl,
  setupStateKey,
  setupStateUrl,
  trialBalanceUrl,
  integrityKey,
  integrityUrl,
  journalKey,
  journalUrl,
  postEntry,
  postingPreviewOf,
  previewPostRun,
  readEntryDraft,
  reverseEntry,
  reversalReasonRoom,
  runPost,
  searchAccounts,
  suggestionsKey,
  suggestionsUrl,
  taxSplitOf,
  updateEntry,
  writeEntryDraft,
  type EntryDraftRow,
} from './accounting'
import type { Account, TaxCode } from './types'

/** A role of the tenant, reduced to what the question is about. */
function role(permissions: string[]) {
  return { permissions }
}

describe('accountingSettingsUrl', () => {
  it('accountingSettingsUrlTest', () => {
    expect(accountingSettingsUrl(7)).toBe('/api/tenants/7/accounting/settings')
  })
})

describe('accountingSettingsKey', () => {
  it('accountingSettingsKeyTest', () => {
    expect(accountingSettingsKey(7)).toEqual(['accounting-settings', 7])
  })

  it('accountingSettingsKeyIsPerTenantTest', () => {
    // Two tenants must not share one cache entry: switching tenant would show the lock date of
    // the one left behind.
    expect(accountingSettingsKey(7)).not.toEqual(accountingSettingsKey(8))
  })
})

describe('ACCOUNTING_RIGHTS', () => {
  /**
   * Five rights, and the lock date runs on `configure`.
   *
   * <p>The decision this test nails down: `postings_locked_until` is a row in the settings, not
   * an act at a fiscal year, so `close` does not open the save button (backend ADR-0119).
   */
  it('accountingRightsTest', () => {
    expect(ACCOUNTING_MODULE).toBe('ACCOUNTING')
    expect(ACCOUNTING_SETTINGS_PATH).toBe('/buchhaltung/einstellungen')
    expect(ACCOUNTING_RIGHTS).toEqual({
      read: 'ACCOUNTING_READ',
      write: 'ACCOUNTING_WRITE',
      post: 'ACCOUNTING_POST',
      configure: 'ACCOUNTING_CONFIGURE',
      close: 'ACCOUNTING_CLOSE',
    })
  })
})

describe('someRoleHoldsAccounting', () => {
  it('someRoleHoldsAccountingTest', () => {
    // One role with one of the five is enough: the question is whether anybody in this tenant
    // may keep books, not whether everybody may.
    const roles = [role(['PARTNER_READ']), role(['ACCOUNTING_READ', 'INVOICE_READ'])]

    expect(someRoleHoldsAccounting(roles)).toBe(true)
  })

  it('someRoleHoldsAccountingWithoutAnyTest', () => {
    const roles = [role(['PARTNER_READ', 'INVOICE_READ']), role([])]

    expect(someRoleHoldsAccounting(roles)).toBe(false)
    expect(someRoleHoldsAccounting([])).toBe(false)
  })

  /** While the roles are still on their way. A hint must not be built on a missing answer. */
  it('someRoleHoldsAccountingWithoutRolesTest', () => {
    expect(someRoleHoldsAccounting(undefined)).toBe(false)
  })
})

describe('the addresses of the chart of accounts', () => {
  it('chartOfAccountsPathTest', () => {
    expect(CHART_OF_ACCOUNTS_PATH).toBe('/buchhaltung/kontenplan')
  })

  it('chartTemplatesUrlTest', () => {
    expect(chartTemplatesUrl(7)).toBe('/api/tenants/7/accounting/chart-templates')
  })

  it('accountsUrlTest', () => {
    expect(accountsUrl(7, 'q=miete&page=0')).toBe(
      '/api/tenants/7/accounting/accounts?q=miete&page=0',
    )
  })

  /** Without a filter no question mark: `…/accounts?` is a different address to a cache. */
  it('accountsUrlWithoutQueryTest', () => {
    expect(accountsUrl(7)).toBe('/api/tenants/7/accounting/accounts')
  })

  it('accountUrlTest', () => {
    expect(accountUrl(7, 42)).toBe('/api/tenants/7/accounting/accounts/42')
  })

  it('systemKeysUrlTest', () => {
    expect(systemKeysUrl(7)).toBe('/api/tenants/7/accounting/accounts/system-keys')
  })
})

describe('the cache keys of the chart of accounts', () => {
  it('chartTemplatesKeyTest', () => {
    expect(chartTemplatesKey(7)).toEqual(['chart-templates', 7])
    expect(chartTemplatesKey(7)).not.toEqual(chartTemplatesKey(8))
  })

  it('accountsKeyTest', () => {
    expect(accountsKey(7, 'page=1')).toEqual(['accounts', 7, 'page=1'])
  })

  /**
   * Two pages must not share one entry, and neither must two tenants: both would show rows
   * that belong somewhere else.
   */
  it('accountsKeyIsPerQueryAndTenantTest', () => {
    expect(accountsKey(7, 'page=1')).not.toEqual(accountsKey(7, 'page=2'))
    expect(accountsKey(7)).not.toEqual(accountsKey(8))
    expect(accountsKey(7)).toEqual(['accounts', 7, ''])
  })

  it('systemKeysKeyTest', () => {
    expect(systemKeysKey(7)).toEqual(['accounting-system-keys', 7])
  })

  it('positionSuggestionKeyTest', () => {
    expect(positionSuggestionKey(7, '6001')).toEqual([
      'accounting-position-suggestion',
      7,
      '6001',
    ])
    expect(positionSuggestionKey(7, '6001')).not.toEqual(positionSuggestionKey(7, '6002'))
  })
})

describe('fetchPositionSuggestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchPositionSuggestionTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      expect(url).toBe(
        '/api/tenants/7/accounting/accounts/position-suggestion?accountNumber=6001',
      )
      return Promise.resolve(
        new Response(
          JSON.stringify({
            accountType: 'EXPENSE',
            orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
            basedOn: '6000',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    })

    const hint = await fetchPositionSuggestion(7, '6001')

    expect(hint?.orPosition).toBe('ER_UEBRIGER_BETRIEBSAUFWAND')
  })

  /**
   * The endpoint answers 204 where the template holds no neighbour. That has to arrive as
   * `null`: a query function that answers `undefined` is an error in TanStack Query, and the
   * proposal would take the dialog down instead of staying away.
   */
  it('fetchPositionSuggestionWithoutHintTest', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })))

    expect(await fetchPositionSuggestion(7, '4711')).toBeNull()
  })
})

describe('accountTypeLabel', () => {
  it('accountTypeLabelTest', () => {
    const entries = [{ code: 'EXPENSE', name: 'Charge' }]

    expect(accountTypeLabel(entries, 'EXPENSE')).toBe('Charge')
  })

  /** While the catalogue is on its way. «ASSET» in the account column reads as a fault. */
  it('accountTypeLabelWithoutCatalogueTest', () => {
    expect(accountTypeLabel([], 'ASSET')).toBe('Aktivum')
    expect(accountTypeLabel([], 'CLOSING')).toBe('Abschluss')
  })
})

describe('ACCOUNT_TYPES', () => {
  /** Six types, and the order of the report rather than the order of the catalogue. */
  it('accountTypesTest', () => {
    expect(Object.keys(ACCOUNT_TYPES)).toHaveLength(6)
    expect(ACCOUNT_TYPE_ORDER).toEqual([
      'ASSET',
      'LIABILITY',
      'EQUITY',
      'REVENUE',
      'EXPENSE',
      'CLOSING',
    ])
    for (const type of ACCOUNT_TYPE_ORDER) {
      expect(ACCOUNT_TYPES[type]).not.toBe('')
      expect(POSITION_PREFIXES[type].length).toBeGreaterThan(0)
    }
  })

  /** Exactly two, and a third would have to be a decision rather than an oversight. */
  it('computedPositionsTest', () => {
    expect(COMPUTED_POSITIONS).toEqual(['ER_JAHRESERGEBNIS', 'ABSCHLUSS'])
  })
})

describe('accountClassOf', () => {
  it('accountClassOfTest', () => {
    expect(accountClassOf('6000')).toBe(6)
  })

  /** The chart of accounts is extendable, and a dot changes nothing about the class. */
  it('accountClassOfWithDotNotationTest', () => {
    expect(accountClassOf('1020.1')).toBe(1)
  })

  /** A leading zero is part of the number, and 0 is a class like any other. */
  it('accountClassOfWithLeadingZeroTest', () => {
    expect(accountClassOf('0100')).toBe(0)
  })

  /** Nothing to group by: the table then draws no rule instead of one that says nothing. */
  it('accountClassOfWithoutDigitTest', () => {
    expect(accountClassOf('')).toBeUndefined()
    expect(accountClassOf('A100')).toBeUndefined()
  })
})

describe('accountClassTitle', () => {
  it('accountClassTitleTest', () => {
    expect(accountClassTitle(1)).toBe('Aktiven')
    expect(accountClassTitle(9)).toBe('Abschluss')
  })

  /** Class 0 is allowed by the number check and has no name of its own. */
  it('accountClassTitleWithoutTitleTest', () => {
    expect(accountClassTitle(0)).toBe('Klasse 0')
  })
})

describe('taxCodesUrl', () => {
  it('taxCodesUrlTest', () => {
    expect(taxCodesUrl(7)).toBe('/api/tenants/7/accounting/tax-codes')
  })

  /** The screen lives beside the chart of accounts; both are read by everything that posts. */
  it('taxCodesPathTest', () => {
    expect(TAX_CODES_PATH).toBe('/buchhaltung/steuercodes')
  })
})

describe('taxCodesKey', () => {
  it('taxCodesKeyTest', () => {
    expect(taxCodesKey(7)).toEqual(['accounting-tax-codes', 7])
  })

  it('taxCodesKeyIsPerTenantTest', () => {
    // Two tenants must not share one cache entry: the codes point at the accounts of one
    // tenant, and after a switch the list would name accounts of the tenant left behind.
    expect(taxCodesKey(7)).not.toEqual(taxCodesKey(8))
  })
})

// --- die Geschaeftsjahre -------------------------------------------------------------------

describe('the addresses of the fiscal years', () => {
  it('fiscalYearsPathTest', () => {
    expect(FISCAL_YEARS_PATH).toBe('/buchhaltung/geschaeftsjahre')
  })

  it('fiscalYearsUrlTest', () => {
    expect(fiscalYearsUrl(7)).toBe('/api/tenants/7/accounting/fiscal-years')
  })

  it('fiscalYearUrlTest', () => {
    expect(fiscalYearUrl(7, 12)).toBe('/api/tenants/7/accounting/fiscal-years/12')
  })

  it('fiscalYearStatusUrlTest', () => {
    expect(fiscalYearStatusUrl(7, 12)).toBe('/api/tenants/7/accounting/fiscal-years/12/status')
  })

  it('fiscalYearPreviewUrlTest', () => {
    expect(fiscalYearPreviewUrl(7, '2027-01-01', '2027-12-31')).toBe(
      '/api/tenants/7/accounting/fiscal-years/preview?start=2027-01-01&end=2027-12-31',
    )
  })

  /** Both parameters are compulsory, so a half filled field still travels — and gets a 400. */
  it('fiscalYearPreviewUrlWithAnEmptyEndTest', () => {
    expect(fiscalYearPreviewUrl(7, '2027-01-01', '')).toBe(
      '/api/tenants/7/accounting/fiscal-years/preview?start=2027-01-01&end=',
    )
  })

  /**
   * The typed series travels, and the backend judges it instead of the one it reads off the
   * dates. Without this the second period of a split year could not be laid out at all.
   */
  it('fiscalYearPreviewUrlWithTheTypedSeriesTest', () => {
    expect(fiscalYearPreviewUrl(7, '2026-07-01', '2026-12-31', undefined, 2027)).toBe(
      '/api/tenants/7/accounting/fiscal-years/preview'
        + '?start=2026-07-01&end=2026-12-31&numberYear=2027',
    )
  })

  /** A name may carry a space and an umlaut, so it goes through `encodeURIComponent`. */
  it('fiscalYearPreviewUrlWithTheTypedLabelTest', () => {
    expect(
      fiscalYearPreviewUrl(7, '2026-07-01', '2026-12-31', 'Gründungsjahr 2', 2027),
    ).toBe(
      '/api/tenants/7/accounting/fiscal-years/preview'
        + '?start=2026-07-01&end=2026-12-31&label=Gr%C3%BCndungsjahr%202&numberYear=2027',
    )
  })

  /** Nothing typed, nothing sent: then the backend judges its own proposal, as before. */
  it('fiscalYearPreviewUrlWithoutOverridesTest', () => {
    expect(fiscalYearPreviewUrl(7, '2027-01-01', '2027-12-31', '', undefined)).toBe(
      '/api/tenants/7/accounting/fiscal-years/preview?start=2027-01-01&end=2027-12-31',
    )
  })
})

describe('the cache keys of the fiscal years', () => {
  it('fiscalYearsKeyTest', () => {
    expect(fiscalYearsKey(7)).toEqual(['accounting-fiscal-years', 7])
  })

  /**
   * The one key both screens read under.
   *
   * <p>The warning stands on the fiscal year screen and on the settings screen, and a second
   * key would be a second cached answer — one of the two would say «noch 30 Tage» while the
   * other already knew better.
   */
  it('fiscalYearsKeyIsPerTenantTest', () => {
    expect(fiscalYearsKey(7)).not.toEqual(fiscalYearsKey(8))
  })

  it('fiscalYearPreviewKeyTest', () => {
    expect(fiscalYearPreviewKey(7, '2027-01-01', '2027-12-31')).toEqual([
      'accounting-fiscal-year-preview',
      7,
      '2027-01-01',
      '2027-12-31',
      '',
      null,
    ])
  })

  it('fiscalYearPreviewKeyWithOverridesTest', () => {
    expect(fiscalYearPreviewKey(7, '2026-07-01', '2026-12-31', '2. Halbjahr', 2027)).toEqual([
      'accounting-fiscal-year-preview',
      7,
      '2026-07-01',
      '2026-12-31',
      '2. Halbjahr',
      2027,
    ])
  })

  it('fiscalYearPreviewKeyIsPerRangeTest', () => {
    expect(fiscalYearPreviewKey(7, '2027-01-01', '2027-12-31')).not.toEqual(
      fiscalYearPreviewKey(7, '2027-01-01', '2028-12-31'),
    )
  })

  /**
   * The one that had been missing.
   *
   * <p>Same range, other series, other key — otherwise the answer to the first series stays in
   * the cache, the corrected series never travels, and the dialog blocks itself for good.
   */
  it('fiscalYearPreviewKeyIsPerSeriesTest', () => {
    expect(
      fiscalYearPreviewKey(7, '2026-07-01', '2026-12-31', '', 2027),
    ).not.toEqual(fiscalYearPreviewKey(7, '2026-07-01', '2026-12-31'))
  })

  it('fiscalYearPreviewKeyIsPerLabelTest', () => {
    expect(
      fiscalYearPreviewKey(7, '2026-07-01', '2026-12-31', 'Rumpfjahr'),
    ).not.toEqual(fiscalYearPreviewKey(7, '2026-07-01', '2026-12-31', 'Gründungsjahr'))
  })
})

describe('FISCAL_YEAR_STATUS', () => {
  it('fiscalYearStatusTest', () => {
    expect(FISCAL_YEAR_STATUS).toEqual({
      OPEN: 'Offen',
      LOCKED: 'Gesperrt',
      CLOSED: 'Abgeschlossen',
    })
  })

  /** Three and only three: a fourth state would have to be decided, not invented in a mask. */
  it('fiscalYearStatusIsClosedTest', () => {
    expect(Object.keys(FISCAL_YEAR_STATUS)).toHaveLength(3)
  })
})

describe('BOUNDARY_SOURCES', () => {
  /**
   * Four sources against the six barriers of the per-day answer.
   *
   * <p>A missing fiscal year is no date on the time axis and has no counterpart here; the two
   * states of a year that binds fall together on one source, because at this place a reader
   * wants to know that a year binds and not which of the two it stands in (backend ADR-0113).
   */
  it('boundarySourcesTest', () => {
    expect(BOUNDARY_SOURCES).toEqual({
      NONE: 'Nichts gesperrt',
      FISCAL_YEAR: 'Geschäftsjahr',
      LOCK_DATE: 'Sperrdatum der Buchhaltung',
      VAT_PERIOD: 'MWST-Abrechnung',
    })
  })

  it('boundarySourcesHasNoBarrierForAMissingYearTest', () => {
    expect(Object.keys(BOUNDARY_SOURCES)).toHaveLength(4)
    expect(Object.keys(BOUNDARY_SOURCES)).not.toContain('NO_FISCAL_YEAR')
  })
})

describe('JOURNAL_NUMBER_RANGE_CODE', () => {
  it('journalNumberRangeCodeTest', () => {
    expect(JOURNAL_NUMBER_RANGE_CODE).toBe('JOURNAL')
  })
})

describe('suggestFiscalYearStart', () => {
  /** The ordinary case: the next year starts the day after the last one ends. */
  it('suggestFiscalYearStartTest', () => {
    const years = [{ endDate: '2025-12-31' }, { endDate: '2026-12-31' }]

    expect(suggestFiscalYearStart(years, 1, new Date(2026, 8, 3))).toBe('2027-01-01')
  })

  /** The order of the list says nothing; the latest end date does. */
  it('suggestFiscalYearStartWithUnsortedYearsTest', () => {
    const years = [{ endDate: '2026-12-31' }, { endDate: '2024-12-31' }]

    expect(suggestFiscalYearStart(years, 1, new Date(2026, 8, 3))).toBe('2027-01-01')
  })

  /** Without a year the tenant's own start month decides, in the year it is running in. */
  it('suggestFiscalYearStartWithoutYearsTest', () => {
    expect(suggestFiscalYearStart([], 1, new Date(2026, 8, 3))).toBe('2026-01-01')
  })

  /** A fiscal year beginning in July: on the 3rd of March the running one began last July. */
  it('suggestFiscalYearStartWithALaterStartMonthTest', () => {
    expect(suggestFiscalYearStart([], 7, new Date(2026, 2, 3))).toBe('2025-07-01')
  })

  /** The very first day of that month is inside the running year, not before it. */
  it('suggestFiscalYearStartOnTheFirstDayOfTheMonthTest', () => {
    expect(suggestFiscalYearStart([], 7, new Date(2026, 6, 1))).toBe('2026-07-01')
  })

  /** A month outside 1 to 12 cannot build a date; it is pulled back into the range. */
  it('suggestFiscalYearStartWithAnImpossibleMonthTest', () => {
    expect(suggestFiscalYearStart([], 0, new Date(2026, 8, 3))).toBe('2026-01-01')
    expect(suggestFiscalYearStart([], 13, new Date(2026, 8, 3))).toBe('2025-12-01')
  })

  /** The last day of a year rolls the proposal into the next one. */
  it('suggestFiscalYearStartAfterALeapDayTest', () => {
    expect(suggestFiscalYearStart([{ endDate: '2028-02-29' }], 1, new Date(2028, 1, 1))).toBe(
      '2028-03-01',
    )
  })
})

describe('suggestFiscalYearEnd', () => {
  it('suggestFiscalYearEndTest', () => {
    expect(suggestFiscalYearEnd('2027-01-01')).toBe('2027-12-31')
  })

  /** A year beginning mid-month ends the day before the same day a year on. */
  it('suggestFiscalYearEndInTheMiddleOfAMonthTest', () => {
    expect(suggestFiscalYearEnd('2026-07-15')).toBe('2027-07-14')
  })

  /** Over a leap day: the 29th of February has no counterpart, so the 28th is proposed. */
  it('suggestFiscalYearEndOverALeapDayTest', () => {
    expect(suggestFiscalYearEnd('2028-02-29')).toBe('2029-02-28')
  })

  /** And into one: the leap day itself is the last day of that year. */
  it('suggestFiscalYearEndIntoALeapYearTest', () => {
    expect(suggestFiscalYearEnd('2027-03-01')).toBe('2028-02-29')
  })
})

// --- die Buchung ---------------------------------------------------------------------------

/** An account of the chart, reduced to what the questions here are about. */
function testAccount(over: Partial<Account>): Account {
  return {
    id: 1,
    accountNumber: '1020',
    name: 'Bankguthaben',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
    ...over,
  }
}

const CHART: Account[] = [
  testAccount({ id: 1, accountNumber: '1020', name: 'Bankguthaben' }),
  testAccount({
    id: 2,
    accountNumber: '2200',
    name: 'Umsatzsteuer',
    accountType: 'LIABILITY',
    orPosition: 'KFK_UEBRIGE',
  }),
  testAccount({
    id: 3,
    accountNumber: '3400',
    name: 'Dienstleistungsertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
  }),
  testAccount({
    id: 4,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
  }),
  testAccount({
    id: 5,
    accountNumber: '6105',
    name: 'Stillgelegt',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
    active: false,
  }),
  testAccount({
    id: 6,
    accountNumber: '9200',
    name: 'Jahresergebnis',
    accountType: 'CLOSING',
    orPosition: 'ABSCHLUSS',
    directPostingAllowed: false,
  }),
]

/** The output code at the normal rate, with its tax account. */
const UST81: TaxCode = {
  id: 11,
  code: 'UST81',
  name: 'Umsatzsteuer 8.1 %',
  direction: 'OUTPUT',
  kind: 'NORMAL',
  rate: 8.1,
  taxAccountNumber: '2200',
  taxAccountName: 'Umsatzsteuer',
  estvDigit: '302',
  inTurnoverTotal: true,
  validFrom: '2024-01-01',
  active: true,
  sortOrder: 100,
}

/** One of the real zero-rate cases: nothing is owed, so nothing is booked. */
const USTEX: TaxCode = { ...UST81, id: 12, code: 'USTEX', name: 'Von der Steuer befreit', rate: 0 }

function draftRow(over: Partial<EntryDraftRow>): EntryDraftRow {
  return { ...emptyEntryRow(1), ...over }
}

describe('ENTRY_PATH', () => {
  it('entryPathsTest', () => {
    expect(ENTRY_PATH).toBe('/buchhaltung/buchen')
    expect(DRAFT_PATH).toBe('/buchhaltung/entwuerfe')
    expect(JOURNAL_PATH).toBe('/buchhaltung/journal')
  })
})

describe('entriesUrl', () => {
  it('entriesUrlTest', () => {
    expect(entriesUrl(7, 'page=1&size=50')).toBe(
      '/api/tenants/7/accounting/entries?page=1&size=50',
    )
  })

  /** Nothing asked for: no `?` either, which the server would read as an empty filter. */
  it('entriesUrlWithoutQueryTest', () => {
    expect(entriesUrl(7)).toBe('/api/tenants/7/accounting/entries')
  })
})

describe('entryUrl', () => {
  it('entryUrlTest', () => {
    expect(entryUrl(7, 45)).toBe('/api/tenants/7/accounting/entries/45')
  })
})

describe('attentionUrl', () => {
  it('attentionUrlTest', () => {
    expect(attentionUrl(7)).toBe('/api/tenants/7/accounting/entries/attention')
  })
})

describe('journalUrl', () => {
  it('journalUrlTest', () => {
    expect(journalUrl(7, 'fiscalYearId=3')).toBe(
      '/api/tenants/7/accounting/journal?fiscalYearId=3',
    )
  })

  it('journalUrlWithoutQueryTest', () => {
    expect(journalUrl(7)).toBe('/api/tenants/7/accounting/journal')
  })
})

describe('trialBalanceUrl', () => {
  it('trialBalanceUrlTest', () => {
    expect(trialBalanceUrl(7, 'fiscalYearId=3&page=0')).toBe(
      '/api/tenants/7/accounting/trial-balance?fiscalYearId=3&page=0',
    )
  })

  it('trialBalanceUrlWithoutFiltersTest', () => {
    expect(trialBalanceUrl(7)).toBe('/api/tenants/7/accounting/trial-balance')
  })
})

describe('accountSheetUrl', () => {
  it('accountSheetUrlTest', () => {
    expect(accountSheetUrl(7, 412, 'fiscalYearId=3')).toBe(
      '/api/tenants/7/accounting/account-sheet/412?fiscalYearId=3',
    )
  })

  it('accountSheetUrlWithoutQueryTest', () => {
    expect(accountSheetUrl(7, 412)).toBe('/api/tenants/7/accounting/account-sheet/412')
  })
})

describe('accountSheetPath', () => {
  /** The address the drill-down out of the trial balance builds out of a row. */
  it('accountSheetPathTest', () => {
    expect(accountSheetPath(412)).toBe('/buchhaltung/konten/412')
    expect(ACCOUNT_BALANCE_PATH).toBe('/buchhaltung/konten')
    expect(ACCOUNTING_ARCHIVE_PATH).toBe('/buchhaltung/archiv')
  })
})

describe('accountingExportUrl', () => {
  /** One year per call: ten years in one request is the difference between a file and a timeout. */
  it('accountingExportUrlTest', () => {
    expect(accountingExportUrl(7, 3)).toBe('/api/tenants/7/accounting/export?fiscalYearId=3')
  })
})

describe('accountingPrintUrl', () => {
  it('accountingPrintUrlTest', () => {
    expect(accountingPrintUrl(7, 'journal', 3)).toBe(
      '/api/tenants/7/accounting/print/journal?fiscalYearId=3',
    )
    expect(accountingPrintUrl(7, 'trial-balance', 3)).toBe(
      '/api/tenants/7/accounting/print/trial-balance?fiscalYearId=3',
    )
  })

  /** The account only travels for the sheets, which is the one report that takes one. */
  it('accountingPrintUrlWithOneAccountTest', () => {
    expect(accountingPrintUrl(7, 'account-sheets', 3, { accountId: 412 })).toBe(
      '/api/tenants/7/accounting/print/account-sheets?fiscalYearId=3&accountId=412',
    )
  })
})

describe('integrityUrl', () => {
  it('integrityUrlTest', () => {
    expect(integrityUrl(7)).toBe('/api/tenants/7/accounting/integrity')
  })
})

describe('entriesKey', () => {
  it('entriesKeyTest', () => {
    expect(entriesKey(7, 'page=1')).toEqual(['accounting-entries', 7, 'page=1'])
  })

  /** Every key of this module carries the tenant, so two tenants never share a cache. */
  it('entryKeysArePerTenantTest', () => {
    expect(entryKey(7, 45)).toEqual(['accounting-entry', 7, 45])
    expect(attentionKey(7)).toEqual(['accounting-attention', 7])
    expect(journalKey(7, '')).toEqual(['accounting-journal', 7, ''])
    expect(integrityKey(7)).toEqual(['accounting-integrity', 7])
    expect(entriesKey(8, 'page=1')).not.toEqual(entriesKey(7, 'page=1'))
  })
})

describe('ENTRY_SORT_FIELDS', () => {
  /** Word for word the whitelist of the endpoint: anything else answers 400. */
  it('entrySortFieldsTest', () => {
    expect([...ENTRY_SORT_FIELDS]).toEqual([
      'entryNumber',
      'description',
      'documentReference',
      'bookingDate',
      'postedAt',
      'createdAt',
    ])
  })
})

describe('fetchEntrySuggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * The everyday call. The term is trimmed before it goes into the query string: what the
   * server matches on is the text, and a trailing space somebody has just typed would find
   * nothing while looking as if the suggestion had stopped working.
   */
  it('fetchEntrySuggestionsTest', async () => {
    let seen = ''
    vi.stubGlobal('fetch', (url: string) => {
      seen = url
      return Promise.resolve(
        new Response(JSON.stringify([{ text: 'Miete September', useCount: 11 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    const found = await fetchEntrySuggestions(1, ' Miete ', 8)

    expect(seen).toBe(suggestionsUrl(1, 'Miete', 8))
    expect(found[0].text).toBe('Miete September')
  })

  /**
   * <b>Under two characters nothing goes out at all.</b> One character finds no usable choice
   * among a thousand entries and would cost a request on every keystroke; the server answers
   * such a term empty anyway, so asking it is a round trip for a known answer. Held here and
   * not only in the field: this is the last place before the network.
   */
  it('fetchEntrySuggestionsWithOneCharacterTest', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      return Promise.resolve(new Response('[]', { status: 200 }))
    })

    // A single character, and a single character with the padding somebody types around it.
    expect(await fetchEntrySuggestions(1, 'M')).toEqual([])
    expect(await fetchEntrySuggestions(1, ' M ')).toEqual([])
    expect(await fetchEntrySuggestions(1, '')).toEqual([])

    expect(asked).toEqual([])
  })
})

describe('createEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('createEntryTest', async () => {
    let seen: { url: string; method?: string; body?: unknown } = { url: '' }
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      seen = { url, method: init.method, body: JSON.parse(String(init.body)) }
      return Promise.resolve(
        new Response(JSON.stringify({ id: 45, posted: false }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    const stored = await createEntry(7, {
      bookingDate: '2026-09-09',
      description: 'Miete September',
      documentReference: 'MB-144',
      lines: [{ accountId: 4, debit: 3200 }],
    })

    expect(seen.url).toBe('/api/tenants/7/accounting/entries')
    expect(seen.method).toBe('POST')
    expect(stored.id).toBe(45)
  })

  /** The sentence of the backend arrives as the message, not a status text of our own. */
  it('createEntryWhenUnbalancedTest', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: 'Soll 3’200.00, Haben 3’000.00, Differenz 200.00' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(
      createEntry(7, {
        bookingDate: '2026-09-09',
        description: 'Miete',
        documentReference: 'MB-144',
        lines: [],
      }),
    ).rejects.toThrow('Soll 3’200.00, Haben 3’000.00, Differenz 200.00')
  })
})

describe('updateEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updateEntryTest', async () => {
    let method = ''
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/entries/45')
      method = String(init.method)
      return Promise.resolve(
        new Response(JSON.stringify({ id: 45 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    await updateEntry(7, 45, {
      bookingDate: '2026-09-09',
      description: 'Miete',
      documentReference: 'MB-144',
      lines: [],
    })

    expect(method).toBe('PUT')
  })
})

describe('deleteEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deleteEntryTest', async () => {
    let method = ''
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/entries/45')
      method = String(init.method)
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    await deleteEntry(7, 45)

    expect(method).toBe('DELETE')
  })

  /** Posted is posted: the backend answers 409 and says so. */
  it('deleteEntryWhenPostedTest', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify({ detail: 'Die Buchung ist verbucht.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(deleteEntry(7, 45)).rejects.toThrow('Die Buchung ist verbucht.')
  })
})

describe('postEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('postEntryTest', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/entries/45/post')
      expect(init.method).toBe('POST')
      return Promise.resolve(
        new Response(JSON.stringify({ id: 45, entryNumber: '2026-000045', posted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    expect((await postEntry(7, 45)).entryNumber).toBe('2026-000045')
  })
})

describe('reverseEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reverseEntryTest', async () => {
    let body: unknown = null
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/entries/45/reverse')
      body = JSON.parse(String(init.body))
      return Promise.resolve(
        new Response(JSON.stringify({ id: 46, reversesEntryId: 45 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    const counter = await reverseEntry(7, 45, { reversalReason: 'falsches Konto' })

    expect(body).toEqual({ reversalReason: 'falsches Konto' })
    expect(counter.reversesEntryId).toBe(45)
  })
})

describe('reversalReasonRoom', () => {
  /** The ordinary case: a journal number of eleven characters leaves 177 of the 200. */
  it('reversalReasonRoomTest', () => {
    expect(reversalReasonRoom('2026-000045')).toBe(177)
  })

  /**
   * It follows the number rather than being a second constant. A longer number leaves less
   * room, and a mask that hard coded 177 would let the same two sentences through into a 400.
   */
  it('reversalReasonRoomWithALongerNumberTest', () => {
    expect(reversalReasonRoom('2026-RE-00000045')).toBe(172)
  })

  /** No number yet — the shut dialog asks before it knows one — and the full room is left. */
  it('reversalReasonRoomWithoutANumberTest', () => {
    expect(reversalReasonRoom('')).toBe(188)
  })

  /** A number longer than the whole text never yields a negative `maxLength`. */
  it('reversalReasonRoomWithAnAbsurdNumberTest', () => {
    expect(reversalReasonRoom('X'.repeat(300))).toBe(0)
  })
})

describe('previewPostRun', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Repeated and not comma separated: that is how the endpoint reads a list. */
  it('previewPostRunTest', async () => {
    let seen = ''
    vi.stubGlobal('fetch', (url: string) => {
      seen = url
      return Promise.resolve(
        new Response(
          JSON.stringify({ postable: [1, 2], blocked: [], firstNumber: null, lastNumber: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    })

    const preview = await previewPostRun(7, [1, 2])

    expect(seen).toBe(
      '/api/tenants/7/accounting/entries/post-run/preview?entryIds=1&entryIds=2',
    )
    expect(preview.postable).toEqual([1, 2])
    // Always empty in this stage — the dialog therefore names no number range.
    expect(preview.firstNumber).toBeNull()
  })

  /** Nothing ticked: no parameter at all, and the endpoint reads that as an empty selection. */
  it('previewPostRunWithoutSelectionTest', async () => {
    let seen = ''
    vi.stubGlobal('fetch', (url: string) => {
      seen = url
      return Promise.resolve(
        new Response(JSON.stringify({ postable: [], blocked: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    await previewPostRun(7, [])

    expect(seen).toBe('/api/tenants/7/accounting/entries/post-run/preview')
  })
})

describe('runPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runPostTest', async () => {
    let body: unknown = null
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      expect(url).toBe('/api/tenants/7/accounting/entries/post-run')
      body = JSON.parse(String(init.body))
      return Promise.resolve(
        new Response(JSON.stringify({ posted: [], skipped: [], failed: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    const result = await runPost(7, [1, 2])

    expect(body).toEqual({ entryIds: [1, 2] })
    expect(result.posted).toEqual([])
  })
})

describe('searchAccounts', () => {
  it('searchAccountsTest', () => {
    expect(searchAccounts(CHART, 'miete')).toEqual([])
    expect(searchAccounts(CHART, 'raum').map((account) => account.accountNumber)).toEqual(['6000'])
    expect(searchAccounts(CHART, '60').map((account) => account.accountNumber)).toEqual(['6000'])
  })

  /** An empty term offers the whole chart, which is what an opened field shows. */
  it('searchAccountsWithoutTermTest', () => {
    expect(searchAccounts(CHART, '').map((account) => account.accountNumber)).toEqual([
      '1020',
      '2200',
      '3400',
      '6000',
    ])
  })

  /**
   * Switched off, and «only for the system»: neither appears. **A convenience and no barrier** —
   * the barrier stands in `PostingRules` and in a database guard.
   */
  it('searchAccountsLeavesTheBlockedOnesOutTest', () => {
    expect(searchAccounts(CHART, 'Stillgelegt')).toEqual([])
    expect(searchAccounts(CHART, '9200')).toEqual([])
  })

  it('searchAccountsWithoutAMatchTest', () => {
    expect(searchAccounts(CHART, 'zzz')).toEqual([])
  })

  it('searchAccountsHonoursTheLimitTest', () => {
    expect(searchAccounts(CHART, '', 2)).toHaveLength(2)
  })
})

describe('entryBalance', () => {
  it('entryBalanceTest', () => {
    const balance = entryBalance([
      { debit: '1250.00', credit: '' },
      { debit: '', credit: '1000.00' },
      { debit: '', credit: '250.00' },
    ])

    expect(balance).toEqual({ debit: 1250, credit: 1250, difference: 0 })
  })

  /** Nothing typed: three zeros, and the line still stands there. */
  it('entryBalanceWithoutRowsTest', () => {
    expect(entryBalance([])).toEqual({ debit: 0, credit: 0, difference: 0 })
  })

  /** One side only: the difference is the amount, which is what turns the figure red. */
  it('entryBalanceWithOneSideTest', () => {
    expect(entryBalance([{ debit: '3200', credit: '' }]).difference).toBe(3200)
  })

  /**
   * Three thirds of 1'250.00 add up exactly. Counted in francs as binary fractions the sum
   * misses by a hair and would be shown as 0.00 and be red.
   */
  it('entryBalanceAtARoundingBoundaryTest', () => {
    const balance = entryBalance([
      { debit: '416.66', credit: '' },
      { debit: '416.67', credit: '' },
      { debit: '416.67', credit: '' },
      { debit: '', credit: '1250.00' },
    ])

    expect(balance.difference).toBe(0)
  })

  /** Swiss keyboards: comma as the decimal mark, apostrophe as the thousands separator. */
  it('entryBalanceWithATypedApostropheTest', () => {
    expect(entryBalance([{ debit: "1'250,50", credit: '' }]).debit).toBe(1250.5)
  })

  /**
   * What is no number at all counts as nothing rather than as NaN — a sum that reads «-» while
   * somebody types would be worse than one that is briefly too small.
   *
   * <p>A trailing decimal mark still reads as the whole number, which is the friendly answer
   * halfway through «1250,50».
   */
  it('entryBalanceWithAHalfTypedAmountTest', () => {
    expect(entryBalance([{ debit: '1,2,3', credit: '' }]).debit).toBe(0)
    expect(entryBalance([{ debit: '1250,', credit: '' }]).debit).toBe(1250)
  })
})

describe('effectPhrase', () => {
  it('effectPhraseTest', () => {
    expect(effectPhrase('EXPENSE', 'debit')).toBe('Aufwand steigt um')
    expect(effectPhrase('ASSET', 'credit')).toBe('Guthaben sinkt um')
  })

  /** The whole table of ADR-0045 section 3, both sides. */
  it('effectPhraseForEveryAccountTypeTest', () => {
    expect(effectPhrase('ASSET', 'debit')).toBe('Guthaben steigt um')
    expect(effectPhrase('LIABILITY', 'debit')).toBe('Schuld sinkt um')
    expect(effectPhrase('LIABILITY', 'credit')).toBe('Schuld steigt um')
    expect(effectPhrase('EQUITY', 'debit')).toBe('Eigenkapital sinkt um')
    expect(effectPhrase('EQUITY', 'credit')).toBe('Eigenkapital steigt um')
    expect(effectPhrase('EXPENSE', 'credit')).toBe('Aufwand sinkt um')
    expect(effectPhrase('REVENUE', 'debit')).toBe('Ertrag sinkt um')
    expect(effectPhrase('REVENUE', 'credit')).toBe('Ertrag steigt um')
  })

  /** `CLOSING` is not in the table, and the one shipped cannot be posted to by hand. */
  it('effectPhraseForAClosingAccountTest', () => {
    expect(effectPhrase('CLOSING', 'debit')).toBeUndefined()
  })

  /** No account picked yet: nothing to say about it. */
  it('effectPhraseWithoutAnAccountTest', () => {
    expect(effectPhrase(null, 'debit')).toBeUndefined()
  })
})

describe('taxSplitOf', () => {
  /** The example of the decision: gross 1'080.10 at 8.1 % is 999.17 plus 80.93. */
  it('taxSplitOfTest', () => {
    expect(taxSplitOf(1080.1, 8.1)).toEqual({ net: 999.17, tax: 80.93 })
  })

  /** A real zero-rate case books nothing at all. */
  it('taxSplitOfWithZeroRateTest', () => {
    expect(taxSplitOf(1080.1, 0)).toBeNull()
  })

  /** Nothing to move: no line either. */
  it('taxSplitOfWithATinyAmountTest', () => {
    expect(taxSplitOf(0.01, 0.001)).toBeNull()
  })

  /** Net plus tax is the gross again, always — the tax is the remainder, never rounded twice. */
  it('taxSplitOfAddsUpTest', () => {
    const split = taxSplitOf(100.05, 2.6)

    expect(Math.round(((split?.net ?? 0) + (split?.tax ?? 0)) * 100) / 100).toBe(100.05)
  })
})

describe('postingPreviewOf', () => {
  it('postingPreviewOfTest', () => {
    const lines = postingPreviewOf(
      [
        draftRow({ key: 1, accountId: 4, debit: '3200' }),
        draftRow({ key: 2, accountId: 1, credit: '3200' }),
      ],
      CHART,
      [],
    )

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ accountNumber: '6000', side: 'debit', amount: 3200 })
    expect(lines[1]).toMatchObject({ accountNumber: '1020', side: 'credit', amount: 3200 })
  })

  /**
   * The tax is taken **out of** the typed line and moves to the tax account on the same side.
   * Any other construction leaves the entry unbalanced.
   */
  it('postingPreviewOfWithATaxCodeTest', () => {
    const lines = postingPreviewOf(
      [
        draftRow({ key: 1, accountId: 1, debit: '1080.10' }),
        draftRow({ key: 2, accountId: 3, credit: '1080.10', taxCodeId: 11 }),
      ],
      CHART,
      [UST81],
    )

    expect(lines).toHaveLength(3)
    expect(lines[1]).toMatchObject({ accountNumber: '3400', side: 'credit', amount: 999.17 })
    expect(lines[2]).toMatchObject({
      accountNumber: '2200',
      side: 'credit',
      amount: 80.93,
      generated: true,
      text: 'MWST UST81 zu Zeile 2',
    })
  })

  /** A zero-rate code adds no line: nothing is owed. */
  it('postingPreviewOfWithAZeroRateCodeTest', () => {
    const lines = postingPreviewOf(
      [draftRow({ key: 1, accountId: 3, credit: '1080.10', taxCodeId: 12 })],
      CHART,
      [USTEX],
    )

    expect(lines).toHaveLength(1)
    expect(lines[0].amount).toBe(1080.1)
  })

  /**
   * «zu Zeile n» names the line the backend will write, not the row of the grid.
   * {@link entryRequestOf} leaves the row without an account out and the server numbers what
   * arrives from one — the box would otherwise name a line the journal never shows.
   */
  it('postingPreviewOfNumbersTheLinesThatAreSentTest', () => {
    const lines = postingPreviewOf(
      [
        draftRow({ key: 1 }),
        draftRow({ key: 2, accountId: 1, debit: '1080.10' }),
        draftRow({ key: 3, accountId: 3, credit: '1080.10', taxCodeId: 11 }),
      ],
      CHART,
      [UST81],
    )

    expect(lines).toHaveLength(3)
    expect(lines[2].text).toBe('MWST UST81 zu Zeile 2')
  })

  /** A row without an account or without an amount is the one somebody stopped typing in. */
  it('postingPreviewOfWithAnEmptyRowTest', () => {
    expect(postingPreviewOf([draftRow({ key: 1 })], CHART, [])).toEqual([])
    expect(postingPreviewOf([draftRow({ key: 1, accountId: 4 })], CHART, [])).toEqual([])
  })
})

describe('entryRequestOf', () => {
  it('entryRequestOfTest', () => {
    const request = entryRequestOf({
      bookingDate: '2026-09-09',
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [
        draftRow({ key: 1, accountId: 4, debit: '3200' }),
        draftRow({ key: 2, accountId: 1, credit: '3200' }),
      ],
    })

    expect(request.lines).toEqual([
      { accountId: 4, debit: 3200, credit: null, taxCodeId: null },
      { accountId: 1, debit: null, credit: 3200, taxCodeId: null },
    ])
    expect(request.bookingDate).toBe('2026-09-09')
  })

  /** The last row of a grid is almost always the empty one; it is not sent. */
  it('entryRequestOfWithoutAnAccountTest', () => {
    const request = entryRequestOf({
      ...emptyEntryDraft('2026-09-09'),
      rows: [draftRow({ key: 1, accountId: 4, debit: '3200' }), draftRow({ key: 2 })],
    })

    expect(request.lines).toHaveLength(1)
  })

  /** No line number travels: the server numbers them 1..n in the order they arrive. */
  it('entryRequestOfSendsNoLineNumberTest', () => {
    const request = entryRequestOf({
      ...emptyEntryDraft('2026-09-09'),
      rows: [draftRow({ key: 9, accountId: 4, debit: '1' })],
    })

    expect(Object.keys(request.lines[0]).sort()).toEqual([
      'accountId',
      'credit',
      'debit',
      'taxCodeId',
    ])
  })
})

describe('entryDraftKey', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  /** The key is exactly this, and the tenant id is the point of it. */
  it('entryDraftKeyTest', () => {
    expect(entryDraftKey(7)).toBe('accounting.draft.7')
    expect(ENTRY_DRAFT_PREFIX).toBe('accounting.draft.')
  })

  it('writeEntryDraftStoresUnderThePrefixedKeyTest', () => {
    writeEntryDraft(7, emptyEntryDraft('2026-09-09'))

    expect(window.sessionStorage.getItem('webux.accounting.draft.7')).not.toBeNull()
  })

  it('readEntryDraftTest', () => {
    writeEntryDraft(7, { ...emptyEntryDraft('2026-09-09'), description: 'Miete September' })

    expect(readEntryDraft(7)?.description).toBe('Miete September')
  })

  /** Nothing rescued: the mask opens empty rather than on a broken state. */
  it('readEntryDraftWithoutAStoredStateTest', () => {
    expect(readEntryDraft(7)).toBeNull()
  })

  it('readEntryDraftWithGarbageTest', () => {
    window.sessionStorage.setItem('webux.accounting.draft.7', 'kein JSON')

    expect(readEntryDraft(7)).toBeNull()
  })

  /**
   * <b>Parsing is not reading, and this is the difference.</b> All four of these are valid
   * JSON, so the parser lets them through; none of them is a state this mask can open with.
   * Handed on, they reach code that trims strings and walks rows — and because the mask reads
   * the rescue inside a `useState` initialiser, a throw there means the screen does not open at
   * all. Losing a rescued draft costs a minute of typing; losing the mask costs the work. So a
   * state of the wrong shape is dropped, exactly like the unparsable text above.
   */
  it('readEntryDraftWithAForeignShapeTest', () => {
    const refused = [
      // Rows are there, the header fields are not: `description.trim()` would throw.
      '{"rows":[]}',
      // A description that is a number passes `?? ""` untouched and throws on `.trim()`.
      '{"bookingDate":"2026-09-09","documentReference":"","description":5,"rows":[]}',
      // A row of an older or tampered shape, missing the text field every row is read through.
      '{"bookingDate":"2026-09-09","documentReference":"","description":"Miete",'
        + '"rows":[{"key":1,"accountId":null}]}',
      // Valid JSON, and not an object at all.
      '["Miete September"]',
    ]

    for (const stored of refused) {
      window.sessionStorage.setItem('webux.accounting.draft.7', stored)

      expect(readEntryDraft(7), stored).toBeNull()
    }
  })

  /** The stamp is the one optional field: a state without it is what the mask holds before the
   * first rescue, and it has to read. */
  it('readEntryDraftWithoutAStampTest', () => {
    window.sessionStorage.setItem(
      'webux.accounting.draft.7',
      JSON.stringify(emptyEntryDraft('2026-09-09')),
    )

    expect(readEntryDraft(7)?.rows).toHaveLength(2)
    expect(readEntryDraft(7)?.savedAt).toBeUndefined()
  })

  /**
   * The one that matters: reading for one tenant throws away what was left for every other.
   * Without it the half typed entry of another business turns up in this mask.
   */
  it('readEntryDraftClearsTheOtherTenantsTest', () => {
    writeEntryDraft(1, { ...emptyEntryDraft('2026-09-09'), description: 'fremder Betrieb' })
    writeEntryDraft(2, { ...emptyEntryDraft('2026-09-09'), description: 'eigener Betrieb' })

    expect(readEntryDraft(2)?.description).toBe('eigener Betrieb')
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()
  })

  it('clearEntryDraftTest', () => {
    writeEntryDraft(7, emptyEntryDraft('2026-09-09'))
    clearEntryDraft(7)

    expect(readEntryDraft(7)).toBeNull()
  })
})

describe('emptyEntryDraft', () => {
  /** Two rows, because an entry has two sides. */
  it('emptyEntryDraftTest', () => {
    const draft = emptyEntryDraft('2026-09-09')

    expect(draft.bookingDate).toBe('2026-09-09')
    expect(draft.rows).toHaveLength(2)
    expect(draft.rows[0]).toEqual({
      key: 1,
      accountId: null,
      accountText: '',
      debit: '',
      credit: '',
      taxCodeId: null,
    })
  })
})

describe('entryTemplatesUrl', () => {
  it('entryTemplatesUrlTest', () => {
    expect(entryTemplatesUrl(7)).toBe('/api/tenants/7/accounting/entry-templates')
  })
})

describe('entryTemplateUrl', () => {
  it('entryTemplateUrlTest', () => {
    expect(entryTemplateUrl(7, 300)).toBe('/api/tenants/7/accounting/entry-templates/300')
  })
})

describe('suggestionsUrl', () => {
  it('suggestionsUrlTest', () => {
    expect(suggestionsUrl(7, 'Miete', 8)).toBe(
      '/api/tenants/7/accounting/entries/suggestions?q=Miete&limit=8',
    )
  })

  /**
   * The term is encoded. Without it a `%` would arrive as the start of an escape, a `&` would
   * open a second parameter, and a space would break the address outright.
   */
  it('suggestionsUrlEncodesTheTermTest', () => {
    expect(suggestionsUrl(7, '50% Rabatt & mehr')).toBe(
      '/api/tenants/7/accounting/entries/suggestions?q=50%25%20Rabatt%20%26%20mehr&limit=8',
    )
  })
})

describe('entryTemplatesKey', () => {
  /** Every key of this module carries the tenant, so two tenants never share a cache. */
  it('entryTemplateKeysArePerTenantTest', () => {
    expect(entryTemplatesKey(7)).toEqual(['accounting-entry-templates', 7])
    expect(suggestionsKey(7, 'Mie')).toEqual(['accounting-entry-suggestions', 7, 'Mie'])
    expect(entryTemplatesKey(8)).not.toEqual(entryTemplatesKey(7))
  })
})

describe('the two statements', () => {
  /** The year is compulsory at the endpoint, and the cut-off day travels only where it is set. */
  it('balanceSheetUrlTest', () => {
    expect(balanceSheetUrl(7, 3)).toBe('/api/tenants/7/accounting/balance-sheet?fiscalYearId=3')
    expect(balanceSheetUrl(7, 3, '2026-09-30')).toBe(
      '/api/tenants/7/accounting/balance-sheet?fiscalYearId=3&asOf=2026-09-30',
    )
    expect(incomeStatementUrl(7, 3)).toBe(
      '/api/tenants/7/accounting/income-statement?fiscalYearId=3',
    )
  })

  /**
   * <b>No paging and no presentation switch in the query.</b> The endpoint answers 400 for
   * `page`, `size`, `sort`, `hideEmpty` and `withAccounts` — a caller that leafed through the
   * answer would take the whole report for a first page.
   */
  it('statementUrlCarriesNothingElseTest', () => {
    const url = balanceSheetUrl(7, 3, '2026-09-30')

    expect(url).not.toContain('page')
    expect(url).not.toContain('size')
    expect(url).not.toContain('sort')
    expect(url).not.toContain('hideEmpty')
    expect(url).not.toContain('withAccounts')
  })

  /** Every key carries the tenant, the year and the cut-off day: three answers, three caches. */
  it('statementKeysArePerYearAndDayTest', () => {
    expect(balanceSheetKey(7, 3)).toEqual(['accounting-balance-sheet', 7, 3, ''])
    expect(balanceSheetKey(7, 3, '2026-09-30')).not.toEqual(balanceSheetKey(7, 3))
    expect(incomeStatementKey(7, 3)).not.toEqual(balanceSheetKey(7, 3))
  })
})

describe('the opening entry and the setup state', () => {
  it('openingEntryUrlTest', () => {
    expect(openingEntryUrl(7, 3)).toBe('/api/tenants/7/accounting/opening-entry?fiscalYearId=3')
    // The POST carries the year in its body, so the address takes none.
    expect(openingEntryUrl(7)).toBe('/api/tenants/7/accounting/opening-entry')
    expect(setupStateUrl(7)).toBe('/api/tenants/7/accounting/setup-state')
  })

  it('setupStateKeyIsPerTenantTest', () => {
    expect(setupStateKey(7)).toEqual(['accounting-setup-state', 7])
    expect(setupStateKey(8)).not.toEqual(setupStateKey(7))
    expect(openingEntryKey(7, 3)).not.toEqual(openingEntryKey(7, 4))
  })
})

describe('the print link of the two statements', () => {
  /**
   * The two switches travel with the link, so the paper shows what the screen showed. They are
   * sent for the two laid-out reports only — the other three answer 400 for them.
   */
  it('accountingPrintUrlCarriesTheSwitchesTest', () => {
    expect(
      accountingPrintUrl(7, 'balance-sheet', 3, {
        asOf: '2026-09-30',
        hideEmpty: true,
        withAccounts: false,
      }),
    ).toBe(
      '/api/tenants/7/accounting/print/balance-sheet?fiscalYearId=3&asOf=2026-09-30'
      + '&hideEmpty=true&withAccounts=false',
    )
    // And nothing travels that was not asked for.
    expect(accountingPrintUrl(7, 'income-statement', 3)).toBe(
      '/api/tenants/7/accounting/print/income-statement?fiscalYearId=3',
    )
  })
})
