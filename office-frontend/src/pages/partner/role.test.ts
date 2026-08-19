import { describe, expect, it } from 'vitest'
import { holdsRole, wordingFor } from './role'

describe('wordingFor', () => {
  it('wordingForTest', () => {
    expect(wordingFor('customer').listTitle).toBe('Kunden')
    expect(wordingFor('supplier').listTitle).toBe('Lieferanten')
  })

  it('wordingForNeverSaysPartnerTest', () => {
    // The word the backend uses for the record must not reach the screen. The mask decides
    // whether somebody is called a customer or a supplier.
    for (const role of ['customer', 'supplier'] as const) {
      for (const [key, value] of Object.entries(wordingFor(role))) {
        if (typeof value !== 'string') continue
        expect(`${key}: ${value}`).not.toMatch(/Partner/)
      }
    }
  })

  it('wordingForPointsAtItsOwnRoutesTest', () => {
    expect(wordingFor('customer').path).toBe('/kunden')
    expect(wordingFor('supplier').path).toBe('/lieferanten')
  })

  it('wordingForNamesTheOtherRoleTest', () => {
    expect(wordingFor('customer').other).toBe('supplier')
    expect(wordingFor('supplier').other).toBe('customer')
  })

  it('wordingForAsksTheApiForOneRoleTest', () => {
    expect(wordingFor('customer').listQuery).toBe('role=customer')
    expect(wordingFor('supplier').listQuery).toBe('role=supplier')
  })
})

describe('holdsRole', () => {
  it('holdsRoleTest', () => {
    expect(holdsRole({ isCustomer: true, isSupplier: false }, 'customer')).toBe(true)
    expect(holdsRole({ isCustomer: true, isSupplier: false }, 'supplier')).toBe(false)
  })

  it('holdsRoleWithBothFlagsTest', () => {
    // A record with both roles belongs in both lists.
    const both = { isCustomer: true, isSupplier: true }

    expect(holdsRole(both, 'customer')).toBe(true)
    expect(holdsRole(both, 'supplier')).toBe(true)
  })

  it('holdsRoleWithMissingFlagsTest', () => {
    // The backend leaves a false flag out of its JSON, so undefined means no.
    expect(holdsRole({}, 'customer')).toBe(false)
    expect(holdsRole({ isSupplier: true }, 'customer')).toBe(false)
  })
})
