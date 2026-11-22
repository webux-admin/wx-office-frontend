import { describe, expect, it } from 'vitest'
import {
  ELEMENT_ITEMS,
  elementFor,
  fieldItem,
  ghostSizeOf,
  SECTION_ITEMS,
  sectionFor,
  type PaletteItem,
} from './palette'

const item = (id: string): PaletteItem => {
  const found = [...ELEMENT_ITEMS, ...SECTION_ITEMS].find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no palette item ${id}`)
  return found
}
const elementItem = (id: string) => {
  const found = item(id)
  if (found.kind !== 'element') throw new Error(`${id} is no element`)
  return found
}
const sectionItem = (id: string) => {
  const found = item(id)
  if (found.kind !== 'section') throw new Error(`${id} is no section`)
  return found
}

describe('palette items', () => {
  it('paletteItemsTest', () => {
    // Everything the spec lists is offered, each once.
    expect(ELEMENT_ITEMS.map((entry) => entry.label)).toEqual([
      'Text',
      'Bild / Logo',
      'Linie',
      'Adresse Empfänger',
      'Adresse Absender',
      'Seitenzahl',
    ])
    expect(SECTION_ITEMS.map((entry) => entry.label)).toEqual([
      'Positionen',
      'Totale',
      'MwSt-Aufstellung',
      'Zahlungskondition',
      'Skontostaffeln',
      'Belegtext (Kopf)',
      'Belegtext (Fuss)',
      'Freier Bereich',
    ])
    const ids = [...ELEMENT_ITEMS, ...SECTION_ITEMS].map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('fieldItem', () => {
  it('fieldItemTest', () => {
    expect(
      fieldItem({ path: 'document.number', label: 'Belegnummer', group: 'Beleg', sample: 'RE-1' }),
    ).toEqual({
      kind: 'element',
      id: 'field:document.number',
      type: 'FIELD',
      field: 'document.number',
      label: 'Belegnummer',
      description: 'RE-1',
    })
  })

  it('fieldItemWithoutASampleTest', () => {
    expect(fieldItem({ path: 'a', label: 'A', group: 'G', sample: '' }).description).toBe('')
  })
})

describe('elementFor', () => {
  it('elementForTest', () => {
    expect(elementFor(elementItem('address-issuer'))).toMatchObject({
      type: 'ADDRESS',
      field: 'issuer',
    })
  })

  it('elementForAFieldTest', () => {
    const field = fieldItem({ path: 'document.date', label: 'Datum', group: 'Beleg', sample: '' })
    if (field.kind !== 'element') throw new Error('a field is an element')
    expect(elementFor(field)).toMatchObject({ type: 'FIELD', field: 'document.date' })
  })
})

describe('sectionFor', () => {
  it('sectionForTest', () => {
    // No indent and no width of their own: 78 mm at the right margin, by the rule of the renderer.
    expect(sectionFor(sectionItem('totals'))).toMatchObject({ type: 'TOTALS', x: null, width: null })
  })

  it('sectionForTheTwoTextsTest', () => {
    expect(sectionFor(sectionItem('text-footer'))).toMatchObject({
      type: 'DOCUMENT_TEXT',
      field: 'footer',
    })
    expect(sectionFor(sectionItem('text-header'))).toMatchObject({ field: 'header' })
  })
})

describe('ghostSizeOf', () => {
  it('ghostSizeOfTest', () => {
    // A text is 60 mm wide and one line of 9 pt high.
    expect(ghostSizeOf(item('text'), 170)).toEqual({ width: 60, height: 3.81 })
  })

  it('ghostSizeOfElementsWithTheirOwnSizeTest', () => {
    expect(ghostSizeOf(item('image'), 170)).toEqual({ width: 40, height: 20 })
    expect(ghostSizeOf(item('address-recipient'), 170)).toEqual({ width: 85, height: 35 })
    // A line runs up to the margin and is a hair high.
    expect(ghostSizeOf(item('line'), 170)).toEqual({ width: 170, height: 1 })
  })

  it('ghostSizeOfSectionsTest', () => {
    expect(ghostSizeOf(item('positions'), 170)).toEqual({ width: 170, height: 12 })
    expect(ghostSizeOf(item('totals'), 170)).toEqual({ width: 78, height: 12 })
    // On paper narrower than the totals they take what there is.
    expect(ghostSizeOf(item('vat-summary'), 60)).toEqual({ width: 60, height: 12 })
  })
})
