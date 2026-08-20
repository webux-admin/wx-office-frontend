import { describe, expect, it } from 'vitest'
import {
  bodyHeightOf,
  DEFAULT_PAGE,
  isPlaced,
  newBlock,
  pageProblemOf,
  withAddedBlock,
  withBlock,
  withMovedBodyBlock,
  withoutBlock,
} from './layout'
import type { PrintLayoutDefinition } from '../lib/types'

const FORM: PrintLayoutDefinition = {
  page: DEFAULT_PAGE,
  header: [newBlock('TEXT', { x: 0, y: 0 })],
  body: [newBlock('POSITIONS', { x: 0, y: 0 }), newBlock('TOTALS', { x: 0, y: 0 })],
  footer: [],
}

describe('isPlaced', () => {
  it('isPlacedTest', () => {
    expect(isPlaced('TEXT')).toBe(true)
    expect(isPlaced('ADDRESS')).toBe(true)
  })

  it('isPlacedForFlowingBlocksTest', () => {
    expect(isPlaced('POSITIONS')).toBe(false)
    expect(isPlaced('TOTALS')).toBe(false)
    expect(isPlaced('PAYMENT_TERMS')).toBe(false)
  })
})

describe('newBlock', () => {
  it('newBlockTest', () => {
    const block = newBlock('FIELD', { x: 12, y: 30 })

    expect(block.x).toBe(12)
    expect(block.y).toBe(30)
    expect(block.field).toBe('document.number')
    expect(block.style.bold).toBe(false)
  })

  it('newBlockForAFlowingBlockKeepsNoPositionTest', () => {
    const block = newBlock('POSITIONS', { x: 12, y: 30 })

    expect(block.x).toBe(0)
    expect(block.y).toBe(0)
    expect(block.width).toBeUndefined()
  })

  it('newBlockForAnAddressTest', () => {
    const block = newBlock('ADDRESS', { x: 0, y: 20 })

    expect(block.field).toBe('recipient')
    expect(block.height).toBe(35)
  })
})

describe('bodyHeightOf', () => {
  it('bodyHeightOfTest', () => {
    expect(bodyHeightOf(DEFAULT_PAGE)).toBe(160)
  })

  it('bodyHeightOfWithABigHeadTest', () => {
    expect(bodyHeightOf({ ...DEFAULT_PAGE, headerHeight: 200 })).toBe(45)
  })
})

describe('pageProblemOf', () => {
  it('pageProblemOfTest', () => {
    expect(pageProblemOf(DEFAULT_PAGE)).toBeUndefined()
  })

  it('pageProblemOfWithoutRoomForThePositionsTest', () => {
    expect(pageProblemOf({ ...DEFAULT_PAGE, headerHeight: 240 })).toContain('Positionen')
  })

  it('pageProblemOfAtTheLowerBoundTest', () => {
    // 297 - 18 - 22 - 205 - 12 = 40, exactly what is still allowed
    expect(pageProblemOf({ ...DEFAULT_PAGE, headerHeight: 205 })).toBeUndefined()
  })

  it('pageProblemOfWithoutWidthTest', () => {
    expect(pageProblemOf({ ...DEFAULT_PAGE, marginLeft: 105, marginRight: 105 })).toContain(
      'Breite',
    )
  })
})

describe('withBlock', () => {
  it('withBlockTest', () => {
    const changed = withBlock(FORM, 'header', 0, { ...FORM.header[0], text: 'Neu' })

    expect(changed.header[0].text).toBe('Neu')
    expect(FORM.header[0].text).toBe('Text')
  })

  it('withoutBlockTest', () => {
    expect(withoutBlock(FORM, 'body', 0).body).toHaveLength(1)
    expect(withoutBlock(FORM, 'body', 0).body[0].type).toBe('TOTALS')
  })

  it('withAddedBlockTest', () => {
    const changed = withAddedBlock(FORM, 'footer', newBlock('TEXT', { x: 0, y: 0 }))

    expect(changed.footer).toHaveLength(1)
    expect(FORM.footer).toHaveLength(0)
  })
})

describe('withMovedBodyBlock', () => {
  it('withMovedBodyBlockTest', () => {
    const changed = withMovedBodyBlock(FORM, 1, -1)

    expect(changed.body.map((block) => block.type)).toEqual(['TOTALS', 'POSITIONS'])
  })

  it('withMovedBodyBlockAtTheEndsTest', () => {
    expect(withMovedBodyBlock(FORM, 0, -1)).toBe(FORM)
    expect(withMovedBodyBlock(FORM, 1, 1)).toBe(FORM)
  })
})
