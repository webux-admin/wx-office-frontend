import { describe, expect, it } from 'vitest'
import {
  clamp,
  formatLength,
  formatLengthShort,
  mmToPx,
  parseLength,
  ptToMm,
  pxToMm,
  PX_PER_MM,
  roundLength,
  roundToStep,
} from './units'

describe('mmToPx', () => {
  it('mmToPxTest', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 6)
  })

  it('mmToPxWithZoomTest', () => {
    expect(mmToPx(210, 0.5)).toBeCloseTo((210 * PX_PER_MM) / 2, 6)
  })

  it('mmToPxWithZeroTest', () => {
    expect(mmToPx(0)).toBe(0)
  })
})

describe('pxToMm', () => {
  it('pxToMmTest', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 6)
  })

  it('pxToMmWithZoomTest', () => {
    // At 200 % the same 96 pixels cover half as much paper.
    expect(pxToMm(96, 2)).toBeCloseTo(12.7, 6)
  })

  it('pxToMmWithoutZoomTest', () => {
    // A sheet that is not on screen measures nothing, rather than dividing by zero.
    expect(pxToMm(96, 0)).toBe(0)
    expect(pxToMm(96, -1)).toBe(0)
  })
})

describe('ptToMm', () => {
  it('ptToMmTest', () => {
    expect(ptToMm(72)).toBeCloseTo(25.4, 6)
  })

  it('ptToMmWithNineTest', () => {
    // The base size of a document: 9 pt is 3.175 mm.
    expect(ptToMm(9)).toBeCloseTo(3.175, 6)
  })
})

describe('clamp', () => {
  it('clampTest', () => {
    expect(clamp(12, 0, 20)).toBe(12)
  })

  it('clampAtTheBoundsTest', () => {
    expect(clamp(-3, 0, 20)).toBe(0)
    expect(clamp(25, 0, 20)).toBe(20)
    expect(clamp(20, 0, 20)).toBe(20)
  })

  it('clampWithCrossedBoundsTest', () => {
    // A frame smaller than its content pins the content to the start.
    expect(clamp(15, 10, 4)).toBe(10)
  })
})

describe('roundLength', () => {
  it('roundLengthTest', () => {
    expect(roundLength(12.3456)).toBe(12.35)
  })

  it('roundLengthAtTheHalfTest', () => {
    expect(roundLength(1.005)).toBe(1.01)
    expect(roundLength(0.1 + 0.2)).toBe(0.3)
  })

  it('roundLengthWithMinusZeroTest', () => {
    expect(Object.is(roundLength(-0.001), 0)).toBe(true)
  })
})

describe('roundToStep', () => {
  it('roundToStepTest', () => {
    expect(roundToStep(12.3, 0.5)).toBe(12.5)
    expect(roundToStep(12.2, 0.5)).toBe(12)
  })

  it('roundToStepAtTheMiddleTest', () => {
    expect(roundToStep(12.25, 0.5)).toBe(12.5)
    expect(roundToStep(7.04, 0.1)).toBe(7)
  })

  it('roundToStepWithoutStepTest', () => {
    expect(roundToStep(12.3456, 0)).toBe(12.35)
  })
})

describe('formatLength', () => {
  it('formatLengthTest', () => {
    expect(formatLength(20)).toBe('20.0')
    expect(formatLength(12.5)).toBe('12.5')
  })

  it('formatLengthWithTwoDecimalsTest', () => {
    expect(formatLength(12.25)).toBe('12.25')
    expect(formatLength(215.9)).toBe('215.9')
  })

  it('formatLengthWithZeroTest', () => {
    expect(formatLength(0)).toBe('0.0')
  })
})

describe('formatLengthShort', () => {
  it('formatLengthShortTest', () => {
    expect(formatLengthShort(20)).toBe('20')
    expect(formatLengthShort(12.5)).toBe('12.5')
  })

  it('formatLengthShortWithNoiseTest', () => {
    expect(formatLengthShort(0.1 + 0.2)).toBe('0.3')
  })
})

describe('parseLength', () => {
  it('parseLengthTest', () => {
    expect(parseLength('12.5')).toBe(12.5)
  })

  it('parseLengthWithCommaAndUnitTest', () => {
    expect(parseLength(' 12,5 mm ')).toBe(12.5)
    expect(parseLength('9pt')).toBe(9)
    expect(parseLength('1’250')).toBe(1250)
  })

  it('parseLengthWithNothingUsableTest', () => {
    expect(parseLength('')).toBeNull()
    expect(parseLength('   ')).toBeNull()
    expect(parseLength('zwölf')).toBeNull()
    expect(parseLength('12.5.3')).toBeNull()
  })
})
