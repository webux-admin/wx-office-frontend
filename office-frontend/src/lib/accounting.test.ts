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
} from './accounting'

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
