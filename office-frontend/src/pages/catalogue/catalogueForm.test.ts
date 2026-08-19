import { describe, expect, it } from 'vitest'
import type { CatalogueEntry } from '../../lib/types'
import {
  CATALOGUES,
  catalogueComplaint,
  reorderPayload,
  toCatalogueForm,
  toCataloguePayload,
  type CatalogueForm,
} from './catalogueForm'

const STORED: CatalogueEntry = {
  code: 'INVOICE',
  name: 'Rechnung',
  labels: { de: 'Rechnung', fr: 'Facture' },
  shortName: 'RG',
  sortOrder: 200,
  visible: true,
}

const FORM: CatalogueForm = {
  name: 'Rechnung',
  shortName: 'RG',
  visible: true,
  translations: { fr: 'Facture' },
}

describe('CATALOGUES', () => {
  it('cataloguesTest', () => {
    expect(CATALOGUES.map((catalogue) => catalogue.name)).toEqual([
      'partner-type',
      'address-usage',
      'product-type',
      'vat-category',
      'vat-method',
      'reference-type',
      'price-origin',
      'document-category',
      'document-status',
    ])
  })

  it('cataloguesCarryATitleAndADescriptionTest', () => {
    for (const catalogue of CATALOGUES) {
      expect(catalogue.title).not.toBe('')
      expect(catalogue.description).not.toBe('')
    }
  })
})

describe('toCatalogueForm', () => {
  it('toCatalogueFormTest', () => {
    const form = toCatalogueForm(STORED, 'de')

    expect(form.name).toBe('Rechnung')
    expect(form.shortName).toBe('RG')
    expect(form.visible).toBe(true)
    // The German text stands in the name field; a second field for it would invite the two to
    // disagree.
    expect(form.translations).toEqual({ fr: 'Facture' })
  })

  it('toCatalogueFormTurnsMissingFieldsIntoEmptyValuesTest', () => {
    const form = toCatalogueForm({ code: 'DRAFT', name: 'Entwurf' }, 'de')

    expect(form.shortName).toBe('')
    expect(form.translations).toEqual({})
    // Only an explicit false means hidden; a value without the flag is offered.
    expect(form.visible).toBe(true)
  })

  it('toCatalogueFormOfAHiddenValueTest', () => {
    const form = toCatalogueForm({ ...STORED, visible: false }, 'de')

    expect(form.visible).toBe(false)
  })

  it('toCatalogueFormWithoutADefaultLanguageKeepsEveryTranslationTest', () => {
    // Nothing is known to be the default, so no translation may be dropped from the fields.
    const form = toCatalogueForm(STORED, '')

    expect(form.translations).toEqual({ de: 'Rechnung', fr: 'Facture' })
  })
})

describe('toCataloguePayload', () => {
  it('toCataloguePayloadTest', () => {
    const payload = toCataloguePayload(FORM, STORED, { de: 'Rechnung', fr: 'Facture' })

    expect(payload).toEqual({
      code: 'INVOICE',
      name: 'Rechnung',
      labels: { de: 'Rechnung', fr: 'Facture' },
      shortName: 'RG',
      sortOrder: 200,
      visible: true,
    })
  })

  it('toCataloguePayloadSendsAnEmptyShortNameTest', () => {
    // An empty string removes the short form; leaving the field out would bring the delivered
    // one back, because the endpoint replaces instead of patching.
    const payload = toCataloguePayload({ ...FORM, shortName: '' }, STORED, { de: 'Rechnung' })

    expect(payload.shortName).toBe('')
  })

  it('toCataloguePayloadTrimsTest', () => {
    const payload = toCataloguePayload(
      { ...FORM, name: '  Rechnung  ', shortName: '  RG  ' },
      STORED,
      undefined,
    )

    expect(payload.name).toBe('Rechnung')
    expect(payload.shortName).toBe('RG')
  })

  it('toCataloguePayloadPassesTheLabelsThroughTest', () => {
    // Without a map every stored translation is dropped, which is what an empty set of
    // translation fields means.
    const payload = toCataloguePayload(FORM, STORED, undefined)

    expect(payload.labels).toBeUndefined()
  })

  it('toCataloguePayloadKeepsThePositionOfTheStoredValueTest', () => {
    const payload = toCataloguePayload(FORM, { ...STORED, sortOrder: 700 }, undefined)

    expect(payload.sortOrder).toBe(700)
  })

  it('toCataloguePayloadWithoutAStoredPositionTest', () => {
    const payload = toCataloguePayload(FORM, { code: 'INVOICE', name: 'Rechnung' }, undefined)

    expect(payload.sortOrder).toBeUndefined()
  })

  it('toCataloguePayloadTakesVisibleFromTheFormTest', () => {
    const payload = toCataloguePayload({ ...FORM, visible: false }, STORED, undefined)

    expect(payload.visible).toBe(false)
  })
})

describe('catalogueComplaint', () => {
  it('catalogueComplaintTest', () => {
    expect(catalogueComplaint(FORM)).toBeNull()
  })

  it('catalogueComplaintWithoutTranslationsTest', () => {
    expect(catalogueComplaint({ ...FORM, translations: {} })).toBeNull()
  })

  it('catalogueComplaintWithoutANameTest', () => {
    expect(catalogueComplaint({ ...FORM, name: '' })).toContain('Bezeichnung')
  })

  it('catalogueComplaintWithABlankNameTest', () => {
    expect(catalogueComplaint({ ...FORM, name: '   ' })).toContain('Bezeichnung')
  })

  it('catalogueComplaintWithANameOfExactlySixtyCharactersTest', () => {
    expect(catalogueComplaint({ ...FORM, name: 'x'.repeat(60) })).toBeNull()
  })

  it('catalogueComplaintWithATooLongNameTest', () => {
    expect(catalogueComplaint({ ...FORM, name: 'x'.repeat(61) })).toBe(
      'Die Bezeichnung darf höchstens 60 Zeichen lang sein.',
    )
  })

  it('catalogueComplaintWithAShortNameOfExactlyTenCharactersTest', () => {
    expect(catalogueComplaint({ ...FORM, shortName: 'x'.repeat(10) })).toBeNull()
  })

  it('catalogueComplaintWithATooLongShortNameTest', () => {
    expect(catalogueComplaint({ ...FORM, shortName: 'x'.repeat(11) })).toBe(
      'Die Kurzform darf höchstens 10 Zeichen lang sein.',
    )
  })

  it('catalogueComplaintWithAnEmptyTranslationTest', () => {
    // Empty means "no translation in this language", which the backend allows.
    expect(catalogueComplaint({ ...FORM, translations: { fr: '' } })).toBeNull()
  })

  it('catalogueComplaintWithABlankTranslationTest', () => {
    expect(catalogueComplaint({ ...FORM, translations: { fr: '  ' } })).toContain('Übersetzung')
  })

  it('catalogueComplaintWithATooLongTranslationTest', () => {
    expect(catalogueComplaint({ ...FORM, translations: { fr: 'x'.repeat(61) } })).toBe(
      'Eine Übersetzung darf höchstens 60 Zeichen lang sein.',
    )
  })

  it('catalogueComplaintNamesTheFirstProblemOnlyTest', () => {
    expect(catalogueComplaint({ ...FORM, name: '', shortName: 'x'.repeat(11) })).toContain(
      'Bezeichnung',
    )
  })
})

describe('reorderPayload', () => {
  const FIRST: CatalogueEntry = { code: 'DRAFT', name: 'Entwurf', sortOrder: 100 }
  const SECOND: CatalogueEntry = { code: 'ISSUED', name: 'Ausgestellt', sortOrder: 200 }
  const THIRD: CatalogueEntry = { code: 'CANCELLED', name: 'Storniert', sortOrder: 300 }
  const ROWS = [FIRST, SECOND, THIRD]

  it('reorderPayloadTest', () => {
    const payload = reorderPayload(ROWS, 1, -1)

    expect(payload).toEqual([
      { code: 'ISSUED', name: 'Ausgestellt', sortOrder: 100 },
      { code: 'DRAFT', name: 'Entwurf', sortOrder: 200 },
    ])
  })

  it('reorderPayloadDownwardsTest', () => {
    const payload = reorderPayload(ROWS, 0, 1)

    expect(payload.map((entry) => [entry.code, entry.sortOrder])).toEqual([
      ['DRAFT', 200],
      ['ISSUED', 100],
    ])
  })

  it('reorderPayloadOfTheFirstRowUpwardsTest', () => {
    expect(reorderPayload(ROWS, 0, -1)).toEqual([])
  })

  it('reorderPayloadOfTheLastRowDownwardsTest', () => {
    expect(reorderPayload(ROWS, 2, 1)).toEqual([])
  })

  it('reorderPayloadOfASingleRowTest', () => {
    expect(reorderPayload([FIRST], 0, -1)).toEqual([])
    expect(reorderPayload([FIRST], 0, 1)).toEqual([])
  })

  it('reorderPayloadOfAnEmptyCatalogueTest', () => {
    expect(reorderPayload([], 0, 1)).toEqual([])
  })

  it('reorderPayloadOfAnUnknownRowTest', () => {
    expect(reorderPayload(ROWS, 7, -1)).toEqual([])
    expect(reorderPayload(ROWS, -1, 1)).toEqual([])
  })

  it('reorderPayloadWithoutAStoredPositionTest', () => {
    // A value without a position is counted at the delivered spacing, so the swap still lands
    // the moved row before its neighbour.
    const rows = [FIRST, { code: 'ISSUED', name: 'Ausgestellt' }]

    const payload = reorderPayload(rows, 1, -1)

    expect(payload.map((entry) => [entry.code, entry.sortOrder])).toEqual([
      ['ISSUED', 100],
      ['DRAFT', 200],
    ])
  })

  it('reorderPayloadWithSharedPositionsUpwardsTest', () => {
    // Swapping two equal positions would change nothing, so the moved row steps below.
    const rows = [FIRST, { ...SECOND, sortOrder: 100 }]

    const payload = reorderPayload(rows, 1, -1)

    expect(payload.map((entry) => [entry.code, entry.sortOrder])).toEqual([['ISSUED', 99]])
  })

  it('reorderPayloadWithSharedPositionsDownwardsTest', () => {
    const rows = [FIRST, { ...SECOND, sortOrder: 100 }]

    const payload = reorderPayload(rows, 0, 1)

    expect(payload.map((entry) => [entry.code, entry.sortOrder])).toEqual([['DRAFT', 101]])
  })

  it('reorderPayloadWithSharedPositionsAtZeroTest', () => {
    // A negative position is refused by the backend, so the neighbour moves instead.
    const rows = [
      { ...FIRST, sortOrder: 0 },
      { ...SECOND, sortOrder: 0 },
    ]

    const payload = reorderPayload(rows, 1, -1)

    expect(payload.map((entry) => [entry.code, entry.sortOrder])).toEqual([['DRAFT', 1]])
  })

  it('reorderPayloadKeepsEveryOtherFieldTest', () => {
    // The endpoint replaces what it is given, so a payload without the wording would drop it.
    const rows = [STORED, THIRD]

    const payload = reorderPayload(rows, 0, 1)

    expect(payload[0]).toEqual({ ...STORED, sortOrder: 300 })
    expect(payload[0].labels).toEqual({ de: 'Rechnung', fr: 'Facture' })
  })

  it('reorderPayloadLeavesTheStoredRowsAloneTest', () => {
    reorderPayload(ROWS, 1, -1)

    expect(FIRST.sortOrder).toBe(100)
    expect(SECOND.sortOrder).toBe(200)
  })
})

describe('toCatalogueForm with another default language', () => {
  it('toCatalogueFormShowsTheTextOfTheTenantLanguageTest', () => {
    // Every delivered value carries a German `name`, whichever language the tenant works in.
    // Showing that in the Bezeichnung field would overwrite the French label on the next save.
    const form = toCatalogueForm(
      {
        code: 'ORGANISATION',
        name: 'Firma',
        labels: { de: 'Firma', fr: 'Entreprise', it: 'Azienda', en: 'Company' },
        sortOrder: 100,
        visible: true,
      },
      'fr',
    )

    expect(form.name).toBe('Entreprise')
    expect(form.translations).toEqual({ de: 'Firma', it: 'Azienda', en: 'Company' })
  })

  it('toCatalogueFormFallsBackToTheNameWithoutATranslationTest', () => {
    const form = toCatalogueForm(
      { code: 'ORGANISATION', name: 'Firma', labels: { de: 'Firma' }, sortOrder: 100 },
      'fr',
    )

    expect(form.name).toBe('Firma')
  })
})
