import { describe, expect, it } from 'vitest'
import type {
  Page,
  ProductAvailability,
  StockAsOfEntry,
  StockAsOfSummary,
  StockLocation,
  StockShortfall,
} from './types'
import {
  INVENTORY_RIGHTS,
  availabilityAt,
  backdatedMovementsText,
  availabilityHint,
  availabilityKey,
  availabilityUrl,
  booksStock,
  reservedForText,
  shortfallText,
  inventoryUrl,
  isReversible,
  manualReasonsFor,
  missingAsOfDateNote,
  showsLocationChoice,
  stockAsOfPageToShow,
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
  stockAsOfListKey,
  stockAsOfPdfUrl,
  stockAsOfStandText,
  stockAsOfSummaryKey,
  stockAsOfSummaryUrl,
  stockAsOfUrl,
  stockShortagesUrl,
  stocktakeProtocolUrl,
  stockTransfersUrl,
  stockUrl,
  unknownBarcodeMessage,
  valueColumnNote,
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

describe('unknownBarcodeMessage', () => {
  it('unknownBarcodeMessageTest', () => {
    expect(unknownBarcodeMessage('7612345678901')).toBe('Kein Artikel zu 7612345678901 gefunden.')
  })
})

describe('availabilityAt', () => {
  /** Twelve pieces in the main store, nine in the outside store; four spoken for in the main. */
  function twoStores(): ProductAvailability {
    return {
      productId: 42,
      stockManaged: true,
      onHand: 21,
      reserved: 4,
      availableQuantity: 17,
      locations: [
        { locationId: 1, locationName: 'Hauptlager', onHand: 12, reserved: 4, availableQuantity: 8 },
        { locationId: 2, locationName: 'Aussenlager', onHand: 9, reserved: 0, availableQuantity: 9 },
      ],
    }
  }

  it('availabilityAtTest', () => {
    const here = availabilityAt(twoStores(), 2)

    expect(here?.onHand).toBe(9)
    expect(here?.reserved).toBe(0)
    expect(here?.availableQuantity).toBe(9)
    expect(here?.locations).toHaveLength(1)
  })

  it('availabilityAtWithoutALocationTest', () => {
    // A tenant with one store: the whole-tenant figure is the same number anyway.
    expect(availabilityAt(twoStores(), undefined)).toEqual(twoStores())
  })

  it('availabilityAtOfAStoreWithoutStockTest', () => {
    // Never lain there: a free quantity of zero, and that is what it is.
    const here = availabilityAt(twoStores(), 99)

    expect(here?.onHand).toBe(0)
    expect(here?.availableQuantity).toBe(0)
    expect(here?.locations).toEqual([])
  })

  it('availabilityAtWithoutASplitTest', () => {
    // An answer without a per-store split cannot be narrowed; the sum stays.
    const flat: ProductAvailability = { productId: 42, stockManaged: true, availableQuantity: 8 }

    expect(availabilityAt(flat, 2)).toEqual(flat)
  })

  it('availabilityAtWithAnEmptySplitTest', () => {
    // Exactly what the batch endpoint of the hit list sends: the sums, and an empty split
    // rather than none — Jackson drops null, never an empty list, so the JSON really carries
    // `"locations": []`. Read as «nothing lies at that store» it turned every stock-managed
    // row of the product search into a «0 verfügbar» in the warning tone.
    const batch: ProductAvailability = {
      productId: 42,
      stockManaged: true,
      onHand: 21,
      reserved: 4,
      availableQuantity: 17,
      locations: [],
      heldBy: [],
    }

    expect(availabilityAt(batch, 2)).toEqual(batch)
  })

  it('availabilityAtWithoutAnAnswerTest', () => {
    expect(availabilityAt(undefined, 2)).toBeUndefined()
  })

  it('availabilityAtKeepsWhatItDoesNotNarrowTest', () => {
    const here = availabilityAt(twoStores(), 1)

    expect(here?.productId).toBe(42)
    expect(here?.stockManaged).toBe(true)
  })
})

/** The figures over a whole report, with the value column intact. */
function summary(fields: Partial<StockAsOfSummary> = {}): StockAsOfSummary {
  return {
    asOf: '2025-12-31',
    generatedAt: '2026-01-21T13:03:00Z',
    lineCount: 84,
    unvaluedLineCount: 0,
    foreignCurrencyLineCount: 0,
    baseCurrencyCode: 'CHF',
    backdatedMovements: 0,
    showsValue: true,
    ...fields,
  }
}

/** One line of the report. */
function asOfEntry(fields: Partial<StockAsOfEntry> = {}): StockAsOfEntry {
  return {
    productId: 42,
    productNumber: '10-042',
    productName: 'Kaffeebohnen',
    locationId: 1,
    locationCode: 'HAUPT',
    locationName: 'Hauptlager',
    quantity: 12,
    unitShortName: 'kg',
    ...fields,
  }
}

/** One page of the report, as the server answers it. */
function asOfPage(rows: StockAsOfEntry[]): Page<StockAsOfEntry> {
  return { content: rows, page: 0, size: 50, totalElements: rows.length, totalPages: 1, sort: '' }
}

describe('stockAsOfUrl', () => {
  it('stockAsOfUrlTest', () => {
    expect(stockAsOfUrl(7)).toBe('/api/tenants/7/inventory/as-of')
  })

  /** The report of one tenant is never the report of another (backend ADR-0003). */
  it('stockAsOfUrlPerTenantTest', () => {
    expect(stockAsOfUrl(8)).not.toBe(stockAsOfUrl(7))
  })
})

describe('stockAsOfSummaryUrl', () => {
  it('stockAsOfSummaryUrlTest', () => {
    expect(stockAsOfSummaryUrl(7)).toBe('/api/tenants/7/inventory/as-of/summary')
  })
})

describe('stockAsOfPdfUrl', () => {
  it('stockAsOfPdfUrlTest', () => {
    expect(stockAsOfPdfUrl(7, 'date=2025-12-31&locationId=3')).toBe(
      '/api/tenants/7/inventory/as-of/pdf?date=2025-12-31&locationId=3',
    )
  })

  /** No filters, no dangling question mark. */
  it('stockAsOfPdfUrlWithoutFiltersTest', () => {
    expect(stockAsOfPdfUrl(7, '')).toBe('/api/tenants/7/inventory/as-of/pdf')
  })
})

describe('stocktakeProtocolUrl', () => {
  it('stocktakeProtocolUrlTest', () => {
    expect(stocktakeProtocolUrl(7, 42)).toBe('/api/tenants/7/inventory/stocktakes/42/protocol')
  })
})

describe('stockAsOfListKey', () => {
  it('stockAsOfListKeyTest', () => {
    expect(stockAsOfListKey(7, 'date=2025-12-31&page=0')).toEqual([
      'stock-as-of',
      7,
      'date=2025-12-31&page=0',
    ])
  })

  /** Another cut-off date is another report and must not be read out of the old answer. */
  it('stockAsOfListKeyWithAnotherDateTest', () => {
    expect(stockAsOfListKey(7, 'date=2025-12-31')).not.toEqual(
      stockAsOfListKey(7, 'date=2025-06-30'),
    )
  })

  it('stockAsOfListKeyPerTenantTest', () => {
    expect(stockAsOfListKey(8, 'date=2025-12-31')).not.toEqual(
      stockAsOfListKey(7, 'date=2025-12-31'),
    )
  })

  it('stockAsOfListKeyWithoutAQueryTest', () => {
    expect(stockAsOfListKey(7, '')).toEqual(['stock-as-of', 7, ''])
  })
})

describe('stockAsOfSummaryKey', () => {
  it('stockAsOfSummaryKeyTest', () => {
    expect(stockAsOfSummaryKey(7, 'date=2025-12-31')).toEqual([
      'stock-as-of-summary',
      7,
      'date=2025-12-31',
    ])
  })

  /** The page and the figures are two answers; one cache entry for both would mix them. */
  it('stockAsOfSummaryKeyIsNotTheListKeyTest', () => {
    expect(stockAsOfSummaryKey(7, 'date=2025-12-31')).not.toEqual(
      stockAsOfListKey(7, 'date=2025-12-31'),
    )
  })

  it('stockAsOfSummaryKeyWithAnotherLocationTest', () => {
    expect(stockAsOfSummaryKey(7, 'date=2025-12-31&locationId=3')).not.toEqual(
      stockAsOfSummaryKey(7, 'date=2025-12-31&locationId=4'),
    )
  })
})

describe('missingAsOfDateNote', () => {
  it('missingAsOfDateNoteTest', () => {
    expect(missingAsOfDateNote('2025-12-31')).toBeUndefined()
  })

  it('missingAsOfDateNoteWithAnEmptyFieldTest', () => {
    expect(missingAsOfDateNote('')).toBe('Zu einem Bestandsbericht gehört ein vollständiger '
      + 'Stichtag.')
  })

  /** Half a day is no day: the request would go out without the parameter the endpoint needs. */
  it('missingAsOfDateNoteWithAHalfTypedDayTest', () => {
    expect(missingAsOfDateNote('2025-12')).toBe('Zu einem Bestandsbericht gehört ein '
      + 'vollständiger Stichtag.')
  })

  /**
   * A day in the future is a whole day, so it is asked for and the server refuses it in its own
   * words. The rule belongs to the inventory, not to this mask.
   */
  it('missingAsOfDateNoteWithADayInTheFutureTest', () => {
    expect(missingAsOfDateNote('2099-12-31')).toBeUndefined()
  })
})

describe('stockAsOfPageToShow', () => {
  it('stockAsOfPageToShowTest', () => {
    const answered = asOfPage([asOfEntry()])

    expect(stockAsOfPageToShow(answered, asOfPage([]))).toBe(answered)
  })

  /** A refused cut-off date must not empty the table under the message at the date field. */
  it('stockAsOfPageToShowKeepsTheLastAnswerTest', () => {
    const kept = asOfPage([asOfEntry()])

    expect(stockAsOfPageToShow(undefined, kept)).toBe(kept)
  })

  /** An empty answer is an answer: those rows are gone, not merely unanswered. */
  it('stockAsOfPageToShowWithAnEmptyAnswerTest', () => {
    const answered = asOfPage([])

    expect(stockAsOfPageToShow(answered, asOfPage([asOfEntry()]))).toBe(answered)
  })

  it('stockAsOfPageToShowWithoutAnyAnswerTest', () => {
    const shown = stockAsOfPageToShow(undefined, undefined)

    expect(shown.content).toEqual([])
    expect(shown.totalElements).toBe(0)
  })
})

describe('backdatedMovementsText', () => {
  it('backdatedMovementsTextTest', () => {
    expect(backdatedMovementsText(3, '2025-12-31')).toBe(
      '3 Buchungen wurden nachträglich auf einen Tag bis zum 31.12.2025 gebucht.',
    )
  })

  /** One booking is one booking; «1 Buchungen wurden» is how nobody writes. */
  it('backdatedMovementsTextWithOneBookingTest', () => {
    expect(backdatedMovementsText(1, '2025-12-31')).toBe(
      '1 Buchung wurde nachträglich auf einen Tag bis zum 31.12.2025 gebucht.',
    )
  })

  it('backdatedMovementsTextWithoutBackdatedTest', () => {
    expect(backdatedMovementsText(0, '2025-12-31')).toBe('')
  })

  /** A count below zero is nonsense and says nothing rather than «-2 Buchungen». */
  it('backdatedMovementsTextWithANegativeCountTest', () => {
    expect(backdatedMovementsText(-2, '2025-12-31')).toBe('')
  })
})

describe('valueColumnNote', () => {
  /** Every line valued: the column is there and needs no explanation. */
  it('valueColumnNoteTest', () => {
    expect(valueColumnNote(summary())).toBe('')
  })

  it('valueColumnNoteWithoutCostsTest', () => {
    const note = valueColumnNote(summary({ showsValue: false, unvaluedLineCount: 12 }))

    expect(note).toBe(
      'Für 12 von 84 Zeilen ist kein Einstandspreis erfasst — der Bericht führt deshalb '
        + 'keine Werte.',
    )
  })

  /** Nothing is converted: a rate nobody recorded is no rate. */
  it('valueColumnNoteWithAForeignCurrencyTest', () => {
    const note = valueColumnNote(summary({ showsValue: false, foreignCurrencyLineCount: 3 }))

    expect(note).toBe(
      'Für 3 von 84 Zeilen liegt der Einstandspreis in einer Fremdwährung — es wird nicht '
        + 'umgerechnet, der Bericht führt deshalb keine Werte.',
    )
  })

  /**
   * Without a bookkeeping currency the server has nothing to compare a cost against and counts
   * every one of them as foreign. Saying «Fremdwährung» here would send somebody looking for a
   * purchase in euros that nobody made.
   */
  it('valueColumnNoteWithoutABaseCurrencyTest', () => {
    const note = valueColumnNote(
      summary({ showsValue: false, foreignCurrencyLineCount: 84, baseCurrencyCode: undefined }),
    )

    expect(note).toBe(
      'Der Bericht führt keine Werte, weil der Mandant keine Buchführungswährung hinterlegt '
        + 'hat.',
    )
  })

  /**
   * Both reasons hold here, and each one alone would take the column away. The note names the
   * costs: setting a bookkeeping currency would not bring the column back while twelve lines
   * carry no cost, so blaming the currency would promise a remedy that does not work.
   */
  it('valueColumnNoteWithoutABaseCurrencyAndWithoutCostsTest', () => {
    const note = valueColumnNote(
      summary({
        showsValue: false,
        unvaluedLineCount: 12,
        foreignCurrencyLineCount: 72,
        baseCurrencyCode: undefined,
      }),
    )

    expect(note).toBe(
      'Für 12 von 84 Zeilen ist kein Einstandspreis erfasst — der Bericht führt deshalb '
        + 'keine Werte.',
    )
  })

  /** Nothing on the report: the empty state says it, a note beside it would say it twice. */
  it('valueColumnNoteWithoutLinesTest', () => {
    expect(valueColumnNote(summary({ showsValue: false, lineCount: 0 }))).toBe('')
  })

  it('valueColumnNoteWithoutASummaryTest', () => {
    expect(valueColumnNote(undefined)).toBe('')
  })
})

describe('stockAsOfStandText', () => {
  it('stockAsOfStandTextTest', () => {
    // The time is read in the time zone of whoever looks, so only the day is pinned down.
    expect(stockAsOfStandText(summary())).toMatch(/^84 Zeilen · Stand 21\.01\.2026, \d{2}:\d{2}$/)
  })

  it('stockAsOfStandTextWithOneLineTest', () => {
    expect(stockAsOfStandText(summary({ lineCount: 1 }))).toMatch(/^1 Zeile · Stand /)
  })

  it('stockAsOfStandTextWithoutLinesTest', () => {
    expect(stockAsOfStandText(summary({ lineCount: 0, showsValue: false }))).toMatch(
      /^0 Zeilen · Stand /,
    )
  })

  it('stockAsOfStandTextWithoutASummaryTest', () => {
    expect(stockAsOfStandText(undefined)).toBe('')
  })
})
