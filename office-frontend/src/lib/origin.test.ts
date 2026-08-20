import { describe, expect, it } from 'vitest'
import { originOf, originState, type Origin } from './origin'

/** Where a product mask goes when the router names no origin. */
const FALLBACK: Origin = { from: '/produkte', label: 'Produkte' }

describe('originState', () => {
  it('originStateTest', () => {
    expect(originState('/', 'Übersicht')).toEqual({ origin: { from: '/', label: 'Übersicht' } })
  })

  it('originStateWithQueryTest', () => {
    expect(originState('/produkte?page=2', 'Produkte')).toEqual({
      origin: { from: '/produkte?page=2', label: 'Produkte' },
    })
  })
})

describe('originOf', () => {
  it('originOfTest', () => {
    expect(originOf(originState('/', 'Übersicht'), FALLBACK)).toEqual({
      from: '/',
      label: 'Übersicht',
    })
  })

  /** A typed address and a link opened in a new tab arrive without state; a reload does not. */
  it('originOfWithoutStateTest', () => {
    expect(originOf(null, FALLBACK)).toEqual(FALLBACK)
    expect(originOf(undefined, FALLBACK)).toEqual(FALLBACK)
  })

  it('originOfWithForeignStateTest', () => {
    expect(originOf({ scrollPosition: 120 }, FALLBACK)).toEqual(FALLBACK)
  })

  it('originOfWithStringStateTest', () => {
    expect(originOf('/kunden', FALLBACK)).toEqual(FALLBACK)
  })

  /** A history entry written by an older version can be short of a field. */
  it('originOfWithHalfAnOriginTest', () => {
    expect(originOf({ origin: { from: '/kunden' } }, FALLBACK)).toEqual(FALLBACK)
    expect(originOf({ origin: { label: 'Kunden' } }, FALLBACK)).toEqual(FALLBACK)
  })

  it('originOfWithWrongFieldTypesTest', () => {
    expect(originOf({ origin: { from: 7, label: 'Kunden' } }, FALLBACK)).toEqual(FALLBACK)
    expect(originOf({ origin: { from: '/kunden', label: null } }, FALLBACK)).toEqual(FALLBACK)
  })

  it('originOfWithBlankLabelTest', () => {
    expect(originOf({ origin: { from: '/kunden', label: '  ' } }, FALLBACK)).toEqual(FALLBACK)
  })

  it('originOfWithRelativePathTest', () => {
    expect(originOf({ origin: { from: 'kunden', label: 'Kunden' } }, FALLBACK)).toEqual(FALLBACK)
  })

  /** The way back must not become an open redirect. */
  it('originOfWithProtocolRelativePathTest', () => {
    expect(originOf({ origin: { from: '//example.test', label: 'Kunden' } }, FALLBACK)).toEqual(
      FALLBACK,
    )
  })

  it('originOfWithBackslashPathTest', () => {
    expect(originOf({ origin: { from: '/\\example.test', label: 'Kunden' } }, FALLBACK)).toEqual(
      FALLBACK,
    )
  })

  it('originOfWithAbsoluteUrlTest', () => {
    expect(
      originOf({ origin: { from: 'https://example.test/kunden', label: 'Kunden' } }, FALLBACK),
    ).toEqual(FALLBACK)
  })

  it('originOfWithEmptyPathTest', () => {
    expect(originOf({ origin: { from: '', label: 'Kunden' } }, FALLBACK)).toEqual(FALLBACK)
  })

  /** The root is one character long, so the check on the second one must not trip over it. */
  it('originOfWithRootPathTest', () => {
    expect(originOf({ origin: { from: '/', label: 'Übersicht' } }, FALLBACK)).toEqual({
      from: '/',
      label: 'Übersicht',
    })
  })
})
