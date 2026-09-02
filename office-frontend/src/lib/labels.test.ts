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

describe('PERMISSION_MODULES', () => {
  /**
   * Every module of the backend catalogue has a German word here.
   *
   * <p>The list is `Permission.Module` of the backend, in its order. Three of them showed their
   * raw code in the rights matrix until the accounting was added — a module the frontend has
   * not learned yet stays visible, which is right, but a permanent raw code is a defect nobody
   * reports until a tenant asks what OUTBOX means.
   */
  it('permissionModulesCoverEveryBackendModuleTest', () => {
    const modules = [
      'TENANT',
      'NUMBERING',
      'MASTERDATA',
      'PARTNER',
      'PRODUCT',
      'DOCUMENT',
      'OFFER',
      'ORDER',
      'DELIVERY_NOTE',
      'INVOICE',
      'CREDIT_NOTE',
      'INVENTORY',
      'OUTBOX',
      'DUNNING',
      'BANKING',
      'ACCOUNTING',
      'SUBSCRIPTION',
      'USER',
      'REPORT',
    ]

    for (const module of modules) {
      expect(labelOf(PERMISSION_MODULES, module)).not.toBe(module)
    }
    expect(labelOf(PERMISSION_MODULES, 'ACCOUNTING')).toBe('Buchhaltung')
    expect(labelOf(PERMISSION_MODULES, 'INVENTORY')).toBe('Lager')
    expect(labelOf(PERMISSION_MODULES, 'OUTBOX')).toBe('Postausgang')
    expect(labelOf(PERMISSION_MODULES, 'BANKING')).toBe('Bankauszug')
    expect(Object.keys(PERMISSION_MODULES)).toHaveLength(modules.length)
  })
})

describe('permissionAction', () => {
  it('permissionActionTest', () => {
    expect(permissionAction('PARTNER_WRITE')).toBe('Bearbeiten')
    expect(permissionAction('ORDER_FINALISE')).toBe('Ausstellen')
  })

  it('permissionActionForEveryDocumentVerbTest', () => {
    // The three that decide what happens to an issued document. A verb the map does not know
    // falls back to the raw code, and a raw code in the rights matrix is a regression nobody
    // notices until a tenant asks what ORDER_REOPEN means.
    expect(permissionAction('ORDER_REOPEN')).toBe('Zurückstellen')
    expect(permissionAction('INVOICE_REOPEN')).toBe('Zurückstellen')
    expect(permissionAction('ORDER_CANCEL')).toBe('Stornieren')
  })

  it('permissionActionWithLongCodeTest', () => {
    expect(permissionAction('DOCUMENT_TYPE_READ')).toBe('Lesen')
    expect(permissionAction('ROLE_MANAGE')).toBe('Verwalten')
    expect(permissionAction('DATA_EXPORT')).toBe('Exportieren')
  })

  it('permissionActionForVatRateWriteTest', () => {
    // Sits next to PRODUCT_WRITE in the same module group: a bare "Bearbeiten" twice over
    // would leave nobody knowing which box maintains the federal rates.
    expect(permissionAction('VAT_RATE_WRITE')).toBe('MwSt-Sätze pflegen')
  })

  /**
   * Posting is not «Bearbeiten»: after it nothing is correctable any more, and a right that
   * reads the same as the draft right gets granted along with it.
   */
  it('permissionActionForPostTest', () => {
    expect(permissionAction('ACCOUNTING_POST')).toBe('Verbuchen')
  })

  it('permissionActionForCloseTest', () => {
    expect(permissionAction('ACCOUNTING_CLOSE')).toBe('Abschliessen')
  })

  it('permissionActionWithUnknownVerbTest', () => {
    expect(permissionAction('PARTNER_SOMETHING')).toBe('PARTNER_SOMETHING')
    expect(permissionAction('')).toBe('')
  })
})
