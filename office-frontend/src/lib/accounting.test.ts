// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_ORDER,
  CHART_OF_ACCOUNTS_PATH,
  COMPUTED_POSITIONS,
  POSITION_PREFIXES,
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
