import { describe, expect, it } from 'vitest'
import type { Product, StockBalance, StockLocation } from '../../lib/types'
import {
  acceptQuantity,
  applyKind,
  canSubmit,
  emptyBookStockForm,
  firstBookingComplaint,
  previewLines,
  productLabel,
  shortfallWarning,
  showsLocationFields,
  stockAt,
  toBookPayload,
  toTransferPayload,
  type BookStockForm,
} from './bookStockForm'

const TODAY = '2026-08-24'

const SCREW: Product = {
  id: 42,
  productNumber: 'P-001',
  name: 'Schraube',
  productType: 'GOODS',
  unit: 'PIECE',
  vatCategory: 'STANDARD',
  stockManaged: true,
}

function location(fields: Partial<StockLocation> = {}): StockLocation {
  return { id: 1, code: 'HAUPT', name: 'Hauptlager', ...fields }
}

const MAIN = location()
const OUTER = location({ id: 2, code: 'AUSSEN', name: 'Aussenlager' })

function balance(locationId: number, quantity: number): StockBalance {
  return {
    productId: 42,
    locationId,
    quantity,
    reservedQuantity: 0,
    availableQuantity: quantity,
    productName: 'Schraube',
  }
}

function form(fields: Partial<BookStockForm> = {}): BookStockForm {
  return {
    ...emptyBookStockForm(TODAY),
    product: SCREW,
    productTerm: 'P-001 · Schraube',
    locationId: '1',
    quantity: '8',
    ...fields,
  }
}

describe('emptyBookStockForm', () => {
  it('emptyBookStockFormTest', () => {
    const empty = emptyBookStockForm(TODAY, 'EUR')

    expect(empty.kind).toBe('IN')
    expect(empty.reason).toBe('RECEIPT')
    expect(empty.bookedOn).toBe(TODAY)
    expect(empty.unitCostCurrency).toBe('EUR')
    expect(empty.product).toBeNull()
  })
})

describe('applyKind', () => {
  it('applyKindTest', () => {
    const changed = applyKind(form(), 'OUT')

    expect(changed.kind).toBe('OUT')
    expect(changed.reason).toBe('ISSUE')
  })

  /** The cost belongs to a receipt; switching away drops it instead of sending it along. */
  it('applyKindDropsTheCostTest', () => {
    const changed = applyKind(form({ unitCost: '1.20' }), 'OUT')

    expect(changed.unitCost).toBe('')
  })

  it('applyKindToTheSameOneTest', () => {
    const current = form({ reason: 'OPENING' })

    expect(applyKind(current, 'IN')).toBe(current)
  })

  it('applyKindToATransferKeepsBothLocationsTest', () => {
    const changed = applyKind(form({ toLocationId: '2' }), 'TRANSFER')

    expect(changed.kind).toBe('TRANSFER')
    expect(changed.toLocationId).toBe('2')
  })
})

describe('acceptQuantity', () => {
  it('acceptQuantityTest', () => {
    expect(acceptQuantity('12.5')).toBe('12.5')
  })

  /** A typed minus is not accepted at all: the sign is made by the operation. */
  it('acceptQuantityWithAMinusTest', () => {
    expect(acceptQuantity('-3')).toBe('3')
    expect(acceptQuantity('1-2')).toBe('12')
  })

  it('acceptQuantityWithAnEmptyFieldTest', () => {
    expect(acceptQuantity('')).toBe('')
  })
})

describe('showsLocationFields', () => {
  it('showsLocationFieldsTest', () => {
    expect(showsLocationFields([MAIN, OUTER])).toBe(true)
  })

  /** One location means nothing to choose, so the field stays away. */
  it('showsLocationFieldsWithOneLocationTest', () => {
    expect(showsLocationFields([MAIN])).toBe(false)
  })

  it('showsLocationFieldsWithoutAnyLocationTest', () => {
    expect(showsLocationFields([])).toBe(false)
  })
})

describe('stockAt', () => {
  it('stockAtTest', () => {
    expect(stockAt([balance(1, 12), balance(2, 5)], '2')).toBe(5)
  })

  it('stockAtALocationWithoutARowTest', () => {
    expect(stockAt([balance(1, 12)], '2')).toBe(0)
    expect(stockAt([], '1')).toBe(0)
  })
})

describe('previewLines', () => {
  it('previewLinesTest', () => {
    const lines = previewLines(form({ quantity: '8' }), [balance(1, 12)], [MAIN, OUTER])

    expect(lines).toEqual(['Hauptlager: 12 → 20'])
  })

  it('previewLinesForAnIssueTest', () => {
    const lines = previewLines(
      form({ kind: 'OUT', reason: 'ISSUE', quantity: '3' }),
      [balance(1, 12)],
      [MAIN],
    )

    expect(lines).toEqual(['Hauptlager: 12 → 9'])
  })

  it('previewLinesForATransferTest', () => {
    const lines = previewLines(
      form({ kind: 'TRANSFER', locationId: '1', toLocationId: '2', quantity: '5' }),
      [balance(1, 12), balance(2, 1)],
      [MAIN, OUTER],
    )

    expect(lines).toEqual(['Hauptlager: 12 → 7', 'Aussenlager: 1 → 6'])
  })

  /** Nothing to preview while the dialog is still incomplete. */
  it('previewLinesWithoutAProductTest', () => {
    expect(previewLines(form({ product: null }), [], [MAIN])).toEqual([])
  })

  it('previewLinesWithoutAQuantityTest', () => {
    expect(previewLines(form({ quantity: '' }), [], [MAIN])).toEqual([])
    expect(previewLines(form({ quantity: '0' }), [], [MAIN])).toEqual([])
  })

  it('previewLinesForATransferOntoTheSameLocationTest', () => {
    const lines = previewLines(
      form({ kind: 'TRANSFER', locationId: '1', toLocationId: '1' }),
      [balance(1, 12)],
      [MAIN],
    )

    expect(lines).toEqual([])
  })

  /** A location without a row starts at zero rather than showing nothing. */
  it('previewLinesForALocationWithoutAnyStockTest', () => {
    expect(previewLines(form({ quantity: '4' }), [], [MAIN])).toEqual(['Hauptlager: 0 → 4'])
  })
})

describe('shortfallWarning', () => {
  it('shortfallWarningTest', () => {
    const warning = shortfallWarning(
      form({ kind: 'OUT', reason: 'ISSUE', quantity: '5' }),
      [balance(1, 3)],
      [MAIN],
    )

    expect(warning).toBe('Hauptlager steht danach auf -2.')
  })

  /** A location that blocks refuses with a 409; offering «trotzdem» would be a lie. */
  it('shortfallWarningOnABlockingLocationTest', () => {
    const warning = shortfallWarning(
      form({ kind: 'OUT', reason: 'ISSUE', quantity: '5' }),
      [balance(1, 3)],
      [location({ negativeStockPolicy: 'BLOCK' })],
    )

    expect(warning).toBeNull()
  })

  it('shortfallWarningWhenTheStockIsEnoughTest', () => {
    expect(
      shortfallWarning(form({ kind: 'OUT', quantity: '3' }), [balance(1, 3)], [MAIN]),
    ).toBeNull()
  })

  it('shortfallWarningOnAReceiptTest', () => {
    expect(shortfallWarning(form({ quantity: '99' }), [balance(1, 0)], [MAIN])).toBeNull()
  })
})

describe('firstBookingComplaint', () => {
  it('firstBookingComplaintTest', () => {
    expect(firstBookingComplaint(form())).toBeNull()
  })

  it('firstBookingComplaintWithoutAProductTest', () => {
    expect(firstBookingComplaint(form({ product: null }))).toBe('Wählen Sie ein Produkt.')
  })

  it('firstBookingComplaintWithoutAQuantityTest', () => {
    expect(firstBookingComplaint(form({ quantity: '' }))).toBe(
      'Die Menge muss grösser als null sein.',
    )
    expect(firstBookingComplaint(form({ quantity: '0' }))).toBe(
      'Die Menge muss grösser als null sein.',
    )
  })

  it('firstBookingComplaintWithoutALocationTest', () => {
    expect(firstBookingComplaint(form({ locationId: '' }))).toBe('Wählen Sie einen Lagerort.')
  })

  /** The one thing the mask must not let through: a transfer that goes nowhere. */
  it('firstBookingComplaintForATransferOntoTheSameLocationTest', () => {
    expect(
      firstBookingComplaint(form({ kind: 'TRANSFER', locationId: '1', toLocationId: '1' })),
    ).toBe('Quelle und Ziel einer Umlagerung müssen verschieden sein.')
  })

  it('firstBookingComplaintWithABookingDateInTheFutureTest', () => {
    expect(firstBookingComplaint(form({ bookedOn: '2999-01-01' }))).toBe(
      'Das Buchungsdatum darf nicht in der Zukunft liegen.',
    )
  })

  it('firstBookingComplaintWithACostThatIsNoNumberTest', () => {
    expect(firstBookingComplaint(form({ unitCost: 'teuer' }))).toBe(
      'Der Einstandspreis ist keine Zahl.',
    )
  })
})

describe('canSubmit', () => {
  it('canSubmitTest', () => {
    expect(canSubmit(form())).toBe(true)
  })

  /** The button is dead before the click, not after it. */
  it('canSubmitForATransferOntoTheSameLocationTest', () => {
    expect(canSubmit(form({ kind: 'TRANSFER', locationId: '1', toLocationId: '1' }))).toBe(false)
  })
})

describe('toBookPayload', () => {
  it('toBookPayloadTest', () => {
    const payload = toBookPayload(form({ quantity: '20', note: ' Palette ' }))

    expect(payload).toEqual({
      productId: 42,
      locationId: 1,
      direction: 'IN',
      reason: 'RECEIPT',
      quantity: 20,
      bookedOn: TODAY,
      unitCost: undefined,
      unitCostCurrency: undefined,
      note: 'Palette',
    })
  })

  it('toBookPayloadForAnIssueTest', () => {
    const payload = toBookPayload(form({ kind: 'OUT', reason: 'SCRAP', quantity: '3' }))

    expect(payload.direction).toBe('OUT')
    expect(payload.reason).toBe('SCRAP')
    // Always positive; the backend makes the sign out of the direction.
    expect(payload.quantity).toBe(3)
  })

  /** Amount and currency travel together or not at all. */
  it('toBookPayloadWithACostTest', () => {
    const payload = toBookPayload(form({ unitCost: '1,20', unitCostCurrency: 'eur' }))

    expect(payload.unitCost).toBe(1.2)
    expect(payload.unitCostCurrency).toBe('EUR')
  })

  it('toBookPayloadDropsTheCostOnAnIssueTest', () => {
    const payload = toBookPayload(form({ kind: 'OUT', unitCost: '1.20' }))

    expect(payload.unitCost).toBeUndefined()
    expect(payload.unitCostCurrency).toBeUndefined()
  })
})

describe('toTransferPayload', () => {
  it('toTransferPayloadTest', () => {
    const payload = toTransferPayload(
      form({ kind: 'TRANSFER', locationId: '1', toLocationId: '2', quantity: '5' }),
    )

    expect(payload).toEqual({
      productId: 42,
      fromLocationId: 1,
      toLocationId: 2,
      quantity: 5,
      bookedOn: TODAY,
      note: undefined,
    })
  })
})

describe('productLabel', () => {
  it('productLabelTest', () => {
    expect(productLabel(SCREW)).toBe('P-001 · Schraube')
  })

  it('productLabelWithoutANumberTest', () => {
    expect(productLabel({ ...SCREW, productNumber: undefined })).toBe('Schraube')
  })

  it('productLabelWithoutAProductTest', () => {
    expect(productLabel(null)).toBe('')
  })
})
