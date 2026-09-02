import { describe, expect, it } from 'vitest'
import { rolesKey, rolesUrl } from './roles'

describe('rolesUrl', () => {
  it('rolesUrlTest', () => {
    expect(rolesUrl(7)).toBe('/api/tenants/7/roles')
  })
})

describe('rolesKey', () => {
  /**
   * The key the role mask has been using all along, now in one place.
   *
   * <p>It stays `['roles', tenantId]` on purpose: a renamed key would leave the mask reading a
   * different cache entry than the one it invalidates after saving.
   */
  it('rolesKeyTest', () => {
    expect(rolesKey(7)).toEqual(['roles', 7])
  })

  it('rolesKeyIsPerTenantTest', () => {
    expect(rolesKey(7)).not.toEqual(rolesKey(8))
  })
})
