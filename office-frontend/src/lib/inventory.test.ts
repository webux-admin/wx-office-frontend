import { describe, expect, it } from 'vitest'
import type { StockLocation } from './types'
import {
  INVENTORY_RIGHTS,
  showsLocationChoice,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
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
