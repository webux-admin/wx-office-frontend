import { describe, expect, it } from 'vitest'
import type { ProductAvailability, StockLocation, StockShortfall } from './types'
import {
  INVENTORY_RIGHTS,
  availabilityHint,
  availabilityKey,
  availabilityUrl,
  booksStock,
  reservedForText,
  shortfallText,
  inventoryUrl,
  isReversible,
  manualReasonsFor,
  showsLocationChoice,
  stockBalanceKey,
  stockBalancesUrl,
  stockLocationLabel,
  stockLocationsKey,
  stockLocationsUrl,
  stockListKey,
  stockMovementLatestKey,
  stockMovementListKey,
  stockMovementsUrl,
  stockShortageListKey,
  stockReversalLabel,
  stockShortagesUrl,
  stockTransfersUrl,
  stockUrl,
  shortageCauseLabel,
  shortageCauseTone,
  affectsStock,
  releaseReservationUrl,
  reservationReturnNotice,
  reservationStatusLabel,
  reservationStatusTone,
  reservesStock,
  stockIssueNotice,
  stockReservationListKey,
  stockReservationsUrl,
  STALE_RESERVATION_DAYS,
  STOCK_RESERVATION_PATH,
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

describe('stockUrl', () => {
  it('stockUrlTest', () => {
    expect(stockUrl(7)).toBe('/api/tenants/7/inventory/stock')
  })

  /** The shortfalls hang under the stock, because that is what they are shortfalls of. */
  it('stockShortagesUrlTest', () => {
    expect(stockShortagesUrl(7)).toBe('/api/tenants/7/inventory/stock/shortages')
  })
})

describe('stockListKey', () => {
  it('stockListKeyTest', () => {
    expect(stockListKey(7, 'page=0&size=50')).toEqual(['stock-list', 7, 'page=0&size=50'])
  })

  it('stockListKeyWithoutAQueryTest', () => {
    expect(stockListKey(7, '')).toEqual(['stock-list', 7, ''])
  })

  it('stockShortageListKeyTest', () => {
    expect(stockShortageListKey(7, 'size=1')).toEqual(['stock-shortages', 7, 'size=1'])
  })

  /** Two differently filtered lists must not share one cache entry. */
  it('stockListKeyDiffersPerQueryTest', () => {
    expect(stockListKey(7, 'a=1')).not.toEqual(stockListKey(7, 'a=2'))
    expect(stockShortageListKey(7, 'a=1')).not.toEqual(stockShortageListKey(8, 'a=1'))
  })
})

describe('shortageCauseLabel', () => {
  it('shortageCauseLabelTest', () => {
    expect(shortageCauseLabel('NEGATIVE')).toBe('Negativ')
    expect(shortageCauseLabel('BELOW_MINIMUM')).toBe('Unter Mindestbestand')
  })

  /** A stock that is fine says nothing at all rather than «in Ordnung». */
  it('shortageCauseLabelWithoutACauseTest', () => {
    expect(shortageCauseLabel(undefined)).toBe('')
  })

  it('shortageCauseToneTest', () => {
    expect(shortageCauseTone('NEGATIVE')).toBe('danger')
    expect(shortageCauseTone('BELOW_MINIMUM')).toBe('accent')
  })

  it('shortageCauseToneWithoutACauseTest', () => {
    expect(shortageCauseTone(undefined)).toBeUndefined()
  })
})


describe('booksStock', () => {
  it('booksStockTest', () => {
    expect(booksStock('ISSUE')).toBe(true)
    expect(booksStock('ISSUE_IF_NOT_BOOKED')).toBe(true)
  })

  /** RESERVE speaks a quantity for rather than moving it, so it writes no movement. */
  it('booksStockWithoutAnEffectTest', () => {
    expect(booksStock('NONE')).toBe(false)
    expect(booksStock('RESERVE')).toBe(false)
    expect(booksStock(undefined)).toBe(false)
  })
})

describe('stockReversalLabel', () => {
  it('stockReversalLabelTest', () => {
    const label = stockReversalLabel({
      productNumber: 'P-100',
      productName: 'Schraube M4',
      quantity: 12,
      unitShortName: 'Stk',
      locationName: 'Hauptlager',
    })

    expect(label).toBe('12 Stk P-100 Schraube M4 \u00b7 Hauptlager')
  })

  /** A product without a number and a unit without a short name leave no double spaces. */
  it('stockReversalLabelWithoutNumberAndUnitTest', () => {
    const label = stockReversalLabel({
      productName: 'Winkel 40',
      quantity: 3,
      locationName: 'Aussenlager',
    })

    expect(label).toBe('3 Winkel 40 \u00b7 Aussenlager')
  })

  /** A quarter keeps its decimals; the reopen dialog must not round goods away. */
  it('stockReversalLabelWithAFractionTest', () => {
    const label = stockReversalLabel({
      productName: 'Kabel',
      quantity: 2.5,
      unitShortName: 'm',
      locationName: 'Hauptlager',
    })

    expect(label).toContain('2.5 m Kabel')
  })
})

describe('reservesStock', () => {
  it('reservesStockTest', () => {
    expect(reservesStock('RESERVE')).toBe(true)
  })

  /** Everything that books, and the document that does nothing at all, answer false. */
  it('reservesStockWithoutAReservingEffectTest', () => {
    expect(reservesStock('ISSUE')).toBe(false)
    expect(reservesStock('ISSUE_IF_NOT_BOOKED')).toBe(false)
    expect(reservesStock('NONE')).toBe(false)
    expect(reservesStock(undefined)).toBe(false)
  })
})

describe('affectsStock', () => {
  it('affectsStockTest', () => {
    expect(affectsStock('ISSUE')).toBe(true)
    expect(affectsStock('ISSUE_IF_NOT_BOOKED')).toBe(true)
  })

  /** The one case that separates it from booksStock: the order reaches the inventory too. */
  it('affectsStockWithAReservingEffectTest', () => {
    expect(affectsStock('RESERVE')).toBe(true)
  })

  it('affectsStockWithoutAnEffectTest', () => {
    expect(affectsStock('NONE')).toBe(false)
    expect(affectsStock(undefined)).toBe(false)
  })
})

describe('reservationStatusLabel', () => {
  it('reservationStatusLabelTest', () => {
    expect(reservationStatusLabel('OPEN')).toBe('Offen')
    expect(reservationStatusLabel('CONSUMED')).toBe('Verbraucht')
    expect(reservationStatusLabel('RELEASED')).toBe('Freigegeben')
  })

  it('reservationStatusLabelWithoutAStatusTest', () => {
    expect(reservationStatusLabel(undefined)).toBe('')
  })
})

describe('reservationStatusTone', () => {
  /** Only what still takes stock away from somebody wears a colour. */
  it('reservationStatusToneTest', () => {
    expect(reservationStatusTone('OPEN')).toBe('accent')
  })

  it('reservationStatusToneWhenClosedTest', () => {
    expect(reservationStatusTone('CONSUMED')).toBeUndefined()
    expect(reservationStatusTone('RELEASED')).toBeUndefined()
    expect(reservationStatusTone(undefined)).toBeUndefined()
  })
})

describe('stockIssueNotice', () => {
  it('stockIssueNoticeTest', () => {
    expect(stockIssueNotice('ISSUE', 'Hauptlager')).toBe(
      'Ausstellen bucht den Bestand im Hauptlager ab.',
    )
  })

  /** The sentence an order gets: the stock stays, the free quantity does not. */
  it('stockIssueNoticeWhenReservingTest', () => {
    const notice = stockIssueNotice('RESERVE', 'Hauptlager')

    expect(notice).toContain('reserviert den Bestand im Hauptlager')
    expect(notice).toContain('verfügbare Menge sinkt')
  })

  /** No location known yet: the sentence still reads, without a dangling «im».  */
  it('stockIssueNoticeWithoutALocationTest', () => {
    expect(stockIssueNotice('ISSUE')).toBe('Ausstellen bucht den Bestand ab.')
    expect(stockIssueNotice('RESERVE', '')).toContain('Ausstellen reserviert den Bestand.')
  })

  it('stockIssueNoticeWithoutAnEffectTest', () => {
    expect(stockIssueNotice('NONE', 'Hauptlager')).toBe('')
    expect(stockIssueNotice(undefined)).toBe('')
  })
})

describe('reservationReturnNotice', () => {
  it('reservationReturnNoticeTest', () => {
    expect(reservationReturnNotice('RESERVE')).toBe(
      'Die offenen Reservierungen dieses Belegs werden freigegeben.',
    )
  })

  /** The invisible half: what the delivery note drew out of the order comes back. */
  it('reservationReturnNoticeWhenBookingTest', () => {
    expect(reservationReturnNotice('ISSUE')).toBe(
      'Die dafür verbrauchten Reservierungen des Auftrags werden wiederhergestellt.',
    )
    expect(reservationReturnNotice('ISSUE_IF_NOT_BOOKED')).toContain('wiederhergestellt')
  })

  it('reservationReturnNoticeWithoutAnEffectTest', () => {
    expect(reservationReturnNotice('NONE')).toBe('')
    expect(reservationReturnNotice(undefined)).toBe('')
  })
})

describe('stockReservationsUrl', () => {
  it('stockReservationsUrlTest', () => {
    expect(stockReservationsUrl(7)).toBe('/api/tenants/7/inventory/reservations')
  })
})

describe('releaseReservationUrl', () => {
  it('releaseReservationUrlTest', () => {
    expect(releaseReservationUrl(7, 42)).toBe(
      '/api/tenants/7/inventory/reservations/42/release',
    )
  })
})

describe('stockReservationListKey', () => {
  it('stockReservationListKeyTest', () => {
    expect(stockReservationListKey(7, 'status=OPEN')).toEqual([
      'stock-reservations',
      7,
      'status=OPEN',
    ])
  })

  /** Two differently filtered lists must not share one cache entry. */
  it('stockReservationListKeyWithoutAQueryTest', () => {
    expect(stockReservationListKey(7, '')).not.toEqual(stockReservationListKey(7, 'sourceId=1'))
  })
})

describe('reservation constants', () => {
  it('stockReservationPathTest', () => {
    expect(STOCK_RESERVATION_PATH).toBe('/reservierungen')
    expect(STALE_RESERVATION_DAYS).toBe(30)
  })
})

describe('availabilityUrl', () => {
  it('availabilityUrlTest', () => {
    expect(availabilityUrl(7, 42)).toBe('/api/tenants/7/inventory/availability/42')
  })

  /** One request for the whole hit list, which is the reason this shape exists at all. */
  it('availabilityUrlForAListTest', () => {
    expect(availabilityUrl(7, [1, 2, 3])).toBe(
      '/api/tenants/7/inventory/availability?productIds=1,2,3',
    )
  })

  it('availabilityUrlForAnEmptyListTest', () => {
    expect(availabilityUrl(7, [])).toBe('/api/tenants/7/inventory/availability?productIds=')
  })
})

describe('availabilityKey', () => {
  it('availabilityKeyTest', () => {
    expect(availabilityKey(7, 42)).toEqual(['stock-availability', 7, 42])
    expect(availabilityKey(7, [1, 2])).toEqual(['stock-availability', 7, 'batch', '1,2'])
  })

  /** The batch answer carries no split and no holders, so it must not fill the fact box. */
  it('availabilityKeyKeepsTheTwoShapesApartTest', () => {
    expect(availabilityKey(7, 42)).not.toEqual(availabilityKey(7, [42]))
  })

  it('availabilityKeyPerTenantTest', () => {
    expect(availabilityKey(7, 42)).not.toEqual(availabilityKey(8, 42))
  })
})

describe('shortfallText', () => {
  function shortfall(fields: Partial<StockShortfall> = {}): StockShortfall {
    return {
      lineNumbers: [1],
      productId: 42,
      locationName: 'Hauptlager',
      required: 5,
      onHand: 7,
      reserved: 4,
      available: 3,
      heldBy: [{ documentNumber: 'AU-2026-0142', quantity: 4 }],
      blocking: false,
      ...fields,
    }
  }

  it('shortfallTextTest', () => {
    expect(shortfallText(shortfall())).toBe(
      'Hauptlager: 3 verfügbar, 5 gebraucht — 4 sind für AU-2026-0142 reserviert',
    )
  })

  /** Nobody to name, so the sentence ends where it has said everything. */
  it('shortfallTextWithoutReservationTest', () => {
    expect(shortfallText(shortfall({ reserved: 0, available: 7, heldBy: [] }))).toBe(
      'Hauptlager: 7 verfügbar, 5 gebraucht',
    )
  })

  it('shortfallTextWithSeveralHoldersTest', () => {
    const held = shortfall({
      reserved: 9,
      available: -2,
      heldBy: [
        { documentNumber: 'AU-2026-0142', quantity: 4 },
        { documentNumber: 'AU-2026-0143', quantity: 3 },
        { documentNumber: 'AU-2026-0144', quantity: 1 },
        { documentNumber: 'AU-2026-0145', quantity: 1 },
      ],
    })

    expect(shortfallText(held)).toBe(
      'Hauptlager: -2 verfügbar, 5 gebraucht'
        + ' — 9 sind für AU-2026-0142 und AU-2026-0143 und 2 weitere reserviert',
    )
  })

  it('shortfallTextWithThreeHoldersTest', () => {
    const held = shortfall({
      heldBy: [
        { documentNumber: 'AU-1', quantity: 2 },
        { documentNumber: 'AU-2', quantity: 1 },
        { documentNumber: 'AU-3', quantity: 1 },
      ],
    })

    expect(shortfallText(held)).toContain('AU-1 und AU-2 und einen weiteren')
  })
})

describe('reservedForText', () => {
  it('reservedForTextTest', () => {
    expect(reservedForText([{ documentNumber: 'AU-2026-0142', quantity: 4 }])).toBe(
      'reserviert für AU-2026-0142',
    )
  })

  it('reservedForTextWithoutHoldersTest', () => {
    expect(reservedForText([])).toBe('')
    expect(reservedForText(undefined)).toBe('')
  })
})

describe('availabilityHint', () => {
  function availability(fields: Partial<ProductAvailability> = {}): ProductAvailability {
    return {
      productId: 42,
      stockManaged: true,
      onHand: 12,
      reserved: 4,
      availableQuantity: 8,
      locations: [
        {
          locationId: 1,
          locationName: 'Hauptlager',
          onHand: 12,
          reserved: 4,
          availableQuantity: 8,
        },
      ],
      heldBy: [],
      ...fields,
    }
  }

  it('availabilityHintTest', () => {
    expect(availabilityHint(availability())).toBe('Bestand 12 · 4 reserviert')
  })

  it('availabilityHintWithSeveralLocationsTest', () => {
    const split = availability({
      locations: [
        {
          locationId: 1,
          locationName: 'Hauptlager',
          onHand: 3,
          reserved: 4,
          availableQuantity: -1,
        },
        {
          locationId: 2,
          locationName: 'Aussenlager',
          onHand: 9,
          reserved: 0,
          availableQuantity: 9,
        },
      ],
    })

    expect(availabilityHint(split)).toBe(
      'Bestand 12 · 4 reserviert · Hauptlager 3 · Aussenlager 9',
    )
  })

  /** Nothing spoken for: the line says the stock and stops. */
  it('availabilityHintWithoutReservationTest', () => {
    expect(availabilityHint(availability({ reserved: 0, availableQuantity: 12 }))).toBe(
      'Bestand 12',
    )
  })

  it('availabilityHintWithoutStockManagementTest', () => {
    expect(availabilityHint({ productId: 42, stockManaged: false })).toBe('')
    expect(availabilityHint(undefined)).toBe('')
  })

  /** A location that holds nothing is not named: an empty shelf is not a place to look. */
  it('availabilityHintSkipsEmptyLocationsTest', () => {
    const split = availability({
      onHand: 9,
      locations: [
        {
          locationId: 1,
          locationName: 'Hauptlager',
          onHand: 0,
          reserved: 4,
          availableQuantity: -4,
        },
        {
          locationId: 2,
          locationName: 'Aussenlager',
          onHand: 9,
          reserved: 0,
          availableQuantity: 9,
        },
      ],
    })

    expect(availabilityHint(split)).toBe('Bestand 9 · 4 reserviert')
  })
})
