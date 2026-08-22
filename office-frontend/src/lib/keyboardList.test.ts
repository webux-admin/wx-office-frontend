import { describe, expect, it } from 'vitest'
import { nextIndex } from './keyboardList'

describe('nextIndex', () => {
  it('nextIndexTest', () => {
    expect(nextIndex(2, 1, 8)).toBe(3)
    expect(nextIndex(2, -1, 8)).toBe(1)
  })

  it('nextIndexWrapsAtTheEndTest', () => {
    expect(nextIndex(7, 1, 8)).toBe(0)
  })

  it('nextIndexWrapsAtTheStartTest', () => {
    expect(nextIndex(0, -1, 8)).toBe(7)
  })

  it('nextIndexWithoutAMarkedEntryTest', () => {
    expect(nextIndex(-1, 1, 8)).toBe(0)
    expect(nextIndex(-1, -1, 8)).toBe(7)
  })

  it('nextIndexWithOneEntryTest', () => {
    expect(nextIndex(0, 1, 1)).toBe(0)
    expect(nextIndex(0, -1, 1)).toBe(0)
  })

  it('nextIndexWithAnEmptyListTest', () => {
    expect(nextIndex(0, 1, 0)).toBe(-1)
  })
})
