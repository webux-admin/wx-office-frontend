import { describe, expect, it } from 'vitest'
import type { StockLocation } from './types'
import {
  INVENTORY_RIGHTS,
  inventoryUrl,
  isReversible,
  manualReasonsFor,
  showsLocationChoice,
  stockBalanceKey,
  stockBalancesUrl,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
  stockMovementLatestKey,
  stockMovementListKey,
  stockMovementsUrl,
  stockTransfersUrl,
} from './inventory'

function location(fields: Partial<StockLocation> = {}): StockLocation {
  return { id: 1, code: 'HAUPT', name: 'Hauptlager', ...fields }
}

describe('stockLocationsUrl', () => {
  it('stockLocationsUrlTest', () => {
    expect(stockLocationsUrl(7)).toBe('/api/tenants/7/inventory/locations')
  })
})

describe('stockLocationsKey', () => {
  it('stockLocationsKeyTest', () => {
    expect(stockLocationsKey(7)).toEqual(['stock-locations', 7])
  })

  it('stockLocationsKeyDiffersPerTenantTest', () => {
    expect(stockLocationsKey(7)).not.toEqual(stockLocationsKey(8))
  })
})

describe('INVENTORY_RIGHTS', () => {
  it('inventoryRightsTest', () => {
    expect(INVENTORY_RIGHTS.read).toBe('INVENTORY_READ')
    expect(INVENTORY_RIGHTS.configure).toBe('INVENTORY_CONFIGURE')
  })
})

describe('showsLocationChoice', () => {
  it('showsLocationChoiceTest', () => {
    expect(showsLocationChoice([location({ id: 1 }), location({ id: 2, code: 'AUSSEN' })])).toBe(
      true,
    )
  })

  /** One location means nothing to choose: the field would carry a value without options. */
  it('showsLocationChoiceWithOneLocationTest', () => {
    expect(showsLocationChoice([location()])).toBe(false)
  })

  it('showsLocationChoiceWithoutAnyLocationTest', () => {
    expect(showsLocationChoice([])).toBe(false)
    expect(showsLocationChoice(undefined)).toBe(false)
  })

  it('showsLocationChoiceIgnoresWhatWasSwitchedOffTest', () => {
    expect(
      showsLocationChoice([location({ id: 1 }), location({ id: 2, code: 'ALT', active: false })]),
    ).toBe(false)
  })
})

describe('stockLocationLabel', () => {
  it('stockLocationLabelTest', () => {
    expect(stockLocationLabel(location())).toBe('HAUPT · Hauptlager')
  })

  it('stockLocationLabelWithoutALocationTest', () => {
    expect(stockLocationLabel(undefined)).toBe('')
  })
})


describe('inventoryUrl', () => {
  /** Every resource of the module nests under one segment (backend ADR-0061). */
  it('inventoryUrlTest', () => {
    expect(inventoryUrl(7)).toBe('/api/tenants/7/inventory')
  })

  it('inventoryUrlCarriesEveryResourceTest', () => {
    expect(stockMovementsUrl(7)).toBe('/api/tenants/7/inventory/movements')
    expect(stockTransfersUrl(7)).toBe('/api/tenants/7/inventory/transfers')
    expect(stockBalancesUrl(7)).toBe('/api/tenants/7/inventory/balances')
  })
})

describe('stockMovementListKey', () => {
  it('stockMovementListKeyTest', () => {
    expect(stockMovementListKey(7, 'page=0&size=50')).toEqual([
      'stock-movements',
      7,
      'page=0&size=50',
    ])
  })

  /** Two differently filtered lists must not share one cache entry. */
  it('stockMovementListKeyDiffersPerQueryTest', () => {
    expect(stockMovementListKey(7, 'a')).not.toEqual(stockMovementListKey(7, 'b'))
  })

  it('stockMovementListKeyWithoutAQueryTest', () => {
    expect(stockMovementListKey(7, '')).toEqual(['stock-movements', 7, ''])
  })
})

describe('stockBalanceKey', () => {
  it('stockBalanceKeyTest', () => {
    expect(stockBalanceKey(7, 42)).toEqual(['stock-balances', 7, 42])
  })

  it('stockMovementLatestKeyTest', () => {
    expect(stockMovementLatestKey(7, 42)).toEqual(['stock-movements-latest', 7, 42])
  })
})

describe('manualReasonsFor', () => {
  it('manualReasonsForTest', () => {
    expect(manualReasonsFor('IN')[0]).toBe('RECEIPT')
    expect(manualReasonsFor('OUT')[0]).toBe('ISSUE')
  })

  /** The four reasons an operation of its own writes are offered in neither direction. */
  it('manualReasonsForLeavesOutTheOperationsOfTheirOwnTest', () => {
    const offered = [...manualReasonsFor('IN'), ...manualReasonsFor('OUT')]

    expect(offered).not.toContain('TRANSFER_IN')
    expect(offered).not.toContain('TRANSFER_OUT')
    expect(offered).not.toContain('REVERSAL')
    expect(offered).not.toContain('COUNT_ADJUSTMENT')
    expect(offered).toHaveLength(7)
  })

  it('manualReasonsForNeverOverlapsTest', () => {
    for (const reason of manualReasonsFor('IN')) {
      expect(manualReasonsFor('OUT')).not.toContain(reason)
    }
  })
})

describe('isReversible', () => {
  it('isReversibleTest', () => {
    expect(isReversible({ sourceKind: 'MANUAL', reason: 'RECEIPT' })).toBe(true)
  })

  /** A document movement is taken back through the document, a reversal not at all. */
  it('isReversibleForADocumentMovementTest', () => {
    expect(isReversible({ sourceKind: 'DOCUMENT', reason: 'ISSUE' })).toBe(false)
    expect(isReversible({ sourceKind: 'STOCKTAKE', reason: 'COUNT_ADJUSTMENT' })).toBe(false)
  })

  it('isReversibleForACounterBookingTest', () => {
    expect(isReversible({ sourceKind: 'MANUAL', reason: 'REVERSAL' })).toBe(false)
  })

  it('isReversibleWithoutAMovementTest', () => {
    expect(isReversible(undefined)).toBe(false)
  })
})
