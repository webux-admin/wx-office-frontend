import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  accountingSettingsKey,
  accountingSettingsUrl,
  someRoleHoldsAccounting,
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
