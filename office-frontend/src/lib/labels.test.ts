import { describe, expect, it } from 'vitest'
import { PERMISSION_MODULES, labelOf, permissionAction } from './labels'

describe('labelOf', () => {
  it('labelOfTest', () => {
    expect(labelOf(PERMISSION_MODULES, 'PARTNER')).toBe('Kunden und Lieferanten')
    expect(labelOf(PERMISSION_MODULES, 'MASTERDATA')).toBe('Stammdaten')
  })

  it('labelOfWithoutValueTest', () => {
    expect(labelOf(PERMISSION_MODULES, undefined)).toBe('-')
    expect(labelOf(PERMISSION_MODULES, null)).toBe('-')
    expect(labelOf(PERMISSION_MODULES, '')).toBe('-')
  })

  it('labelOfWithUnknownCodeShowsTheCodeTest', () => {
    // A module the backend added and the frontend has not learned yet must stay visible.
    expect(labelOf(PERMISSION_MODULES, 'BRAND_NEW_MODULE')).toBe('BRAND_NEW_MODULE')
  })
})

describe('permissionAction', () => {
  it('permissionActionTest', () => {
    expect(permissionAction('PARTNER_WRITE')).toBe('Bearbeiten')
    expect(permissionAction('ORDER_FINALISE')).toBe('Ausstellen')
  })

  it('permissionActionWithLongCodeTest', () => {
    expect(permissionAction('DOCUMENT_TYPE_READ')).toBe('Lesen')
    expect(permissionAction('ROLE_MANAGE')).toBe('Verwalten')
    expect(permissionAction('DATA_EXPORT')).toBe('Exportieren')
  })

  it('permissionActionWithUnknownVerbTest', () => {
    expect(permissionAction('PARTNER_SOMETHING')).toBe('PARTNER_SOMETHING')
    expect(permissionAction('')).toBe('')
  })
})
