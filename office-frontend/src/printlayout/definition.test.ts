import { describe, expect, it } from 'vitest'
import type { FreeSection, LayoutSection, PositionsSection } from '../lib/types'
import {
  addChild,
  addElement,
  childKey,
  containerOf,
  DEFAULT_FLOW_TOP,
  DEFAULT_PAGE,
  defaultElementPosition,
  defaultSectionIndex,
  duplicateObject,
  elementAt,
  elementKey,
  elementRectOf,
  emptyDefinition,
  EMPTY_STYLE,
  estimatedHeightOf,
  totalsMinWidthOf,
  freeContentHeightOf,
  freeSectionAt,
  insertSection,
  isVerticalLine,
  keyOf,
  lineBoxFor,
  maxIndentOf,
  moveChildToPage,
  moveElement,
  moveSection,
  newElement,
  newSection,
  normalizeDefinition,
  objectExists,
  printsOn,
  readingOrder,
  refOf,
  removeObjects,
  repeatOf,
  resizeElement,
  sectionAt,
  sectionKey,
  sectionOffsetOf,
  sectionWidthOf,
  setFlowTop,
  setPage,
  updateElement,
  updateSection,
} from './definition'
import { element, sampleForm } from './fixtures'

describe('keys', () => {
  it('elementKeyTest', () => {
    expect(elementKey(3)).toBe('e:3')
  })

  it('sectionKeyTest', () => {
    expect(sectionKey(0)).toBe('s:0')
  })

  it('childKeyTest', () => {
    expect(childKey(2, 1)).toBe('c:2:1')
  })

  it('keyOfTest', () => {
    expect(keyOf({ kind: 'element', index: 3 })).toBe('e:3')
    expect(keyOf({ kind: 'section', index: 1 })).toBe('s:1')
    expect(keyOf({ kind: 'child', section: 2, index: 0 })).toBe('c:2:0')
  })
})

describe('refOf', () => {
  it('refOfTest', () => {
    expect(refOf('e:3')).toEqual({ kind: 'element', index: 3 })
    expect(refOf('s:1')).toEqual({ kind: 'section', index: 1 })
    expect(refOf('c:2:0')).toEqual({ kind: 'child', section: 2, index: 0 })
  })

  it('refOfIsTheInverseOfKeyOfTest', () => {
    const ref = { kind: 'child', section: 4, index: 7 } as const
    expect(refOf(keyOf(ref))).toEqual(ref)
  })

  it('refOfWithSomethingElseTest', () => {
    expect(refOf('')).toBeNull()
    expect(refOf('x:1')).toBeNull()
    expect(refOf('e:-1')).toBeNull()
    expect(refOf('e:1.5')).toBeNull()
    expect(refOf('e:1:2')).toBeNull()
    expect(refOf('c:1')).toBeNull()
    expect(refOf('e:abc')).toBeNull()
  })
})

describe('lookups', () => {
  it('freeSectionAtTest', () => {
    expect(freeSectionAt(sampleForm(), 3)?.elements).toHaveLength(1)
  })

  it('freeSectionAtAnotherKindTest', () => {
    expect(freeSectionAt(sampleForm(), 1)).toBeUndefined()
    expect(freeSectionAt(sampleForm(), 99)).toBeUndefined()
  })

  it('elementAtTest', () => {
    expect(elementAt(sampleForm(), 'e:1')?.field).toBe('document.number')
    expect(elementAt(sampleForm(), { kind: 'child', section: 3, index: 0 })?.text).toBe(
      'Besten Dank',
    )
  })

  it('elementAtNothingTest', () => {
    expect(elementAt(sampleForm(), 'e:99')).toBeUndefined()
    expect(elementAt(sampleForm(), 's:1')).toBeUndefined()
    expect(elementAt(sampleForm(), 'c:1:0')).toBeUndefined()
    expect(elementAt(sampleForm(), 'unsinn')).toBeUndefined()
  })

  it('sectionAtTest', () => {
    expect(sectionAt(sampleForm(), 's:2')?.type).toBe('TOTALS')
  })

  it('sectionAtNothingTest', () => {
    expect(sectionAt(sampleForm(), 's:99')).toBeUndefined()
    expect(sectionAt(sampleForm(), 'e:0')).toBeUndefined()
  })

  it('objectExistsTest', () => {
    expect(objectExists(sampleForm(), 'e:0')).toBe(true)
    expect(objectExists(sampleForm(), 's:3')).toBe(true)
    expect(objectExists(sampleForm(), 'c:3:0')).toBe(true)
  })

  it('objectExistsForGoneThingsTest', () => {
    expect(objectExists(sampleForm(), 'e:4')).toBe(false)
    expect(objectExists(sampleForm(), 'c:3:1')).toBe(false)
    expect(objectExists(sampleForm(), '')).toBe(false)
  })
})

describe('readingOrder', () => {
  it('readingOrderTest', () => {
    // Above the content by height, then the content with what it holds, then the footer.
    expect(readingOrder(sampleForm())).toEqual([
      'e:2',
      'e:1',
      'e:0',
      's:0',
      's:1',
      's:2',
      's:3',
      'c:3:0',
      'e:3',
    ])
  })

  it('readingOrderOnAFollowingPageTest', () => {
    // Only what repeats is on a following page.
    expect(readingOrder(sampleForm(), 'following')).toEqual(['e:3'])
  })

  it('readingOrderOfAnEmptyFormTest', () => {
    expect(readingOrder(emptyDefinition())).toEqual([])
  })

  it('readingOrderOnTheSameLineTest', () => {
    const form = {
      ...emptyDefinition(),
      elements: [element({ x: 100, y: 10 }), element({ x: 20, y: 10 })],
    }
    expect(readingOrder(form)).toEqual(['e:1', 'e:0'])
  })
})

describe('emptyDefinition', () => {
  it('emptyDefinitionTest', () => {
    expect(emptyDefinition()).toEqual({
      version: 2,
      page: DEFAULT_PAGE,
      paymentPart: 'OWN_PAGE',
      elements: [],
      flow: { top: DEFAULT_FLOW_TOP, sections: [] },
    })
  })

  it('emptyDefinitionGivesFreshObjectsTest', () => {
    expect(emptyDefinition().page).not.toBe(emptyDefinition().page)
  })
})

describe('normalizeDefinition', () => {
  it('normalizeDefinitionTest', () => {
    // A complete form comes back as it went in.
    expect(normalizeDefinition(sampleForm())).toEqual(sampleForm())
  })

  it('normalizeDefinitionFillsWhatIsMissingTest', () => {
    const form = normalizeDefinition({
      version: 2,
      page: { format: 'A5' },
      elements: [{ type: 'TEXT', text: 'Hallo', x: 5, y: 6, style: { bold: true } }],
      flow: { sections: [{ type: 'TOTALS', style: {} }, { type: 'POSITIONS' }, { type: 'FREE' }] },
    })

    expect(form.page).toEqual({ ...DEFAULT_PAGE, format: 'A5' })
    expect(form.paymentPart).toBe('OWN_PAGE')
    expect(form.elements[0]).toEqual({
      type: 'TEXT',
      repeat: 'FIRST_PAGE',
      field: null,
      text: 'Hallo',
      image: null,
      x: 5,
      y: 6,
      width: null,
      height: null,
      style: { ...EMPTY_STYLE, bold: true },
    })
    expect(form.flow.top).toBe(DEFAULT_FLOW_TOP)
    expect(form.flow.sections).toEqual([
      { type: 'TOTALS', x: null, width: null, spaceAfter: 4, style: EMPTY_STYLE },
      {
        type: 'POSITIONS',
        x: null,
        width: null,
        spaceAfter: 4,
        style: EMPTY_STYLE,
        columns: [],
        showHeader: true,
        rowLines: true,
      },
      { type: 'FREE', height: 20, spaceAfter: 4, style: EMPTY_STYLE, elements: [] },
    ])
  })

  it('normalizeDefinitionDropsWhatItDoesNotKnowTest', () => {
    const form = normalizeDefinition({
      page: { format: 'B5', orientation: 'SIDEWAYS' },
      paymentPart: 'SOMEWHERE',
      elements: [{ type: 'BARCODE' }, null, 'text', { type: 'LINE' }],
      flow: {
        sections: [
          { type: 'CHART' },
          {
            type: 'FREE',
            height: 30,
            // A page number counts pages; in the content it has nothing to count.
            elements: [{ type: 'PAGE_NUMBER' }, { type: 'TEXT', repeat: 'EVERY_PAGE' }],
          },
          { type: 'POSITIONS', columns: [{ code: '' }, { widthMm: 5 }, { code: 'unit', align: 'up' }] },
        ],
      },
    })

    expect(form.page.format).toBe('A4')
    expect(form.page.orientation).toBe('PORTRAIT')
    expect(form.paymentPart).toBe('OWN_PAGE')
    expect(form.elements.map((entry) => entry.type)).toEqual(['LINE'])
    expect(form.flow.sections.map((section) => section.type)).toEqual(['FREE', 'POSITIONS'])
    const free = form.flow.sections[0] as FreeSection
    expect(free.elements).toHaveLength(1)
    // Inside the content an element carries no `repeat`.
    expect('repeat' in free.elements[0]).toBe(false)
    const positions = form.flow.sections[1] as PositionsSection
    expect(positions.columns).toEqual([{ code: 'unit', widthMm: null, label: null, align: null }])
  })

  it('normalizeDefinitionKeepsAPageNumberOnEveryPageTest', () => {
    const form = normalizeDefinition({ elements: [{ type: 'PAGE_NUMBER', repeat: 'FIRST_PAGE' }] })
    expect(form.elements[0].repeat).toBe('EVERY_PAGE')
  })

  it('normalizeDefinitionOfACustomFormatTest', () => {
    const custom = normalizeDefinition({
      page: { format: 'CUSTOM', customWidth: 100, customHeight: 150 },
    })
    expect(custom.page.customWidth).toBe(100)
    // The sides of a custom format are dropped on a named one, where they mean nothing.
    const named = normalizeDefinition({ page: { format: 'A4', customWidth: 100 } })
    expect(named.page.customWidth).toBeNull()
  })

  it('normalizeDefinitionOfTheWireShapeTest', () => {
    // What the server really answers: nothing that is null, an empty `columns` and `elements`
    // on every section, a standing line with a width of zero, totals without an indent.
    const form = normalizeDefinition({
      version: 2,
      page: { format: 'A5', orientation: 'LANDSCAPE', marginTop: 20, marginRight: 12, marginBottom: 12, marginLeft: 12 },
      paymentPart: 'OWN_PAGE',
      elements: [
        { type: 'LINE', repeat: 'EVERY_PAGE', x: 6, y: 20, width: 0, height: 120, style: { bold: false, italic: false, lineWidth: 0.8 } },
        { type: 'PAGE_NUMBER', x: 150, y: 140, width: 48, style: { bold: false, italic: false } },
        { type: 'ADDRESS', repeat: 'FIRST_PAGE', x: 12, y: 20, style: { bold: false, italic: false } },
      ],
      flow: {
        top: 46,
        sections: [
          { type: 'FREE', height: 22, spaceAfter: 2, style: { bold: false, italic: false }, columns: [], elements: [{ type: 'LINE', x: 0, y: 18, width: 70, style: {} }] },
          { type: 'TOTALS', width: 70, spaceAfter: 4, style: { bold: false, italic: false }, columns: [], elements: [] },
          { type: 'POSITIONS', x: 0, spaceAfter: 3, style: {}, columns: [{ code: 'position', widthMm: 8, align: 'center' }, { code: 'description' }], showHeader: true, rowLines: false, elements: [] },
        ],
      },
    })

    // A width of zero is a width: the line stands.
    expect(form.elements[0]).toMatchObject({ width: 0, height: 120, repeat: 'EVERY_PAGE' })
    expect(isVerticalLine(form.elements[0])).toBe(true)
    expect(form.elements[1].repeat).toBe('EVERY_PAGE')
    // An address without a party is the recipient's, which is what the server accepts.
    expect(form.elements[2]).toMatchObject({ field: 'recipient', width: null, height: null })
    // The lists every section carries are kept only where they mean something.
    expect(form.flow.sections[0]).toEqual({
      type: 'FREE',
      height: 22,
      spaceAfter: 2,
      style: EMPTY_STYLE,
      elements: [expect.objectContaining({ type: 'LINE', width: 70, height: null })],
    })
    expect(form.flow.sections[1]).toEqual({
      type: 'TOTALS',
      x: null,
      width: 70,
      spaceAfter: 4,
      style: EMPTY_STYLE,
    })
    expect(form.flow.sections[2]).toMatchObject({
      x: 0,
      rowLines: false,
      columns: [
        { code: 'position', widthMm: 8, label: null, align: 'center' },
        { code: 'description', widthMm: null, label: null, align: null },
      ],
    })
    // Reading the result again changes nothing: «ungespeichert» depends on that.
    expect(normalizeDefinition(form)).toEqual(form)
  })

  it('normalizeDefinitionKeepsTheStyleOfAFreeSectionTest', () => {
    // The renderer writes it onto the box and the elements inside inherit it. The designer
    // has no setting for it, so it must survive being opened and saved.
    const form = normalizeDefinition({
      flow: {
        sections: [
          {
            type: 'FREE',
            height: 30,
            style: { fontSize: 7.5, bold: false, italic: true, colour: '#555555' },
            elements: [],
          },
        ],
      },
    })
    expect(form.flow.sections[0]).toMatchObject({
      type: 'FREE',
      style: { fontSize: 7.5, bold: false, italic: true, align: null, colour: '#555555', lineWidth: null },
    })
    expect(normalizeDefinition(form)).toEqual(form)
  })

  it('normalizeDefinitionWithNothingTest', () => {
    expect(normalizeDefinition(undefined)).toEqual(emptyDefinition())
    expect(normalizeDefinition(null)).toEqual(emptyDefinition())
    expect(normalizeDefinition('kaputt')).toEqual(emptyDefinition())
    expect(normalizeDefinition([])).toEqual(emptyDefinition())
  })

  it('normalizeDefinitionOfAVersionOneFormTest', () => {
    // The backend upgrades old forms before they arrive; should one slip through, the
    // designer opens on an empty sheet rather than crashing on `header` and `body`.
    const form = normalizeDefinition({ page: { marginTop: 10 }, header: [], body: [], footer: [] })
    expect(form.elements).toEqual([])
    expect(form.flow.sections).toEqual([])
    expect(form.page.marginTop).toBe(10)
  })
})

describe('sizes', () => {
  it('containerOfTest', () => {
    expect(containerOf(sampleForm(), { kind: 'element', index: 0 })).toEqual({
      frame: { x: 0, y: 0, width: 210, height: 297 },
      rightLimit: 190,
    })
  })

  it('containerOfAChildTest', () => {
    expect(containerOf(sampleForm(), { kind: 'child', section: 3, index: 0 })).toEqual({
      frame: { x: 0, y: 0, width: 170, height: 20 },
      rightLimit: 170,
    })
  })

  it('isVerticalLineTest', () => {
    expect(isVerticalLine(element({ type: 'LINE', width: 1, height: 50 }))).toBe(true)
    expect(isVerticalLine(element({ type: 'LINE', width: 50, height: 1 }))).toBe(false)
  })

  it('isVerticalLineWithOpenSidesTest', () => {
    // The rule of the renderer, `liesFlat()`: lying without a height, or with a width that
    // is at least the height.
    expect(isVerticalLine(element({ type: 'LINE', width: 1, height: null }))).toBe(false)
    expect(isVerticalLine(element({ type: 'LINE', width: null, height: null }))).toBe(false)
    expect(isVerticalLine(element({ type: 'LINE', width: 10, height: 10 }))).toBe(false)
    // A height and no width at all is a standing line: «up to the margin» is not a number
    // the renderer compares.
    expect(isVerticalLine(element({ type: 'LINE', width: null, height: 50 }))).toBe(true)
    expect(isVerticalLine(element({ type: 'LINE', width: 0, height: 120 }))).toBe(true)
    expect(isVerticalLine(element({ type: 'LINE', width: 9.99, height: 10 }))).toBe(true)
  })

  it('elementRectOfAStandingLineTest', () => {
    // Drawn as a box without width, whatever width the form stored — or did not store.
    const container = containerOf(sampleForm(), { kind: 'element', index: 0 })
    expect(
      elementRectOf(element({ type: 'LINE', x: 6, y: 20, width: null, height: 120 }), container),
    ).toEqual({ x: 6, y: 20, width: 0, height: 120 })
    expect(
      elementRectOf(element({ type: 'LINE', x: 6, y: 20, width: 1, height: 120 }), container).width,
    ).toBe(0)
    // A lying line keeps its width, or runs up to the margin.
    expect(
      elementRectOf(element({ type: 'LINE', x: 20, y: 20, width: null, height: null }), container)
        .width,
    ).toBe(170)
  })

  it('totalsMinWidthOfTest', () => {
    // 60 mm at the usual 9 pt, and in proportion to the font.
    expect(totalsMinWidthOf(12)).toBe(80)
  })

  it('totalsMinWidthOfWithoutAFontSizeTest', () => {
    expect(totalsMinWidthOf(null)).toBe(60)
    expect(totalsMinWidthOf(undefined)).toBe(60)
    expect(totalsMinWidthOf(9)).toBe(60)
  })

  it('totalsMinWidthOfAtTheLimitsTest', () => {
    // The smallest and the largest font a section may carry.
    expect(totalsMinWidthOf(5)).toBe(33.33)
    expect(totalsMinWidthOf(72)).toBe(480)
  })

  it('estimatedHeightOfTest', () => {
    // One line of 9 pt at 1.2 line height: 3.81 mm.
    expect(estimatedHeightOf(element())).toBe(3.81)
    expect(estimatedHeightOf(element({ text: 'eins\nzwei\ndrei' }))).toBe(11.43)
  })

  it('estimatedHeightOfByKindTest', () => {
    expect(estimatedHeightOf(element({ height: 12 }))).toBe(12)
    expect(estimatedHeightOf(element({ type: 'IMAGE' }))).toBe(20)
    expect(estimatedHeightOf(element({ type: 'ADDRESS' }))).toBe(15.24)
    expect(estimatedHeightOf(element({ type: 'LINE', style: { lineWidth: 2 } }))).toBeCloseTo(
      0.7056,
      3,
    )
    expect(estimatedHeightOf(element({ style: { fontSize: 18 } }), 2)).toBe(15.24)
  })

  it('estimatedHeightOfTinyTextTest', () => {
    // Never below what a pointer can still grab.
    expect(estimatedHeightOf(element({ style: { fontSize: 5 } }))).toBe(2.12)
    expect(estimatedHeightOf(element({ text: null, style: { fontSize: 1 } }))).toBe(2)
  })

  it('elementRectOfTest', () => {
    const container = containerOf(sampleForm(), { kind: 'element', index: 0 })
    expect(elementRectOf(element({ x: 20, y: 30, width: 60, height: 10 }), container)).toEqual({
      x: 20,
      y: 30,
      width: 60,
      height: 10,
    })
  })

  it('elementRectOfWithOpenSidesTest', () => {
    const container = containerOf(sampleForm(), { kind: 'element', index: 0 })
    // No width runs up to the right margin at 190; no height takes what was measured.
    expect(elementRectOf(element({ x: 20, width: null }), container, 7.5)).toMatchObject({
      width: 170,
      height: 7.5,
    })
    expect(elementRectOf(element({ x: 20, width: null }), container).height).toBe(3.81)
    expect(elementRectOf(element({ x: 20, width: null }), container, 0).height).toBe(3.81)
  })

  it('elementRectOfInTheRightMarginTest', () => {
    // Standing in the margin there is no margin left to run up to: the edge of the paper is.
    const container = containerOf(sampleForm(), { kind: 'element', index: 0 })
    expect(elementRectOf(element({ x: 195, width: null }), container).width).toBe(15)
    expect(elementRectOf(element({ x: 209.5, width: null }), container).width).toBe(2)
  })

  it('sectionWidthOfTest', () => {
    const form = sampleForm()
    expect(sectionWidthOf(form.flow.sections[2] as PositionsSection, 170)).toBe(78)
    expect(sectionWidthOf(form.flow.sections[1] as PositionsSection, 170)).toBe(170)
  })

  it('sectionWidthOfWithoutAWidthTest', () => {
    expect(sectionWidthOf({ ...(newSection('POSITIONS') as PositionsSection), x: 30 }, 170)).toBe(
      140,
    )
    // Totals without a width are 78 mm, wherever they stand.
    expect(
      sectionWidthOf({ type: 'TOTALS', x: 0, width: null, spaceAfter: 4, style: {} }, 170),
    ).toBe(78)
    expect(
      sectionWidthOf({ ...(newSection('POSITIONS') as PositionsSection), x: 500 }, 170),
    ).toBe(0)
  })

  it('maxIndentOfTest', () => {
    const form = sampleForm()
    // Totals 78 mm wide may move until their right edge meets the margin.
    expect(maxIndentOf(form.flow.sections[2] as PositionsSection, 170)).toBe(92)
  })

  it('maxIndentOfAnOpenSectionTest', () => {
    // One that runs up to the margin only gets narrower, down to 20 mm.
    const form = sampleForm()
    expect(maxIndentOf(form.flow.sections[1] as PositionsSection, 170)).toBe(150)
    expect(maxIndentOf(form.flow.sections[1] as PositionsSection, 10)).toBe(0)
  })

  it('freeContentHeightOfTest', () => {
    // The child stands at 5 and is 5 high.
    expect(freeContentHeightOf(sampleForm().flow.sections[3] as FreeSection)).toBe(10)
  })

  it('freeContentHeightOfAnEmptySectionTest', () => {
    expect(
      freeContentHeightOf({ type: 'FREE', height: 20, spaceAfter: 0, style: {}, elements: [] }),
    ).toBe(2)
  })

  it('lineBoxForTest', () => {
    expect(lineBoxFor(false, 120)).toEqual({ width: 120, height: null })
    // A standing line has no width: it runs down the left edge of its box.
    expect(lineBoxFor(true, 50)).toEqual({ width: 0, height: 50 })
  })

  it('lineBoxForEdgeCasesTest', () => {
    expect(lineBoxFor(false, null)).toEqual({ width: null, height: null })
    // A vertical line without a length gets one; a very short one stays higher than wide.
    expect(lineBoxFor(true, null)).toEqual({ width: 0, height: 20 })
    expect(lineBoxFor(true, 1)).toEqual({ width: 0, height: 2 })
    expect(isVerticalLine(element({ type: 'LINE', ...lineBoxFor(true, 1.5) }))).toBe(true)
  })
})

describe('new things', () => {
  it('repeatOfTest', () => {
    expect(repeatOf(element({ repeat: 'EVERY_PAGE' }))).toBe('EVERY_PAGE')
    expect(repeatOf(element())).toBe('FIRST_PAGE')
  })

  it('repeatOfAPageNumberTest', () => {
    expect(repeatOf(element({ type: 'PAGE_NUMBER', repeat: 'FIRST_PAGE' }))).toBe('EVERY_PAGE')
    expect(repeatOf({ ...element(), repeat: undefined })).toBe('FIRST_PAGE')
  })

  it('printsOnTest', () => {
    expect(printsOn(element(), 'first')).toBe(true)
    expect(printsOn(element({ repeat: 'EVERY_PAGE' }), 'following')).toBe(true)
  })

  it('printsOnAFollowingPageTest', () => {
    expect(printsOn(element(), 'following')).toBe(false)
    expect(printsOn(element({ type: 'PAGE_NUMBER' }), 'following')).toBe(true)
  })

  it('newElementTest', () => {
    expect(newElement('FIELD', 'document.number')).toMatchObject({
      type: 'FIELD',
      repeat: 'FIRST_PAGE',
      field: 'document.number',
      width: 60,
      height: null,
    })
  })

  it('newElementOfEveryKindTest', () => {
    expect(newElement('TEXT').text).toBe('Text')
    expect(newElement('IMAGE')).toMatchObject({ width: 40, height: 20, image: null })
    expect(newElement('LINE')).toMatchObject({ width: null, height: null })
    expect(newElement('ADDRESS')).toMatchObject({ field: 'recipient', width: 85, height: 35 })
    expect(newElement('ADDRESS', 'issuer').field).toBe('issuer')
    expect(newElement('PAGE_NUMBER')).toMatchObject({ repeat: 'EVERY_PAGE' })
    expect(newElement('PAGE_NUMBER').style.align).toBe('right')
  })

  it('newElementWithoutAFieldTest', () => {
    expect(newElement('FIELD').field).toBeNull()
    // Anything but `issuer` on an address is the recipient.
    expect(newElement('ADDRESS', 'document.number').field).toBe('recipient')
  })

  it('newSectionTest', () => {
    expect(newSection('POSITIONS')).toEqual({
      type: 'POSITIONS',
      x: 0,
      width: null,
      spaceAfter: 4,
      style: EMPTY_STYLE,
      columns: [],
      showHeader: true,
      rowLines: true,
    })
  })

  it('newSectionOfEveryKindTest', () => {
    // Totals name neither indent nor width: the renderer puts them 78 mm wide at the right margin.
    expect(newSection('TOTALS')).toMatchObject({ x: null, width: null })
    expect(newSection('VAT_SUMMARY')).toMatchObject({ x: null, width: null })
    expect(newSection('DOCUMENT_TEXT', 'footer')).toMatchObject({ field: 'footer' })
    expect(newSection('DOCUMENT_TEXT')).toMatchObject({ field: 'header' })
    expect(newSection('FREE')).toEqual({
      type: 'FREE',
      height: 20,
      spaceAfter: 4,
      style: EMPTY_STYLE,
      elements: [],
    })
    expect(newSection('PAYMENT_TERMS')).toMatchObject({ x: 0, width: null })
  })

  it('newSectionStandsWhereTheRendererPutsItTest', () => {
    const totals = newSection('TOTALS')
    if (totals.type !== 'TOTALS') throw new Error('totals expected')
    expect(sectionOffsetOf(totals, 170)).toBe(92)
    expect(sectionWidthOf(totals, 170)).toBe(78)
    // On paper narrower than 78 mm they take what there is.
    expect(sectionOffsetOf(totals, 60)).toBe(0)
    expect(sectionWidthOf(totals, 60)).toBe(60)
  })

  it('sectionOffsetOfTest', () => {
    const form = sampleForm()
    expect(sectionOffsetOf(form.flow.sections[2] as PositionsSection, 170)).toBe(92)
    expect(sectionOffsetOf(form.flow.sections[1] as PositionsSection, 170)).toBe(0)
  })

  it('sectionOffsetOfWithoutAnIndentTest', () => {
    // Without an indent: at the margin — and at the right one for totals and the VAT summary.
    const positions = { ...(newSection('POSITIONS') as PositionsSection), x: null }
    expect(sectionOffsetOf(positions, 170)).toBe(0)
    expect(sectionWidthOf(positions, 170)).toBe(170)
    expect(
      sectionOffsetOf({ type: 'VAT_SUMMARY', x: null, width: 70, spaceAfter: 4, style: {} }, 186),
    ).toBe(116)
    // Totals with an indent of their own but no width are 78 mm, also on narrow paper.
    expect(sectionWidthOf({ type: 'TOTALS', x: 10, width: null, spaceAfter: 4, style: {} }, 60)).toBe(
      78,
    )
  })

  it('defaultElementPositionTest', () => {
    // The top left corner of the margins.
    expect(defaultElementPosition(emptyDefinition(), newElement('TEXT'))).toEqual({ x: 20, y: 18 })
  })

  it('defaultElementPositionWhereTheSpotIsTakenTest', () => {
    let form = emptyDefinition()
    form = addElement(form, element({ x: 20, y: 18 })).definition
    expect(defaultElementPosition(form, newElement('TEXT'))).toEqual({ x: 25, y: 23 })
    form = addElement(form, element({ x: 25, y: 23 })).definition
    expect(defaultElementPosition(form, newElement('TEXT'))).toEqual({ x: 30, y: 28 })
  })

  it('defaultElementPositionOfAPageNumberTest', () => {
    // Bottom right, inside the bottom margin.
    expect(defaultElementPosition(emptyDefinition(), newElement('PAGE_NUMBER'))).toEqual({
      x: 150,
      y: 281,
    })
  })

  it('defaultSectionIndexTest', () => {
    // Totals go after the positions; the sample already has them, a VAT summary follows.
    expect(defaultSectionIndex(sampleForm(), newSection('VAT_SUMMARY'))).toBe(3)
    expect(defaultSectionIndex(sampleForm(), newSection('PAYMENT_TERMS'))).toBe(3)
  })

  it('defaultSectionIndexAtTheEndsTest', () => {
    expect(defaultSectionIndex(emptyDefinition(), newSection('POSITIONS'))).toBe(0)
    // The closing text comes after everything that is not a free section behind it.
    expect(defaultSectionIndex(sampleForm(), newSection('DOCUMENT_TEXT', 'footer'))).toBe(3)
    const withoutHeader = removeObjects(sampleForm(), ['s:0'])
    expect(defaultSectionIndex(withoutHeader, newSection('DOCUMENT_TEXT', 'header'))).toBe(0)
  })

  it('defaultSectionIndexOfAFreeSectionTest', () => {
    expect(defaultSectionIndex(sampleForm(), newSection('FREE'))).toBe(4)
    // Below the selected section, because «put something under this» is what it is for.
    expect(defaultSectionIndex(sampleForm(), newSection('FREE'), 1)).toBe(2)
    expect(defaultSectionIndex(sampleForm(), newSection('FREE'), 99)).toBe(4)
  })
})

describe('addElement', () => {
  it('addElementTest', () => {
    const before = sampleForm()
    const placed = addElement(before, element({ text: 'Neu' }))

    expect(placed.key).toBe('e:4')
    expect(placed.definition.elements).toHaveLength(5)
    expect(placed.definition.elements[4].text).toBe('Neu')
    // The form that went in is untouched.
    expect(before.elements).toHaveLength(4)
  })

  it('addElementGivesARepeatTest', () => {
    const placed = addElement(emptyDefinition(), { ...element(), repeat: undefined })
    expect(placed.definition.elements[0].repeat).toBe('FIRST_PAGE')
    expect(placed.key).toBe('e:0')
  })
})

describe('addChild', () => {
  it('addChildTest', () => {
    const placed = addChild(sampleForm(), 3, element({ text: 'Im Inhalt', repeat: 'EVERY_PAGE' }))

    expect(placed?.key).toBe('c:3:1')
    const added = elementAt(placed!.definition, 'c:3:1')
    expect(added?.text).toBe('Im Inhalt')
    expect('repeat' in added!).toBe(false)
  })

  it('addChildWhereItCannotGoTest', () => {
    expect(addChild(sampleForm(), 1, element())).toBeNull()
    expect(addChild(sampleForm(), 99, element())).toBeNull()
    expect(addChild(sampleForm(), 3, element({ type: 'PAGE_NUMBER' }))).toBeNull()
  })
})

describe('updateElement', () => {
  it('updateElementTest', () => {
    const before = sampleForm()
    const after = updateElement(before, 'e:0', { text: 'Titel', style: { italic: true } })

    expect(after.elements[0].text).toBe('Titel')
    // The style is merged: what was there stays.
    expect(after.elements[0].style).toMatchObject({ fontSize: 13, bold: true, italic: true })
    expect(before.elements[0].text).toBeNull()
    // Whatever was not touched is the same object, so nothing else re-renders.
    expect(after.elements[1]).toBe(before.elements[1])
    expect(after.flow).toBe(before.flow)
  })

  it('updateElementInAFreeSectionTest', () => {
    const after = updateElement(sampleForm(), { kind: 'child', section: 3, index: 0 }, { x: 33 })
    expect(elementAt(after, 'c:3:0')?.x).toBe(33)
  })

  it('updateElementThatIsNotThereTest', () => {
    const before = sampleForm()
    expect(updateElement(before, 'e:99', { x: 1 })).toBe(before)
    expect(updateElement(before, 's:1', { x: 1 })).toBe(before)
    expect(updateElement(before, 'unsinn', { x: 1 })).toBe(before)
  })
})

describe('moveElement', () => {
  it('moveElementTest', () => {
    const after = moveElement(sampleForm(), 'e:1', { x: 100.126, y: 40 })
    expect(after.elements[1]).toMatchObject({ x: 100.13, y: 40 })
  })

  it('moveElementThatIsNotThereTest', () => {
    const before = sampleForm()
    expect(moveElement(before, 'e:99', { x: 1, y: 1 })).toBe(before)
  })
})

describe('resizeElement', () => {
  it('resizeElementTest', () => {
    const after = resizeElement(sampleForm(), 'e:2', { x: 25, y: 50, width: 90, height: 40 })
    expect(after.elements[2]).toMatchObject({ x: 25, y: 50, width: 90, height: 40 })
  })

  it('resizeElementKeepsAnOpenSideTest', () => {
    // Dragging the right grip fixes the width, not the height that follows the content.
    const after = resizeElement(
      sampleForm(),
      'e:0',
      { x: 20, y: 78, width: 100, height: 6 },
      { width: true, height: false },
    )
    expect(after.elements[0]).toMatchObject({ width: 100, height: null })
  })

  it('resizeElementThatIsNotThereTest', () => {
    const before = sampleForm()
    expect(resizeElement(before, 'e:99', { x: 0, y: 0, width: 1, height: 1 })).toBe(before)
  })
})

describe('removeObjects', () => {
  it('removeObjectsTest', () => {
    const after = removeObjects(sampleForm(), ['e:1'])
    expect(after.elements).toHaveLength(3)
    expect(after.elements.map((entry) => entry.field)).toEqual(['document.heading', 'recipient', null])
  })

  it('removeObjectsOfEveryKindTest', () => {
    const after = removeObjects(sampleForm(), ['e:0', 'e:3', 's:0', 'c:3:0'])

    expect(after.elements).toHaveLength(2)
    expect(after.flow.sections.map((section) => section.type)).toEqual([
      'POSITIONS',
      'TOTALS',
      'FREE',
    ])
    expect((after.flow.sections[2] as FreeSection).elements).toEqual([])
  })

  it('removeObjectsWithASectionTakesItsElementsTest', () => {
    const after = removeObjects(sampleForm(), ['s:3'])
    expect(after.flow.sections).toHaveLength(3)
  })

  it('removeObjectsWithNothingToRemoveTest', () => {
    const before = sampleForm()
    expect(removeObjects(before, [])).toBe(before)
    expect(removeObjects(before, ['unsinn'])).toBe(before)
    expect(removeObjects(before, ['e:99']).elements).toHaveLength(4)
  })
})

describe('duplicateObject', () => {
  it('duplicateObjectTest', () => {
    const placed = duplicateObject(sampleForm(), 'e:1')

    expect(placed?.key).toBe('e:4')
    // A few millimetres down and to the right, so both can be seen.
    expect(placed?.definition.elements[4]).toMatchObject({ field: 'document.number', x: 135, y: 55 })
  })

  it('duplicateObjectInAFreeSectionTest', () => {
    const placed = duplicateObject(sampleForm(), 'c:3:0')
    expect(placed?.key).toBe('c:3:1')
    expect(elementAt(placed!.definition, 'c:3:1')).toMatchObject({ x: 15, y: 10 })
  })

  it('duplicateObjectAtTheEdgeTest', () => {
    // The copy stays on the sheet.
    const form = addElement(emptyDefinition(), element({ x: 150, y: 290, width: 60, height: 5 }))
    const placed = duplicateObject(form.definition, form.key)
    expect(placed?.definition.elements[1]).toMatchObject({ x: 150, y: 292 })
  })

  it('duplicateObjectOfASectionTest', () => {
    const placed = duplicateObject(sampleForm(), 's:3')

    expect(placed?.key).toBe('s:4')
    expect(placed?.definition.flow.sections).toHaveLength(5)
    // A copy of its own, not the same elements twice.
    expect(placed?.definition.flow.sections[4]).toEqual(placed?.definition.flow.sections[3])
    expect(placed?.definition.flow.sections[4]).not.toBe(placed?.definition.flow.sections[3])
  })

  it('duplicateObjectThatIsNotThereTest', () => {
    expect(duplicateObject(sampleForm(), 'e:99')).toBeNull()
    expect(duplicateObject(sampleForm(), 's:99')).toBeNull()
    expect(duplicateObject(sampleForm(), 'unsinn')).toBeNull()
  })
})

describe('moveChildToPage', () => {
  it('moveChildToPageTest', () => {
    const placed = moveChildToPage(sampleForm(), 3, 0, { x: 30, y: 60 })

    expect(placed?.key).toBe('e:4')
    expect(placed?.definition.elements[4]).toMatchObject({
      text: 'Besten Dank',
      repeat: 'FIRST_PAGE',
      x: 30,
      y: 60,
    })
    expect((placed?.definition.flow.sections[3] as FreeSection).elements).toEqual([])
  })

  it('moveChildToPageKeepsItOnThePaperTest', () => {
    const placed = moveChildToPage(sampleForm(), 3, 0, { x: 500, y: -20 }, 'EVERY_PAGE')
    // 50 mm wide on paper 210 mm wide: no further right than 160.
    expect(placed?.definition.elements[4]).toMatchObject({ x: 160, y: 0, repeat: 'EVERY_PAGE' })
  })

  it('moveChildToPageThatIsNotThereTest', () => {
    expect(moveChildToPage(sampleForm(), 3, 9, { x: 0, y: 0 })).toBeNull()
    expect(moveChildToPage(sampleForm(), 1, 0, { x: 0, y: 0 })).toBeNull()
  })
})

describe('insertSection', () => {
  it('insertSectionTest', () => {
    const placed = insertSection(sampleForm(), newSection('VAT_SUMMARY'), 3)

    expect(placed.key).toBe('s:3')
    expect(placed.definition.flow.sections.map((section) => section.type)).toEqual([
      'DOCUMENT_TEXT',
      'POSITIONS',
      'TOTALS',
      'VAT_SUMMARY',
      'FREE',
    ])
  })

  it('insertSectionOutsideTheListTest', () => {
    expect(insertSection(sampleForm(), newSection('FREE'), 99).key).toBe('s:4')
    expect(insertSection(sampleForm(), newSection('FREE'), -5).key).toBe('s:0')
    expect(insertSection(emptyDefinition(), newSection('FREE'), 0).key).toBe('s:0')
  })
})

describe('moveSection', () => {
  it('moveSectionTest', () => {
    const moved = moveSection(sampleForm(), 2, 1)

    expect(moved.key).toBe('s:1')
    expect(moved.definition.flow.sections.map((section) => section.type)).toEqual([
      'DOCUMENT_TEXT',
      'TOTALS',
      'POSITIONS',
      'FREE',
    ])
  })

  it('moveSectionToTheEndsTest', () => {
    expect(moveSection(sampleForm(), 0, 3).definition.flow.sections[3].type).toBe('DOCUMENT_TEXT')
    expect(moveSection(sampleForm(), 3, -9).key).toBe('s:0')
    expect(moveSection(sampleForm(), 0, 99).key).toBe('s:3')
  })

  it('moveSectionThatDoesNotMoveTest', () => {
    const before = sampleForm()
    expect(moveSection(before, 1, 1).definition).toBe(before)
    expect(moveSection(before, 99, 0).definition).toBe(before)
    expect(moveSection(before, -1, 0).definition).toBe(before)
  })
})

describe('updateSection', () => {
  it('updateSectionTest', () => {
    const before = sampleForm()
    const after = updateSection(before, 2, { x: 0, style: { bold: true } })

    expect(after.flow.sections[2]).toMatchObject({ type: 'TOTALS', x: 0, width: 78 })
    expect((after.flow.sections[2] as PositionsSection).style.bold).toBe(true)
    expect(after.flow.sections[1]).toBe(before.flow.sections[1])
    expect(before.flow.sections[2]).toMatchObject({ x: 92 })
  })

  it('updateSectionOfAFreeSectionTest', () => {
    // A free section carries a style like every other section, and a patch is merged into it.
    const before = updateSection(sampleForm(), 3, { style: { fontSize: 7.5 } })
    const after = updateSection(before, 3, { height: 40, style: { bold: true } })
    expect(after.flow.sections[3]).toMatchObject({
      type: 'FREE',
      height: 40,
      style: { fontSize: 7.5, bold: true },
    })
  })

  it('updateSectionThatIsNotThereTest', () => {
    const before = sampleForm()
    expect(updateSection(before, 99, { x: 1 })).toBe(before)
  })
})

describe('setFlowTop', () => {
  it('setFlowTopTest', () => {
    expect(setFlowTop(sampleForm(), 90.126).flow.top).toBe(90.13)
  })

  it('setFlowTopAgainstItsLimitsTest', () => {
    expect(setFlowTop(sampleForm(), -5).flow.top).toBe(0)
    // 297 less the bottom margin of 22 less the 40 mm the content needs.
    expect(setFlowTop(sampleForm(), 290).flow.top).toBe(235)
  })
})

describe('setPage', () => {
  it('setPageTest', () => {
    const after = setPage(sampleForm(), { marginLeft: 25 })

    expect(after.page.marginLeft).toBe(25)
    // The content is 5 mm narrower; totals that stood at the right margin still do.
    expect(after.flow.sections[2]).toMatchObject({ x: 87, width: 78 })
    // Elements on the page are measured from the paper and do not move.
    expect(after.elements[0]).toMatchObject({ x: 20, y: 78 })
  })

  it('setPageToSmallerPaperTest', () => {
    const before = { ...sampleForm(), paymentPart: 'LAST_PAGE_BOTTOM' as const }
    const after = setPage(before, { format: 'A5' })

    expect(after.page).toMatchObject({ format: 'A5', customWidth: null })
    // On A5 the payment part cannot stand at the bottom.
    expect(after.paymentPart).toBe('OWN_PAGE')
    // 148 × 210: everything is back on the sheet.
    expect(after.elements[1]).toMatchObject({ x: 88, y: 50 })
    expect(after.elements[3]).toMatchObject({ x: 20, y: 205 })
    // Content width 108: the totals keep their 78 mm at the right margin.
    expect(after.flow.sections[2]).toMatchObject({ x: 30, width: 78 })
    // The start of the content stays where it was put, even where the new paper leaves it
    // too little room: the check of the form says so, the line does not move by itself.
    expect(after.flow.top).toBe(103)
    expect(setPage({ ...before, flow: { ...before.flow, top: 180 } }, { format: 'A5' }).flow.top).toBe(
      180,
    )
  })

  it('setPageNarrowerThanASectionTest', () => {
    const after = setPage(sampleForm(), { marginLeft: 70, marginRight: 80 })
    // Content width 60: the totals shrink to it.
    expect(after.flow.sections[2]).toMatchObject({ x: 0, width: 60 })
    expect(elementAt(after, 'c:3:0')).toMatchObject({ x: 10 })
  })

  it('setPageLeavesSectionsWithoutAnIndentAloneTest', () => {
    // Totals that find their place by themselves need no help when the paper changes.
    const form = sampleForm()
    form.flow.sections[2] = { type: 'TOTALS', x: null, width: null, spaceAfter: 4, style: {} }
    const after = setPage(form, { format: 'A5' })
    expect(after.flow.sections[2]).toBe(form.flow.sections[2])
    expect(sectionOffsetOf(after.flow.sections[2] as PositionsSection, 108)).toBe(30)
  })

  it('setPageKeepsASectionWideEnoughToPrintTest', () => {
    // An opening text indented 120 mm and running up to the margin: 50 mm wide on A4. On A5
    // the content is 108 mm wide — left alone, the section would have no width at all, which
    // the server refuses. It keeps 20 mm.
    const form = updateSection(sampleForm(), 0, { x: 120 })
    const after = setPage(form, { format: 'A5' })
    expect(after.flow.sections[0]).toMatchObject({ x: 88, width: null })
    expect(sectionWidthOf(after.flow.sections[0] as PositionsSection, 108)).toBe(20)
    // An indent that still leaves room is not touched.
    const fine = setPage(updateSection(sampleForm(), 0, { x: 60 }), { format: 'A5' })
    expect(fine.flow.sections[0]).toMatchObject({ x: 60, width: null })
    // Totals with an indent and no width of their own stay at the right margin: 108 − 78.
    const totals = setPage(updateSection(sampleForm(), 2, { x: 92, width: null }), { format: 'A5' })
    expect(totals.flow.sections[2]).toMatchObject({ x: 30, width: null })
  })

  it('setPageToACustomFormatTest', () => {
    // A custom format starts as the sheet it was switched from.
    const custom = setPage(sampleForm(), { format: 'CUSTOM' })
    expect(custom.page).toMatchObject({ format: 'CUSTOM', customWidth: 210, customHeight: 297 })
    // And a named one forgets the custom sides again.
    const named = setPage(setPage(custom, { customWidth: 100 }), { format: 'A4' })
    expect(named.page).toMatchObject({ format: 'A4', customWidth: null, customHeight: null })
  })

  it('setPageKeepsTheBottomPaymentPartOnAFourTest', () => {
    const before = { ...sampleForm(), paymentPart: 'LAST_PAGE_BOTTOM' as const }
    expect(setPage(before, { marginTop: 30 }).paymentPart).toBe('LAST_PAGE_BOTTOM')
    expect(setPage(before, { orientation: 'LANDSCAPE' }).paymentPart).toBe('OWN_PAGE')
  })

  it('setPageWithoutAChangeKeepsTheObjectsTest', () => {
    const before = sampleForm()
    const after = setPage(before, { marginTop: 18 })
    expect(after.elements[0]).toBe(before.elements[0])
    expect(after.flow.sections[1]).toBe(before.flow.sections[1])
  })
})

describe('section kinds', () => {
  it('everyKindOfSectionCanBeBuiltTest', () => {
    const kinds: LayoutSection['type'][] = [
      'DOCUMENT_TEXT',
      'POSITIONS',
      'TOTALS',
      'VAT_SUMMARY',
      'PAYMENT_TERMS',
      'DISCOUNT_STAGES',
      'FREE',
    ]
    expect(kinds.map((kind) => newSection(kind).type)).toEqual(kinds)
  })
})
