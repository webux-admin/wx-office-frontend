import { describe, expect, it } from 'vitest'
import {
  emptyPriceRow,
  isBlankRow,
  priceFieldErrors,
  priceRowsOfAmounts,
  pricesChanged,
  toPricePayload,
  toPriceRowForm,
  type PriceRowForm,
} from './priceRows'
import type { Product } from '../../lib/types'

const PRODUCT: Product = {
  id: 7,
  productType: 'SERVICE',
  name: 'Beratung',
  unit: 'HOUR',
  prices: [
    { id: 1, minQuantity: 0, price: 150 },
    { id: 2, priceGroupId: 4, minQuantity: 10, validFrom: '2026-01-01', price: 132 },
  ],
}

/** A line the operator has filled in completely. */
function filled(overrides: Partial<PriceRowForm> = {}): PriceRowForm {
  return { ...emptyPriceRow(), price: '150', ...overrides }
}

/** The message under the price table, or `null` when the table is fine. */
function complaintOf(rows: PriceRowForm[]): string | null {
  return priceFieldErrors(rows).prices ?? null
}

describe('emptyPriceRow', () => {
  it('emptyPriceRowTest', () => {
    const row = emptyPriceRow()

    expect(row.priceGroup).toBe('')
    expect(row.minQuantity).toBe('')
    expect(row.validFrom).toBe('')
    expect(row.validTo).toBe('')
    expect(row.price).toBe('')
  })

  it('emptyPriceRowGivesEveryLineItsOwnKeyTest', () => {
    // Two fresh lines are indistinguishable by content, so the key has to tell them apart.
    expect(emptyPriceRow().key).not.toBe(emptyPriceRow().key)
  })
})

describe('toPriceRowForm', () => {
  it('toPriceRowFormTest', () => {
    const rows = toPriceRowForm(PRODUCT)

    expect(rows).toHaveLength(2)
    expect(rows[0].priceGroup).toBe('')
    expect(rows[0].price).toBe('150')
    expect(rows[1].priceGroup).toBe('4')
    expect(rows[1].minQuantity).toBe('10')
    expect(rows[1].validFrom).toBe('2026-01-01')
    expect(rows[1].validTo).toBe('')
  })

  it('toPriceRowFormHidesTheZeroScaleTest', () => {
    // 0 is the base entry, not a choice; showing it would suggest it were one.
    expect(toPriceRowForm(PRODUCT)[0].minQuantity).toBe('')
  })

  it('toPriceRowFormWithoutAProductTest', () => {
    expect(toPriceRowForm(null)).toEqual([])
  })

  it('toPriceRowFormWithoutPricesTest', () => {
    expect(toPriceRowForm({ id: 1, productType: 'GOODS', name: 'Couvert', unit: 'PIECE' }))
      .toEqual([])
  })
})

describe('toPricePayload', () => {
  it('toPricePayloadTest', () => {
    const payload = toPricePayload([
      filled({ priceGroup: '4', minQuantity: '10', validFrom: '2026-01-01', validTo: '2026-12-31', price: '132.50' }),
    ])

    expect(payload).toEqual([
      {
        priceGroupId: 4,
        minQuantity: 10,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        price: 132.5,
      },
    ])
  })

  it('toPricePayloadWithoutAGroupIsTheBasePriceTest', () => {
    expect(toPricePayload([filled()])[0].priceGroupId).toBeUndefined()
  })

  it('toPricePayloadLeavesOpenEndsOutTest', () => {
    const row = toPricePayload([filled()])[0]

    expect(row.validFrom).toBeUndefined()
    expect(row.validTo).toBeUndefined()
    expect(row.minQuantity).toBeUndefined()
  })

  it('toPricePayloadDropsUntouchedLinesTest', () => {
    // A line the operator added and never filled in is not a price of nought.
    expect(toPricePayload([emptyPriceRow(), filled()])).toHaveLength(1)
  })

  it('toPricePayloadKeepsALineWithAnUnreadableAmountTest', () => {
    // Dropping it would delete a stored price because of a typo. The save is stopped by
    // priceFieldErrors before this payload is ever built.
    expect(toPricePayload([filled({ price: '150.-' })])).toHaveLength(1)
  })

  it('toPricePayloadKeepsAZeroAmountTest', () => {
    // Nought is a price: a give-away has to be expressible.
    expect(toPricePayload([filled({ price: '0' })])[0].price).toBe(0)
  })

  it('toPricePayloadReadsSwissSeparatorsTest', () => {
    expect(toPricePayload([filled({ price: "12’400,50" })])[0].price).toBe(12400.5)
  })

  it('toPricePayloadWithoutLinesTest', () => {
    expect(toPricePayload([])).toEqual([])
  })
})

describe('pricesChanged', () => {
  it('pricesChangedTest', () => {
    const rows = toPriceRowForm(PRODUCT)
    rows[0] = { ...rows[0], price: '160' }

    expect(pricesChanged(rows, PRODUCT)).toBe(true)
  })

  it('pricesChangedWithTheStoredLinesTest', () => {
    expect(pricesChanged(toPriceRowForm(PRODUCT), PRODUCT)).toBe(false)
  })

  it('pricesChangedIgnoresAnEmptyNewLineTest', () => {
    // Adding a line and not filling it in is not a change worth a request.
    expect(pricesChanged([...toPriceRowForm(PRODUCT), emptyPriceRow()], PRODUCT)).toBe(false)
  })

  it('pricesChangedWhenALineIsRemovedTest', () => {
    expect(pricesChanged([toPriceRowForm(PRODUCT)[0]], PRODUCT)).toBe(true)
  })

  it('pricesChangedWhileCreatingTest', () => {
    expect(pricesChanged([filled()], null)).toBe(true)
    expect(pricesChanged([], null)).toBe(false)
  })
})

describe('isBlankRow', () => {
  it('isBlankRowTest', () => {
    expect(isBlankRow(emptyPriceRow())).toBe(true)
  })

  it('isBlankRowWithAnAmountTest', () => {
    expect(isBlankRow(filled())).toBe(false)
  })

  it('isBlankRowWithOnlyWhitespaceTest', () => {
    expect(isBlankRow({ ...emptyPriceRow(), price: '  ', minQuantity: ' ' })).toBe(true)
  })

  it('isBlankRowWithOnlyAGroupTest', () => {
    expect(isBlankRow({ ...emptyPriceRow(), priceGroup: '4' })).toBe(false)
  })

  it('isBlankRowWithOnlyADateTest', () => {
    expect(isBlankRow({ ...emptyPriceRow(), validFrom: '2026-01-01' })).toBe(false)
  })
})

describe('priceFieldErrors', () => {
  it('priceFieldErrorsTest', () => {
    expect(complaintOf([filled({ validFrom: '2026-01-01', validTo: '2026-12-31' })]))
      .toBeNull()
  })

  it('priceFieldErrorsWithoutLinesTest', () => {
    expect(complaintOf([])).toBeNull()
  })

  it('priceFieldErrorsIgnoresAnUntouchedLineTest', () => {
    expect(complaintOf([emptyPriceRow()])).toBeNull()
  })

  it('priceFieldErrorsWithoutAnAmountTest', () => {
    expect(complaintOf([{ ...emptyPriceRow(), priceGroup: '4' }]))
      .toBe('Jede Preiszeile braucht einen lesbaren Betrag, zum Beispiel 1250.00.')
  })

  it('priceFieldErrorsWithAnUnreadableAmountTest', () => {
    // "150.-" is how an amount is written by hand in Switzerland, and it is not a number.
    // Letting it through would send the line without an amount and delete the stored price.
    expect(complaintOf([{ ...emptyPriceRow(), price: '150.-' }]))
      .toBe('Jede Preiszeile braucht einen lesbaren Betrag, zum Beispiel 1250.00.')
  })

  it('priceFieldErrorsWithAnUnreadableQuantityTest', () => {
    expect(complaintOf([filled({ minQuantity: '10 Stk' })]))
      .toBe('Ab Menge muss eine Zahl sein, zum Beispiel 10.')
  })

  it('priceFieldErrorsAcceptsAnEmptyQuantityTest', () => {
    expect(complaintOf([filled({ minQuantity: '   ' })])).toBeNull()
  })

  it('priceFieldErrorsWithABackwardsPeriodTest', () => {
    expect(complaintOf([filled({ validFrom: '2026-12-31', validTo: '2026-01-01' })]))
      .toBe('Das Bis-Datum darf nicht vor dem Ab-Datum liegen.')
  })

  it('priceFieldErrorsAcceptsAOneDayPeriodTest', () => {
    expect(complaintOf([filled({ validFrom: '2026-01-01', validTo: '2026-01-01' })]))
      .toBeNull()
  })

  it('priceFieldErrorsAcceptsAnOpenEndTest', () => {
    expect(complaintOf([filled({ validFrom: '2026-01-01' })])).toBeNull()
    expect(complaintOf([filled({ validTo: '2026-12-31' })])).toBeNull()
  })
})

describe('priceRowsOfAmounts', () => {
  it('priceRowsOfAmountsTest', () => {
    // The order follows the object keys, which JavaScript sorts with numbers first; the backend
    // does not care about the order of the lines, so the test does not either.
    const rows = priceRowsOfAmounts({ '': '150.00', '4': '132.50' })
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceGroup: '', price: '150.00' }),
        expect.objectContaining({ priceGroup: '4', price: '132.50' }),
      ]),
    )
  })

  it('priceRowsOfAmountsWithoutAmountsTest', () => {
    expect(priceRowsOfAmounts({})).toEqual([])
  })

  it('priceRowsOfAmountsLeavesOutBlankAmountsTest', () => {
    const rows = priceRowsOfAmounts({ '': '   ', '4': '132' })
    expect(rows.map((row) => row.priceGroup)).toEqual(['4'])
  })

  it('priceRowsOfAmountsGivesEveryLineNoQuantityOrPeriodTest', () => {
    const [row] = priceRowsOfAmounts({ '4': '132' })
    expect(row).toMatchObject({ minQuantity: '', validFrom: '', validTo: '' })
  })

  it('priceRowsOfAmountsPayloadIsTheBasePriceAndTheGroupTest', () => {
    const payload = toPricePayload(priceRowsOfAmounts({ '': '150', '4': '132' }))
    expect(payload).toHaveLength(2)
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ priceGroupId: undefined, price: 150 }),
        expect.objectContaining({ priceGroupId: 4, price: 132 }),
      ]),
    )
  })
})
