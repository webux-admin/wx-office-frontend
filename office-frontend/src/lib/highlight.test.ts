import { describe, expect, it } from 'vitest'
import { matchParts } from './highlight'

describe('matchParts', () => {
  it('matchPartsTest', () => {
    const parts = matchParts('Wartung Serverraum', 'server')

    expect(parts).toEqual([
      { text: 'Wartung ', match: false },
      { text: 'Server', match: true },
      { text: 'raum', match: false },
    ])
  })

  it('matchPartsMarksEveryOccurrenceTest', () => {
    const parts = matchParts('Farbe Rot, Farbe Blau', 'farbe')

    expect(parts.filter((part) => part.match)).toHaveLength(2)
    expect(parts.map((part) => part.text).join('')).toBe('Farbe Rot, Farbe Blau')
  })

  it('matchPartsWithAMatchAtTheStartTest', () => {
    expect(matchParts('P-100', 'p-1')).toEqual([
      { text: 'P-1', match: true },
      { text: '00', match: false },
    ])
  })

  it('matchPartsWithTheWholeTextMatchingTest', () => {
    expect(matchParts('Wartung', 'wartung')).toEqual([{ text: 'Wartung', match: true }])
  })

  it('matchPartsWithoutAMatchTest', () => {
    expect(matchParts('Wartung', 'Kabel')).toEqual([{ text: 'Wartung', match: false }])
  })

  it('matchPartsWithAnEmptyTermTest', () => {
    expect(matchParts('Wartung', '   ')).toEqual([{ text: 'Wartung', match: false }])
  })

  it('matchPartsWithAnEmptyTextTest', () => {
    expect(matchParts('', 'Wartung')).toEqual([])
  })

  it('matchPartsTakesTheTermLiterallyTest', () => {
    // A product number is not a pattern: ".100" must not match "P-100".
    expect(matchParts('P-100', '.100')).toEqual([{ text: 'P-100', match: false }])
  })
})
