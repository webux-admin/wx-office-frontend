import { describe, expect, it } from 'vitest'
import type { PrintLayoutDefinition } from '../lib/types'
import {
  addChild,
  addElement,
  insertSection,
  newSection,
  removeObjects,
  updateElement,
  updateSection,
} from './definition'
import { element, sampleCatalogue, sampleForm } from './fixtures'
import {
  firstMessageFor,
  hasErrors,
  problemsFor,
  validateDefinition,
  type Problem,
} from './validation'

const CATALOGUE = sampleCatalogue()
const check = (form: PrintLayoutDefinition) => validateDefinition(form, CATALOGUE)
const withPage = (change: Partial<PrintLayoutDefinition['page']>): PrintLayoutDefinition => ({
  ...sampleForm(),
  page: { ...sampleForm().page, ...change },
})

describe('validateDefinition', () => {
  it('validateDefinitionTest', () => {
    // The sample form is what a tenant starts from: nothing to complain about.
    expect(check(sampleForm())).toEqual([])
  })

  it('validateDefinitionOfSideMarginsTest', () => {
    // 90 + 80 leaves 40 mm, and the content needs more than that.
    const problems = check(withPage({ marginLeft: 90, marginRight: 80 }))
    expect(problemsFor(problems, 'page', 'marginLeft')[0]).toMatchObject({
      severity: 'error',
      message:
        'Zwischen den Rändern links und rechts bleiben nur 40 mm; der Inhalt braucht mehr als 40 mm.',
    })
    // One millimetre less margin is enough.
    expect(problemsFor(check(withPage({ marginLeft: 89, marginRight: 80 })), 'page', 'marginLeft')).toEqual(
      [],
    )
  })

  it('validateDefinitionOfTheHeightOnFollowingPagesTest', () => {
    // 297 − 150 − 108 = 39 mm, one too few.
    const problems = check(withPage({ marginTop: 150, marginBottom: 108 }))
    expect(firstMessageFor(problems, 'page', 'marginTop')).toBe(
      'Zwischen den Rändern oben und unten bleiben nur 39 mm; der Inhalt braucht 40 mm.',
    )
    expect(
      firstMessageFor(check(withPage({ marginTop: 150, marginBottom: 107 })), 'page', 'marginTop'),
    ).toBeUndefined()
  })

  it('validateDefinitionOfTheStartOfTheContentTest', () => {
    const form = sampleForm()
    // 297 − 236 − 22 = 39 mm on the first page.
    const tooLow = check({ ...form, flow: { ...form.flow, top: 236 } })
    expect(firstMessageFor(tooLow, 'page', 'flowTop')).toBe(
      'Auf Seite 1 bleiben für den Inhalt nur 39 mm; nötig sind 40 mm. Den Inhalt weiter oben beginnen lassen.',
    )
    expect(firstMessageFor(check({ ...form, flow: { ...form.flow, top: 235 } }), 'page', 'flowTop')).toBeUndefined()
    expect(firstMessageFor(check({ ...form, flow: { ...form.flow, top: -1 } }), 'page', 'flowTop')).toBe(
      'Der Inhalt kann nicht oberhalb des Blatts beginnen.',
    )
  })

  it('validateDefinitionOfNegativeMarginsTest', () => {
    expect(firstMessageFor(check(withPage({ marginBottom: -1 })), 'page', 'marginBottom')).toBe(
      'Der Rand unten darf nicht negativ sein.',
    )
  })

  it('validateDefinitionOfACustomFormatTest', () => {
    const problems = check(withPage({ format: 'CUSTOM', customWidth: 49, customHeight: 451 }))
    expect(firstMessageFor(problems, 'page', 'customWidth')).toBe(
      'Die Breite des eigenen Formats muss zwischen 50 und 450 mm liegen.',
    )
    expect(firstMessageFor(problems, 'page', 'customHeight')).toBe(
      'Die Höhe des eigenen Formats muss zwischen 50 und 450 mm liegen.',
    )
    // The limits themselves are allowed.
    const atLimits = check(withPage({ format: 'CUSTOM', customWidth: 50, customHeight: 450, marginLeft: 0, marginRight: 0 }))
    expect(firstMessageFor(atLimits, 'page', 'customWidth')).toBeUndefined()
    expect(firstMessageFor(atLimits, 'page', 'customHeight')).toBeUndefined()
    // A custom format that names no side yet is refused as well.
    expect(
      firstMessageFor(check(withPage({ format: 'CUSTOM' })), 'page', 'customWidth'),
    ).toBeDefined()
  })

  it('validateDefinitionOfThePaymentPartTest', () => {
    const bottom: PrintLayoutDefinition = { ...sampleForm(), paymentPart: 'LAST_PAGE_BOTTOM' }
    expect(firstMessageFor(check(bottom), 'page', 'paymentPart')).toBeUndefined()

    const landscape = { ...bottom, page: { ...bottom.page, orientation: 'LANDSCAPE' as const } }
    expect(firstMessageFor(check(landscape), 'page', 'paymentPart')).toBe(
      'Der QR-Zahlteil passt nur auf A4 hoch unten auf die letzte Seite (210 mm breit, mindestens 297 mm hoch).',
    )
    // On its own page any paper will do.
    expect(
      firstMessageFor(check({ ...landscape, paymentPart: 'OWN_PAGE' }), 'page', 'paymentPart'),
    ).toBeUndefined()
  })

  it('validateDefinitionOfStylesTest', () => {
    const form = updateElement(sampleForm(), 'e:0', { style: { fontSize: 80, colour: 'rot' } })
    const problems = check(form)
    expect(firstMessageFor(problems, 'e:0', 'fontSize')).toBe(
      'Titel mit Nummer: Die Schriftgrösse muss zwischen 5 und 72 pt liegen.',
    )
    expect(firstMessageFor(problems, 'e:0', 'colour')).toBe(
      'Titel mit Nummer: Die Farbe muss als #rrggbb angegeben sein.',
    )
    // The limits are allowed, and so is a style that names nothing.
    for (const fontSize of [5, 72, null]) {
      const fine = updateElement(sampleForm(), 'e:0', { style: { fontSize } })
      expect(firstMessageFor(check(fine), 'e:0', 'fontSize')).toBeUndefined()
    }
    expect(
      firstMessageFor(check(updateElement(sampleForm(), 'e:0', { style: { fontSize: 4.9 } })), 'e:0', 'fontSize'),
    ).toBeDefined()
  })

  it('validateDefinitionOfALineWidthTest', () => {
    const line = (lineWidth: number) =>
      addElement(sampleForm(), element({ type: 'LINE', text: null, width: null, style: { lineWidth } }))
    expect(firstMessageFor(check(line(6).definition), 'e:4', 'lineWidth')).toBe(
      'Linie: Die Linienstärke muss zwischen 0.1 und 5 pt liegen.',
    )
    expect(firstMessageFor(check(line(5).definition), 'e:4', 'lineWidth')).toBeUndefined()
    expect(firstMessageFor(check(line(0.1).definition), 'e:4', 'lineWidth')).toBeUndefined()
    // A line width on anything but a line is not looked at.
    const text = updateElement(sampleForm(), 'e:0', { style: { lineWidth: 99 } })
    expect(firstMessageFor(check(text), 'e:0', 'lineWidth')).toBeUndefined()
  })

  it('validateDefinitionOfAnElementOffTheSheetTest', () => {
    const form = updateElement(sampleForm(), 'e:1', { x: 180 })
    // 180 + 60 runs over the right edge at 210: the server refuses that.
    expect(problemsFor(check(form), 'e:1')[0]).toMatchObject({
      severity: 'error',
      field: 'width',
      message: 'Belegnummer ragt rechts über das Blatt hinaus (Platz: 210 mm).',
    })
    // Exactly at the edge is fine.
    expect(problemsFor(check(updateElement(sampleForm(), 'e:1', { x: 150 })), 'e:1')).toEqual([])
    // In the margin is fine: that is how a footer is made.
    expect(problemsFor(check(sampleForm()), 'e:3')).toEqual([])
    // A width up to the margin cannot reach too far, wherever the element starts.
    expect(
      problemsFor(check(updateElement(sampleForm(), 'e:1', { x: 205, width: null })), 'e:1'),
    ).toEqual([])
  })

  it('validateDefinitionOfAnElementBelowTheSheetTest', () => {
    // 280 + 20 is below the bottom edge at 297.
    const tall = updateElement(sampleForm(), 'e:3', { height: 20 })
    expect(problemsFor(check(tall), 'e:3')[0]).toMatchObject({
      severity: 'error',
      field: 'height',
      message: 'Text «Muster AG · Bern» ragt unten über das Blatt hinaus (Platz: 297 mm).',
    })
    // A corner off the paper altogether.
    const gone = updateElement(sampleForm(), 'e:3', { y: 300 })
    expect(problemsFor(check(gone), 'e:3')[0]).toMatchObject({
      severity: 'error',
      field: 'position',
      message: 'Text «Muster AG · Bern» liegt ausserhalb: das Blatt misst 210 × 297 mm.',
    })
    expect(problemsFor(check(updateElement(sampleForm(), 'e:3', { x: -1 })), 'e:3')[0].field).toBe(
      'position',
    )
  })

  it('validateDefinitionOfAnElementOutsideItsFreeSectionTest', () => {
    const form = updateElement(sampleForm(), 'c:3:0', { y: 18 })
    // 18 + 5 is below the 20 mm of the section.
    expect(problemsFor(check(form), 'c:3:0')[0]).toMatchObject({
      severity: 'error',
      message: 'Text «Besten Dank» ragt unten über den freien Bereich hinaus (Platz: 20 mm).',
    })
    expect(problemsFor(check(updateElement(sampleForm(), 'c:3:0', { y: 15 })), 'c:3:0')).toEqual([])
  })

  it('validateDefinitionOfAnUnknownFieldTest', () => {
    // The server refuses a field it does not offer, so the designer does not let it be saved.
    const form = addElement(sampleForm(), element({ type: 'FIELD', field: 'gone.field', text: null }))
    expect(problemsFor(check(form.definition), 'e:4')[0]).toMatchObject({
      severity: 'error',
      field: 'content',
      message:
        'Das Feld «gone.field» gibt es nicht mehr. Ein anderes Feld wählen oder das Element löschen.',
    })
    const unbound = addElement(sampleForm(), element({ type: 'FIELD', field: null, text: null }))
    expect(problemsFor(check(unbound.definition), 'e:4')[0].message).toBe(
      'Dieses Feld ist mit keinem Wert verbunden. Ein Feld wählen oder das Element löschen.',
    )
  })

  it('validateDefinitionOfAnImageWithoutAFileTest', () => {
    const form = addElement(sampleForm(), element({ type: 'IMAGE', text: null, height: 20 }))
    expect(problemsFor(check(form.definition), 'e:4')[0]).toMatchObject({
      severity: 'error',
      message: 'Das Bild braucht eine Datei. Ein Bild wählen oder das Element löschen.',
    })
    const withFile = updateElement(form.definition, 'e:4', { image: 'data:image/png;base64,AAAA' })
    expect(problemsFor(check(withFile), 'e:4')).toEqual([])
  })

  it('validateDefinitionOfAFreeSectionHigherThanAPageTest', () => {
    // 297 − 150 − 100 leaves 47 mm between the margins; a free section is never cut in two.
    const form = updateSection(
      { ...sampleForm(), page: { ...sampleForm().page, marginTop: 150, marginBottom: 100 } },
      3,
      { height: 48 },
    )
    expect(firstMessageFor(check(form), 's:3', 'height')).toBe(
      'Freier Bereich ist höher als der Platz zwischen den Rändern einer Seite (47 mm) und wird nicht über zwei Seiten geteilt.',
    )
    expect(
      firstMessageFor(check(updateSection(form, 3, { height: 47 })), 's:3', 'height'),
    ).toBeUndefined()
  })

  it('validateDefinitionOfTheTopMarginWithThePaymentPartBelowTest', () => {
    // The content keeps 107 mm free at the bottom: above 190 mm of top margin nothing is left.
    const bottom: PrintLayoutDefinition = { ...sampleForm(), paymentPart: 'LAST_PAGE_BOTTOM' }
    const high = { ...bottom, page: { ...bottom.page, marginTop: 191 }, flow: { ...bottom.flow, top: 20 } }
    expect(firstMessageFor(check(high), 'page', 'marginTop')).toBe(
      'Mit dem Zahlteil unten auf der letzten Seite darf der Rand oben höchstens 190 mm messen, sonst bleibt darüber kein Platz.',
    )
    const atLimit = { ...high, page: { ...high.page, marginTop: 190 } }
    expect(firstMessageFor(check(atLimit), 'page', 'marginTop')).toBeUndefined()
    // On a page of its own the payment part asks nothing of the margin.
    expect(
      firstMessageFor(check({ ...high, paymentPart: 'OWN_PAGE' }), 'page', 'marginTop'),
    ).toBeUndefined()
  })

  it('validateDefinitionOfASectionTest', () => {
    // 100 + 78 is wider than the 170 mm between the margins.
    const tooWide = updateSection(sampleForm(), 2, { x: 100 })
    expect(firstMessageFor(check(tooWide), 's:2', 'width')).toBe(
      'Totale: Einzug und Breite reichen über den rechten Rand hinaus (Platz: 170 mm).',
    )
    expect(firstMessageFor(check(updateSection(sampleForm(), 2, { x: 92 })), 's:2', 'width')).toBeUndefined()
    // Without an indent the totals stand at the right margin and always fit.
    expect(firstMessageFor(check(updateSection(sampleForm(), 2, { x: null })), 's:2', 'width')).toBeUndefined()
    expect(firstMessageFor(check(updateSection(sampleForm(), 2, { x: -1 })), 's:2', 'position')).toBe(
      'Totale: Der Einzug darf nicht negativ sein.',
    )
  })

  it('validateDefinitionOfASectionWithoutAnyWidthTest', () => {
    // Indented by the whole content width and running «up to the margin»: nothing is left,
    // and the server refuses the form.
    const none = updateSection(sampleForm(), 0, { x: 170 })
    expect(problemsFor(check(none), 's:0', 'width')[0]).toMatchObject({
      severity: 'error',
      message:
        'Belegtext (Kopf) passt nicht zwischen die Ränder: bei einem Einzug von 170 mm bleibt keine Breite (Platz: 170 mm).',
    })
    expect(problemsFor(check(updateSection(sampleForm(), 0, { x: 169 })), 's:0', 'width')).toEqual([])
  })

  it('validateDefinitionOfSpacingAndHeightTest', () => {
    expect(
      firstMessageFor(check(updateSection(sampleForm(), 1, { spaceAfter: 51 })), 's:1', 'spaceAfter'),
    ).toBe('Positionen: Der Abstand danach muss zwischen 0 und 50 mm liegen.')
    expect(
      firstMessageFor(check(updateSection(sampleForm(), 1, { spaceAfter: 50 })), 's:1', 'spaceAfter'),
    ).toBeUndefined()
    expect(firstMessageFor(check(updateSection(sampleForm(), 3, { height: 251 })), 's:3', 'height')).toBe(
      'Freier Bereich: Die Höhe muss zwischen 2 und 250 mm liegen.',
    )
    expect(firstMessageFor(check(updateSection(sampleForm(), 3, { height: 1.9 })), 's:3', 'height')).toBeDefined()
    expect(firstMessageFor(check(updateSection(sampleForm(), 3, { height: 250 })), 's:3', 'height')).toBeUndefined()
  })

  it('validateDefinitionOfColumnsTest', () => {
    const wide = updateSection(sampleForm(), 1, {
      columns: [
        { code: 'description', widthMm: null, label: null, align: null },
        { code: 'lineNet', widthMm: 180, label: null, align: null },
      ],
    })
    // 180 mm of content and 2 mm of padding.
    expect(problemsFor(check(wide), 's:1', 'columns')[0]).toMatchObject({
      severity: 'error',
      message:
        'Die Spalten brauchen 182 mm, Platz ist für 170 mm. Spalten schmaler machen oder ausblenden.',
    })
    // The sum is held against the width of the section, not of the page: the default columns
    // need 134 mm and 22 for the description, which a table of 150 mm does not have.
    const narrow = updateSection(sampleForm(), 1, { width: 150 })
    expect(problemsFor(check(narrow), 's:1', 'columns')[0]).toMatchObject({ severity: 'error' })
    expect(problemsFor(check(updateSection(sampleForm(), 1, { width: 156 })), 's:1', 'columns')).toEqual(
      [],
    )
    // Two filling columns still print, badly: a remark, not a refusal.
    const two = updateSection(sampleForm(), 1, {
      columns: [
        { code: 'description', widthMm: null, label: null, align: null },
        { code: 'lineNet', widthMm: 0, label: null, align: null },
      ],
    })
    expect(problemsFor(check(two), 's:1', 'columns')[0]).toMatchObject({ severity: 'warning' })
    // And wider than the content altogether, which the server refuses outright.
    expect(problemsFor(check(wide), 's:1', 'content')[0]).toMatchObject({
      severity: 'error',
      message: 'Die Spalte «lineNet» ist breiter als der Inhalt (170 mm).',
    })
    const unknown = updateSection(sampleForm(), 1, {
      columns: [
        { code: 'description', widthMm: null, label: null, align: null },
        { code: 'gone', widthMm: null, label: null, align: null },
      ],
    })
    expect(problemsFor(check(unknown), 's:1', 'content')[0]).toMatchObject({
      severity: 'error',
      message: 'Die Spalte «gone» gibt es nicht mehr. Bitte in der Spaltenliste abwählen.',
    })
  })

  it('validateDefinitionOfTheWidthOfTheTotalsTest', () => {
    // Below 60 mm a label and an amount no longer fit side by side.
    const thin = updateSection(sampleForm(), 2, { x: 0, width: 59 })
    expect(firstMessageFor(check(thin), 's:2', 'width')).toBe(
      'Totale: Die Breite muss mindestens 60 mm sein, sonst haben die Beträge keinen Platz.',
    )
    expect(
      firstMessageFor(check(updateSection(sampleForm(), 2, { x: 0, width: 60 })), 's:2', 'width'),
    ).toBeUndefined()
    // A bigger font needs more room: 60 mm at 9 pt is 80 mm at 12 pt.
    const big = updateSection(sampleForm(), 2, {
      x: 0,
      width: 78,
      style: { fontSize: 12 },
    })
    expect(firstMessageFor(check(big), 's:2', 'width')).toBe(
      'Totale: Die Breite muss mindestens 80 mm sein, sonst haben die Beträge keinen Platz.',
    )
    // Other sections may be narrower.
    expect(
      firstMessageFor(check(updateSection(sampleForm(), 0, { width: 30 })), 's:0', 'width'),
    ).toBeUndefined()
  })

  it('validateDefinitionOfASecondTotalsSectionTest', () => {
    const twice = insertSection(sampleForm(), newSection('TOTALS'), 4)
    // The second one is the one to remove; the first is left alone.
    expect(problemsFor(check(twice.definition), 's:4')[0]).toMatchObject({
      severity: 'error',
      message: 'Totale gibt es nur einmal pro Vorlage. Einen der beiden Abschnitte löschen.',
    })
    expect(problemsFor(check(twice.definition), 's:2')).toEqual([])
    // Of the VAT summary there may be several.
    const vat = insertSection(
      insertSection(sampleForm(), newSection('VAT_SUMMARY'), 4).definition,
      newSection('VAT_SUMMARY'),
      5,
    )
    expect(hasErrors(check(vat.definition))).toBe(false)
  })

  it('validateDefinitionOfTheCapsTest', () => {
    const many = (count: number) => Array.from({ length: count }, () => element({ x: 20, y: 20 }))
    const full: PrintLayoutDefinition = { ...sampleForm(), elements: many(200) }
    expect(hasErrors(check(full))).toBe(false)
    expect(problemsFor(check({ ...full, elements: many(201) }), 'page')[0].message).toBe(
      'Eine Vorlage fasst höchstens 200 feste Elemente; hier sind es 201.',
    )

    const images = (count: number) =>
      Array.from({ length: count }, () =>
        element({ type: 'IMAGE', text: null, height: 10, image: 'data:image/png;base64,AAAA' }),
      )
    expect(hasErrors(check({ ...sampleForm(), elements: images(10) }))).toBe(false)
    expect(problemsFor(check({ ...sampleForm(), elements: images(11) }), 'page')[0].message).toBe(
      'Eine Vorlage fasst höchstens 10 Bilder; hier sind es 11.',
    )

    const sections = Array.from({ length: 51 }, () => newSection('FREE'))
    const long = { ...sampleForm(), flow: { top: 103, sections: [newSection('POSITIONS'), ...sections.slice(1)] } }
    expect(problemsFor(check(long), 'page')[0].message).toBe(
      'Der Inhalt fasst höchstens 50 Abschnitte; hier sind es 51.',
    )

    const crowded = sampleForm()
    const free = crowded.flow.sections[3]
    if (free.type !== 'FREE') throw new Error('the fixture changed')
    free.elements = Array.from({ length: 51 }, () => ({ ...free.elements[0] }))
    expect(problemsFor(check(crowded), 's:3')[0].message).toBe(
      'Ein freier Bereich fasst höchstens 50 Elemente; hier sind es 51.',
    )
  })

  it('validateDefinitionOfLongTextsTest', () => {
    const long = updateElement(sampleForm(), 'e:3', { text: 'x'.repeat(2001) })
    expect(firstMessageFor(check(long), 'e:3', 'content')).toContain(
      'Der Text darf höchstens 2000 Zeichen lang sein.',
    )
    expect(
      firstMessageFor(check(updateElement(sampleForm(), 'e:3', { text: 'x'.repeat(2000) })), 'e:3', 'content'),
    ).toBeUndefined()
    const heading = updateSection(sampleForm(), 1, {
      columns: [
        { code: 'description', widthMm: null, label: null, align: null },
        { code: 'lineNet', widthMm: null, label: 'y'.repeat(61), align: null },
      ],
    })
    expect(firstMessageFor(check(heading), 's:1', 'content')).toBe(
      'Die Überschrift der Spalte «lineNet» darf höchstens 60 Zeichen lang sein.',
    )
  })

  it('validateDefinitionOfTheUidUnderThePaymentPartTest', () => {
    // The only element that prints the UID repeats on every page and stands in the bottom
    // 105 mm: on a one-page invoice it gives way to the payment part, and the UID is gone.
    const footer = element({
      type: 'FIELD',
      repeat: 'EVERY_PAGE',
      field: 'issuer.senderLine',
      text: null,
      x: 20,
      y: 280,
      width: 120,
    })
    const form: PrintLayoutDefinition = {
      ...sampleForm(),
      paymentPart: 'LAST_PAGE_BOTTOM',
      elements: [...sampleForm().elements, footer],
    }
    const problems = check(form)
    expect(firstMessageFor(problems, 'page', 'paymentPart')).toContain(
      'Mit dem Zahlteil unten fehlt auf einer einseitigen Rechnung die UID',
    )
    expect(problemsFor(problems, 'e:4', 'position')[0]).toMatchObject({ severity: 'error' })

    // Printed once more above the strip, or on its own page, there is nothing to refuse.
    const above = { ...form, elements: [...form.elements, { ...footer, field: 'issuer.uid', y: 30 }] }
    expect(firstMessageFor(check(above), 'page', 'paymentPart')).toBeUndefined()
    expect(firstMessageFor(check({ ...form, paymentPart: 'OWN_PAGE' }), 'page', 'paymentPart')).toBeUndefined()
    // «Nur Seite 1» does not help: on a one-page invoice the first page is the last. A form
    // that prints no UID at all is not this rule's business.
    const firstPage = { ...form, elements: [...sampleForm().elements, { ...footer, repeat: 'FIRST_PAGE' as const }] }
    expect(firstMessageFor(check(firstPage), 'page', 'paymentPart')).toBeDefined()
    expect(
      firstMessageFor(check({ ...form, elements: sampleForm().elements }), 'page', 'paymentPart'),
    ).toBeUndefined()
    // Just above the strip is fine: 297 − 105 = 192, and a line of 9 pt is 3.81 mm high.
    const justAbove = { ...form, elements: [...sampleForm().elements, { ...footer, y: 188 }] }
    expect(firstMessageFor(check(justAbove), 'page', 'paymentPart')).toBeUndefined()
    const justInside = { ...form, elements: [...sampleForm().elements, { ...footer, y: 188.5 }] }
    expect(firstMessageFor(check(justInside), 'page', 'paymentPart')).toBeDefined()
  })

  it('validateDefinitionWithoutPositionsTest', () => {
    const problems = check(removeObjects(sampleForm(), ['s:1']))
    expect(problems).toEqual([
      {
        severity: 'warning',
        target: 'page',
        message: 'Im Inhalt fehlen die Positionen: der Beleg druckt keine Zeilen.',
      },
    ])
  })

  it('validateDefinitionChecksElementsInFreeSectionsTest', () => {
    const form = addChild(sampleForm(), 3, element({ style: { fontSize: 100 } }))
    expect(firstMessageFor(check(form!.definition), 'c:3:1', 'fontSize')).toBeDefined()
  })
})

describe('hasErrors', () => {
  const warning: Problem = { severity: 'warning', target: 'page', message: 'w' }
  const error: Problem = { severity: 'error', target: 'page', message: 'e' }

  it('hasErrorsTest', () => {
    expect(hasErrors([warning, error])).toBe(true)
  })

  it('hasErrorsWithWarningsOnlyTest', () => {
    expect(hasErrors([warning])).toBe(false)
    expect(hasErrors([])).toBe(false)
  })
})

describe('problemsFor', () => {
  const problems: Problem[] = [
    { severity: 'warning', target: 'e:1', field: 'position', message: 'steht draussen' },
    { severity: 'error', target: 'e:1', field: 'fontSize', message: 'zu gross' },
    { severity: 'error', target: 'page', field: 'flowTop', message: 'zu tief' },
  ]

  it('problemsForTest', () => {
    // Errors first, whatever order they were found in.
    expect(problemsFor(problems, 'e:1').map((problem) => problem.message)).toEqual([
      'zu gross',
      'steht draussen',
    ])
  })

  it('problemsForOneFieldTest', () => {
    expect(problemsFor(problems, 'e:1', 'position')).toHaveLength(1)
    expect(problemsFor(problems, 'page', 'flowTop')[0].message).toBe('zu tief')
  })

  it('problemsForSomethingWithoutProblemsTest', () => {
    expect(problemsFor(problems, 'e:2')).toEqual([])
    expect(problemsFor(problems, 'e:1', 'width')).toEqual([])
    expect(problemsFor([], 'page')).toEqual([])
  })
})

describe('firstMessageFor', () => {
  const problems: Problem[] = [
    { severity: 'warning', target: 'e:1', field: 'position', message: 'steht draussen' },
    { severity: 'error', target: 'e:1', field: 'position', message: 'gar nicht da' },
  ]

  it('firstMessageForTest', () => {
    expect(firstMessageFor(problems, 'e:1', 'position')).toBe('gar nicht da')
  })

  it('firstMessageForAFieldWithoutProblemsTest', () => {
    expect(firstMessageFor(problems, 'e:1', 'width')).toBeUndefined()
    expect(firstMessageFor([], 'page', 'flowTop')).toBeUndefined()
  })
})
