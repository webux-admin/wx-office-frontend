import { describe, expect, it } from 'vitest'
import { onlyBarCodeMatched } from './productSearch'

/** The cable, with the bar code a scanner reads off its shelf label. */
const CABLE = { name: 'Kabel', productNumber: 'K-010', eanCode: '7612345678901' }

describe('onlyBarCodeMatched', () => {
  it('onlyBarCodeMatchedTest', () => {
    expect(onlyBarCodeMatched(CABLE, '7612345678901')).toBe(true)
  })

  it('onlyBarCodeMatchedWithAPartOfTheCodeTest', () => {
    // The server matches anywhere in the code, so a typed middle piece finds the article and
    // the row still shows nothing that explains itself.
    expect(onlyBarCodeMatched(CABLE, '234567')).toBe(true)
  })

  it('onlyBarCodeMatchedByNameTest', () => {
    // The name carries the term, so the row explains itself.
    expect(onlyBarCodeMatched(CABLE, 'kabel')).toBe(false)
  })

  it('onlyBarCodeMatchedByNumberTest', () => {
    expect(onlyBarCodeMatched(CABLE, 'K-010')).toBe(false)
  })

  it('onlyBarCodeMatchedIgnoresCaseTest', () => {
    // The search is case blind on both sides; a term the name carries in another case is
    // still no bar code hit.
    expect(onlyBarCodeMatched({ ...CABLE, name: 'KABEL' }, 'kabel')).toBe(false)
  })

  it('onlyBarCodeMatchedWithoutATermTest', () => {
    // The whole catalogue stands there; nothing was matched at all.
    expect(onlyBarCodeMatched(CABLE, '')).toBe(false)
  })

  it('onlyBarCodeMatchedWithoutACodeTest', () => {
    expect(onlyBarCodeMatched({ name: 'Wartung', productNumber: 'P-100' }, 'p-1')).toBe(false)
  })

  it('onlyBarCodeMatchedWithoutANumberTest', () => {
    // A product without a number is found by its code all the same.
    expect(onlyBarCodeMatched({ name: 'Kabel', eanCode: '7612345678901' }, '76123')).toBe(true)
  })

  it('onlyBarCodeMatchedWithACodeThatDoesNotCarryTheTermTest', () => {
    // Nothing on the row matched, which is not this list's business: the row came from
    // somewhere this rule does not know, and it says nothing about it.
    expect(onlyBarCodeMatched(CABLE, '999')).toBe(false)
  })
})
