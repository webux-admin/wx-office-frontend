import { describe, expect, it } from 'vitest'
import {
  EMPTY_SAMPLE,
  fieldByPath,
  isUnknownField,
  labelOfElement,
  labelOfObject,
  labelOfSection,
  normalizeCatalogue,
  sampleAddressOf,
  sampleTextOf,
  searchFields,
  usedFieldKeys,
} from './catalogue'
import { addChild, addElement, newSection } from './definition'
import { element, sampleCatalogue, sampleForm } from './fixtures'

const CATALOGUE = sampleCatalogue()

describe('normalizeCatalogue', () => {
  it('normalizeCatalogueTest', () => {
    // A complete answer comes back as it went in.
    expect(normalizeCatalogue(sampleCatalogue())).toEqual(sampleCatalogue())
  })

  it('normalizeCatalogueFillsWhatIsMissingTest', () => {
    // The shape of the old endpoint: no samples, no formats, no sample document.
    const catalogue = normalizeCatalogue({
      fields: [{ path: 'document.number', label: 'Belegnummer', group: 'Beleg' }],
      columns: [{ code: 'unitPrice', label: 'Preis', widthMm: 22, numeric: true }],
    })

    expect(catalogue.fields[0].sample).toBe('')
    expect(catalogue.columns[0].sample).toBe('')
    expect(catalogue.formats.map((format) => format.code)).toEqual([
      'A4',
      'A5',
      'A3',
      'LETTER',
      'LEGAL',
    ])
    expect(catalogue.sample).toEqual(EMPTY_SAMPLE)
  })

  it('normalizeCatalogueDropsWhatIsUnusableTest', () => {
    const catalogue = normalizeCatalogue({
      fields: [{ label: 'ohne Pfad' }, null, { path: 'a.b' }],
      columns: [{ code: '' }, { code: 'x', widthMm: -5 }],
      formats: [{ code: 'B5', label: 'B5' }, { code: 'A4', label: 'DIN A4' }],
      sample: {
        recipient: ['Muster AG', 42, null],
        lines: [{ kind: 'UNKNOWN' }, { kind: 'ITEM', cells: { position: 1, description: 'x' } }],
        totals: [{ label: 'Total', amount: '1.00', kind: 'SOMETHING' }],
      },
    })

    expect(catalogue.fields).toEqual([{ path: 'a.b', label: 'a.b', group: 'Weitere', sample: '' }])
    expect(catalogue.columns).toEqual([
      { code: 'x', label: 'x', widthMm: 0, numeric: false, sample: '' },
    ])
    // An unknown format is dropped, a known one keeps the label the server gave it.
    expect(catalogue.formats).toEqual([{ code: 'A4', label: 'DIN A4', widthMm: 210, heightMm: 297 }])
    expect(catalogue.sample.recipient).toEqual(['Muster AG'])
    expect(catalogue.sample.lines).toEqual([
      { kind: 'ITEM', cells: { position: '', description: 'x' }, details: [] },
    ])
    expect(catalogue.sample.totals[0].kind).toBe('NET')
  })

  it('normalizeCatalogueOfTheWireShapeTest', () => {
    // What the server really answers: `cells` and `details` on every line, and the two
    // kinds of total a document with a discount has.
    const catalogue = normalizeCatalogue({
      fields: [],
      columns: [],
      formats: [{ code: 'LETTER', label: 'Letter', widthMm: 215.9, heightMm: 279.4 }],
      sample: {
        lines: [
          { kind: 'SUBTOTAL', cells: {}, details: [], label: 'Zwischentotal', amount: '3’502.50' },
          { kind: 'COMMENT', cells: {}, details: [], text: 'Material und Spesen' },
        ],
        totals: [
          { label: 'Zwischentotal', amount: '4’000.00', kind: 'SUBTOTAL' },
          { label: 'Rabatt 5%', amount: '-200.00', kind: 'DISCOUNT' },
          { label: 'Total CHF', amount: '3’800.00', kind: 'GRAND' },
        ],
      },
    })

    expect(catalogue.sample.lines).toEqual([
      { kind: 'SUBTOTAL', label: 'Zwischentotal', amount: '3’502.50' },
      { kind: 'COMMENT', text: 'Material und Spesen' },
    ])
    expect(catalogue.sample.totals.map((total) => total.kind)).toEqual([
      'SUBTOTAL',
      'DISCOUNT',
      'GRAND',
    ])
    expect(catalogue.formats).toEqual([
      { code: 'LETTER', label: 'Letter', widthMm: 215.9, heightMm: 279.4 },
    ])
  })

  it('normalizeCatalogueWithNothingTest', () => {
    for (const raw of [undefined, null, 'kaputt', []]) {
      const catalogue = normalizeCatalogue(raw)
      expect(catalogue.fields).toEqual([])
      expect(catalogue.columns).toEqual([])
      expect(catalogue.formats).toHaveLength(5)
      expect(catalogue.sample).toEqual(EMPTY_SAMPLE)
    }
  })
})

describe('fieldByPath', () => {
  it('fieldByPathTest', () => {
    expect(fieldByPath(CATALOGUE, 'document.number')?.label).toBe('Belegnummer')
  })

  it('fieldByPathWithoutAMatchTest', () => {
    expect(fieldByPath(CATALOGUE, 'gone.field')).toBeUndefined()
    expect(fieldByPath(CATALOGUE, null)).toBeUndefined()
    expect(fieldByPath({ fields: [] }, 'document.number')).toBeUndefined()
  })
})

describe('isUnknownField', () => {
  it('isUnknownFieldTest', () => {
    expect(isUnknownField(element({ type: 'FIELD', field: 'gone.field' }), CATALOGUE)).toBe(true)
    expect(isUnknownField(element({ type: 'FIELD', field: 'document.number' }), CATALOGUE)).toBe(
      false,
    )
  })

  it('isUnknownFieldWithoutAPathTest', () => {
    expect(isUnknownField(element({ type: 'FIELD', field: null }), CATALOGUE)).toBe(true)
  })

  it('isUnknownFieldOnOtherKindsTest', () => {
    // Only a field can be unknown; an address names a party, not a path.
    expect(isUnknownField(element({ type: 'TEXT', field: 'gone.field' }), CATALOGUE)).toBe(false)
    expect(isUnknownField(element({ type: 'ADDRESS', field: 'recipient' }), CATALOGUE)).toBe(false)
  })
})

describe('sampleTextOf', () => {
  it('sampleTextOfTest', () => {
    expect(sampleTextOf(element({ type: 'FIELD', field: 'document.number', text: null }), CATALOGUE)).toBe(
      'RE-2026-00042',
    )
  })

  it('sampleTextOfWithALabelTest', () => {
    const field = element({ type: 'FIELD', field: 'document.number', text: 'Nr.' })
    expect(sampleTextOf(field, CATALOGUE)).toBe('Nr. RE-2026-00042')
  })

  it('sampleTextOfByKindTest', () => {
    expect(sampleTextOf(element({ type: 'TEXT', text: 'Hallo' }), CATALOGUE)).toBe('Hallo')
    expect(sampleTextOf(element({ type: 'PAGE_NUMBER' }), CATALOGUE)).toBe('Seite 1 von 1')
    expect(sampleTextOf(element({ type: 'IMAGE' }), CATALOGUE)).toBe('')
    expect(sampleTextOf(element({ type: 'TEXT', text: null }), CATALOGUE)).toBe('')
  })

  it('sampleTextOfAFieldWithoutAValueTest', () => {
    // An empty value leaves the label alone, as the renderer does.
    const empty = { ...CATALOGUE, fields: [{ path: 'x', label: 'X', group: 'G', sample: '' }] }
    expect(sampleTextOf(element({ type: 'FIELD', field: 'x', text: 'Referenz' }), empty)).toBe(
      'Referenz',
    )
    expect(sampleTextOf(element({ type: 'FIELD', field: 'x', text: '  ' }), empty)).toBe('')
  })

  it('sampleTextOfAnUnknownFieldTest', () => {
    expect(sampleTextOf(element({ type: 'FIELD', field: 'gone', text: null }), CATALOGUE)).toBe(
      'Unbekanntes Feld',
    )
  })
})

describe('sampleAddressOf', () => {
  it('sampleAddressOfTest', () => {
    expect(sampleAddressOf(element({ type: 'ADDRESS', field: 'recipient' }), CATALOGUE)[0]).toBe(
      'Muster AG',
    )
    expect(sampleAddressOf(element({ type: 'ADDRESS', field: 'issuer' }), CATALOGUE)[0]).toBe(
      'Webux GmbH',
    )
  })

  it('sampleAddressOfWithAnotherFieldTest', () => {
    // Anything but the issuer is the recipient.
    expect(sampleAddressOf(element({ type: 'ADDRESS', field: null }), CATALOGUE)[0]).toBe('Muster AG')
  })
})

describe('labelOfElement', () => {
  it('labelOfElementTest', () => {
    expect(labelOfElement(element({ type: 'FIELD', field: 'document.number' }), CATALOGUE)).toBe(
      'Belegnummer',
    )
  })

  it('labelOfElementByKindTest', () => {
    expect(labelOfElement(element({ text: 'Rechnung' }), CATALOGUE)).toBe('Text «Rechnung»')
    expect(labelOfElement(element({ type: 'ADDRESS', field: 'issuer' }), CATALOGUE)).toBe(
      'Adresse Absender',
    )
    expect(labelOfElement(element({ type: 'ADDRESS', field: 'recipient' }), CATALOGUE)).toBe(
      'Adresse Empfänger',
    )
    expect(labelOfElement(element({ type: 'IMAGE' }), CATALOGUE)).toBe('Bild')
    expect(labelOfElement(element({ type: 'LINE' }), CATALOGUE)).toBe('Linie')
    expect(labelOfElement(element({ type: 'PAGE_NUMBER' }), CATALOGUE)).toBe('Seitenzahl')
  })

  it('labelOfElementWithLongOrEmptyTextTest', () => {
    expect(labelOfElement(element({ text: '' }), CATALOGUE)).toBe('Text')
    expect(labelOfElement(element({ text: '   ' }), CATALOGUE)).toBe('Text')
    expect(
      labelOfElement(element({ text: 'Webux GmbH · Hauptstrasse 5 · 3000 Bern' }), CATALOGUE),
    ).toBe('Text «Webux GmbH · Hauptstrass…»')
    expect(labelOfElement(element({ text: 'Zeile eins\nZeile zwei' }), CATALOGUE)).toBe(
      'Text «Zeile eins Zeile zwei»',
    )
  })

  it('labelOfElementOfAnUnknownFieldTest', () => {
    expect(labelOfElement(element({ type: 'FIELD', field: 'gone' }), CATALOGUE)).toBe(
      'Unbekanntes Feld',
    )
  })
})

describe('labelOfSection', () => {
  it('labelOfSectionTest', () => {
    expect(labelOfSection(newSection('POSITIONS'))).toBe('Positionen')
    expect(labelOfSection(newSection('VAT_SUMMARY'))).toBe('MwSt-Aufstellung')
    expect(labelOfSection(newSection('FREE'))).toBe('Freier Bereich')
  })

  it('labelOfSectionOfTheTwoTextsTest', () => {
    expect(labelOfSection(newSection('DOCUMENT_TEXT', 'header'))).toBe('Belegtext (Kopf)')
    expect(labelOfSection(newSection('DOCUMENT_TEXT', 'footer'))).toBe('Belegtext (Fuss)')
  })
})

describe('labelOfObject', () => {
  it('labelOfObjectTest', () => {
    expect(labelOfObject(sampleForm(), 'e:1', CATALOGUE)).toBe('Belegnummer')
    expect(labelOfObject(sampleForm(), 's:2', CATALOGUE)).toBe('Totale')
    expect(labelOfObject(sampleForm(), 'c:3:0', CATALOGUE)).toBe('Text «Besten Dank»')
  })

  it('labelOfObjectThatIsNotThereTest', () => {
    expect(labelOfObject(sampleForm(), 'e:99', CATALOGUE)).toBe('')
    expect(labelOfObject(sampleForm(), 'unsinn', CATALOGUE)).toBe('')
  })
})

describe('usedFieldKeys', () => {
  it('usedFieldKeysTest', () => {
    const used = usedFieldKeys(sampleForm())
    expect(used.get('document.heading')).toBe('e:0')
    expect(used.get('document.number')).toBe('e:1')
    // An address is no field of the catalogue.
    expect(used.has('recipient')).toBe(false)
    expect(used.size).toBe(2)
  })

  it('usedFieldKeysInAFreeSectionTest', () => {
    const form = addChild(sampleForm(), 3, element({ type: 'FIELD', field: 'document.date' }))
    expect(usedFieldKeys(form!.definition).get('document.date')).toBe('c:3:1')
  })

  it('usedFieldKeysWithAFieldUsedTwiceTest', () => {
    // The first one is the one the badge leads to.
    const form = addElement(sampleForm(), element({ type: 'FIELD', field: 'document.number' }))
    expect(usedFieldKeys(form.definition).get('document.number')).toBe('e:1')
  })

  it('usedFieldKeysWithoutFieldsTest', () => {
    expect(usedFieldKeys({ ...sampleForm(), elements: [] }).size).toBe(0)
  })
})

describe('searchFields', () => {
  it('searchFieldsTest', () => {
    const groups = searchFields(CATALOGUE.fields, 'fällig')
    expect(groups).toEqual([
      {
        group: 'Beleg',
        fields: [{ path: 'document.dueDate', label: 'Fällig am', group: 'Beleg', sample: '21.12.2026' }],
      },
    ])
  })

  it('searchFieldsBySampleValueTest', () => {
    // People look for what they see on their invoice as often as for what it is called.
    const groups = searchFields(CATALOGUE.fields, 're-2026')
    expect(groups.flatMap((group) => group.fields.map((field) => field.path))).toEqual([
      'document.heading',
      'document.number',
    ])
  })

  it('searchFieldsWithABlankTermTest', () => {
    const groups = searchFields(CATALOGUE.fields, '  ')
    expect(groups.map((group) => group.group)).toEqual(['Beleg', 'Beträge', 'Empfänger'])
    expect(groups[0].fields).toHaveLength(4)
  })

  it('searchFieldsWithoutAMatchTest', () => {
    expect(searchFields(CATALOGUE.fields, 'gibtesnicht')).toEqual([])
    expect(searchFields([], 'x')).toEqual([])
  })
})
