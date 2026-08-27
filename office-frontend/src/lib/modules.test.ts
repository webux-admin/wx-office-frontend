import { describe, expect, it } from 'vitest'
import {
  MODULE_PATH,
  MODULE_RIGHTS,
  runsModule,
  tenantModulesKey,
  tenantModulesUrl,
} from './modules'
import type { TenantAccess } from './types'

/** A tenant of the session, with the modules it runs. */
function tenant(id: number, modules: string[]): TenantAccess {
  return { id, code: `T${id}`, name: `Tenant ${id}`, isDefault: false, modules }
}

describe('tenantModulesUrl', () => {
  it('tenantModulesUrlTest', () => {
    expect(tenantModulesUrl(7)).toBe('/api/tenants/7/modules')
  })
})

describe('tenantModulesKey', () => {
  it('tenantModulesKeyTest', () => {
    expect(tenantModulesKey(7)).toEqual(['tenant-modules', 7])
  })

  it('tenantModulesKeyIsPerTenantTest', () => {
    // Two tenants must not share one cache entry: switching tenant would show the modules of
    // the one left behind.
    expect(tenantModulesKey(7)).not.toEqual(tenantModulesKey(8))
  })
})

describe('MODULE_PATH', () => {
  it('modulePathTest', () => {
    expect(MODULE_PATH).toBe('/module')
    expect(MODULE_RIGHTS.read).toBe('TENANT_READ')
    expect(MODULE_RIGHTS.write).toBe('TENANT_WRITE')
  })
})

describe('runsModule', () => {
  it('runsModuleTest', () => {
    const tenants = [tenant(1, ['INVENTORY']), tenant(2, [])]

    expect(runsModule(tenants, 1, 'INVENTORY')).toBe(true)
    expect(runsModule(tenants, 2, 'INVENTORY')).toBe(false)
  })

  /** A superuser who has not chosen a tenant runs nothing — there is no tenant to ask. */
  it('runsModuleWithoutTenantTest', () => {
    const tenants = [tenant(1, ['INVENTORY'])]

    expect(runsModule(tenants, null, 'INVENTORY')).toBe(false)
    expect(runsModule(tenants, undefined, 'INVENTORY')).toBe(false)
  })

  it('runsModuleWithEmptyListTest', () => {
    expect(runsModule([], 1, 'INVENTORY')).toBe(false)
    expect(runsModule(undefined, 1, 'INVENTORY')).toBe(false)
  })

  it('runsModuleWithAnUnknownModuleTest', () => {
    expect(runsModule([tenant(1, ['INVENTORY'])], 1, 'PROJECT')).toBe(false)
  })

  /** The chosen tenant is not in the list: that is no tenant to ask either. */
  it('runsModuleWithAnUnknownTenantTest', () => {
    expect(runsModule([tenant(1, ['INVENTORY'])], 9, 'INVENTORY')).toBe(false)
  })
})
