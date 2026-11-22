import { describe, expect, it } from 'vitest'
import type { FreeSection } from '../lib/types'
import {
  copySelection,
  dropElement,
  dropSection,
  duplicateSelection,
  existingSectionKey,
  nudgeSelection,
  pasteClipboard,
  positionAnnouncement,
  pruneSelection,
  relocateElement,
  removeSelection,
  type Snapshot,
} from './commands'
import { elementAt, emptyDefinition, moveSection, newElement, newSection } from './definition'
import { sampleCatalogue, sampleForm } from './fixtures'

const CATALOGUE = sampleCatalogue()
const snapshot = (selection: string[] = []): Snapshot => ({ definition: sampleForm(), selection })

describe('positionAnnouncement', () => {
  it('positionAnnouncementTest', () => {
    expect(positionAnnouncement('Belegnummer', 20, 78)).toBe(
      'Belegnummer: 20 mm von links, 78 mm von oben',
    )
  })

  it('positionAnnouncementWithFractionsTest', () => {
    expect(positionAnnouncement('Text', 20.5, 0)).toBe('Text: 20.5 mm von links, 0 mm von oben')
  })
})

describe('pruneSelection', () => {
  it('pruneSelectionTest', () => {
    expect(pruneSelection(sampleForm(), ['e:0', 'e:9', 's:1', 'c:3:0', 'c:3:4'])).toEqual([
      'e:0',
      's:1',
      'c:3:0',
    ])
  })

  it('pruneSelectionOfNothingTest', () => {
    expect(pruneSelection(sampleForm(), [])).toEqual([])
    expect(pruneSelection(emptyDefinition(), ['e:0'])).toEqual([])
  })
})

describe('existingSectionKey', () => {
  it('existingSectionKeyTest', () => {
    expect(existingSectionKey(sampleForm(), 'POSITIONS')).toBe('s:1')
    expect(existingSectionKey(sampleForm(), 'TOTALS')).toBe('s:2')
  })

  it('existingSectionKeyOfTheTwoTextsTest', () => {
    // The opening text is there, the closing one is not: they are two different things.
    expect(existingSectionKey(sampleForm(), 'DOCUMENT_TEXT', 'header')).toBe('s:0')
    expect(existingSectionKey(sampleForm(), 'DOCUMENT_TEXT', 'footer')).toBeUndefined()
    expect(existingSectionKey(sampleForm(), 'DOCUMENT_TEXT')).toBe('s:0')
  })

  it('existingSectionKeyOfWhatMayBeThereManyTimesTest', () => {
    // A free section is never «already there», and neither is a VAT summary: the server
    // accepts several of them.
    expect(existingSectionKey(sampleForm(), 'FREE')).toBeUndefined()
    const withVat = dropSection(snapshot(), newSection('VAT_SUMMARY'), 3)
    expect(existingSectionKey(withVat.definition, 'VAT_SUMMARY')).toBeUndefined()
  })
})

describe('dropElement', () => {
  it('dropElementTest', () => {
    const outcome = dropElement(
      snapshot(),
      newElement('FIELD', 'document.date'),
      { kind: 'page', x: 120.3, y: 40 },
      CATALOGUE,
    )

    expect(outcome?.selection).toEqual(['e:4'])
    expect(outcome?.definition.elements[4]).toMatchObject({ x: 120.3, y: 40, repeat: 'FIRST_PAGE' })
    expect(outcome?.announcement).toBe('Belegdatum eingefügt und ausgewählt.')
  })

  it('dropElementOnAFollowingPageTest', () => {
    // What is put on a following page can only be something that repeats.
    const outcome = dropElement(
      snapshot(),
      newElement('TEXT'),
      { kind: 'page', x: 20, y: 280 },
      CATALOGUE,
      'following',
    )
    expect(outcome?.definition.elements[4].repeat).toBe('EVERY_PAGE')
  })

  it('dropElementKeepsItOnThePaperTest', () => {
    const outcome = dropElement(snapshot(), newElement('TEXT'), { kind: 'page', x: 500, y: -4 }, CATALOGUE)
    // 60 mm wide on 210 mm paper.
    expect(outcome?.definition.elements[4]).toMatchObject({ x: 150, y: 0 })
  })

  it('dropElementIntoAFreeSectionTest', () => {
    const outcome = dropElement(
      snapshot(),
      newElement('TEXT'),
      { kind: 'free', section: 3, x: 30, y: 18 },
      CATALOGUE,
      'first',
      6,
    )

    expect(outcome?.selection).toEqual(['c:3:1'])
    expect(elementAt(outcome!.definition, 'c:3:1')).toMatchObject({ x: 30, y: 18 })
    // 18 + 6 does not fit into 20 mm: the section grows so nothing hangs out of it.
    expect((outcome?.definition.flow.sections[3] as FreeSection).height).toBe(24)
    expect(outcome?.announcement).toContain('Bewegt sich mit dem Inhalt mit')
  })

  it('dropElementIntoTheFlowTest', () => {
    const outcome = dropElement(
      snapshot(),
      newElement('TEXT'),
      { kind: 'flow', index: 2, x: 40 },
      CATALOGUE,
      'first',
      7.2,
    )

    // A free section of its own, between the positions and the totals, just high enough.
    expect(outcome?.definition.flow.sections.map((section) => section.type)).toEqual([
      'DOCUMENT_TEXT',
      'POSITIONS',
      'FREE',
      'TOTALS',
      'FREE',
    ])
    expect(outcome?.definition.flow.sections[2]).toMatchObject({ height: 8, spaceAfter: 4 })
    expect(outcome?.selection).toEqual(['c:2:0'])
    expect(elementAt(outcome!.definition, 'c:2:0')).toMatchObject({ x: 40, y: 0 })
  })

  it('dropElementThatCannotGoThereTest', () => {
    // A page number counts pages and cannot live in the content.
    expect(
      dropElement(snapshot(), newElement('PAGE_NUMBER'), { kind: 'flow', index: 0, x: 0 }, CATALOGUE),
    ).toBeNull()
    // The target is not a free section.
    expect(
      dropElement(snapshot(), newElement('TEXT'), { kind: 'free', section: 1, x: 0, y: 0 }, CATALOGUE),
    ).toBeNull()
    expect(
      dropElement(snapshot(), newElement('TEXT'), { kind: 'free', section: 99, x: 0, y: 0 }, CATALOGUE),
    ).toBeNull()
  })
})

describe('relocateElement', () => {
  it('relocateElementTest', () => {
    // The number goes from the page into the free section.
    const outcome = relocateElement(snapshot(['e:1']), 'e:1', { kind: 'free', section: 3, x: 5, y: 10 }, CATALOGUE)

    expect(outcome?.definition.elements).toHaveLength(3)
    expect(outcome?.selection).toEqual(['c:3:1'])
    const moved = elementAt(outcome!.definition, 'c:3:1')
    expect(moved).toMatchObject({ field: 'document.number', x: 5, y: 10 })
    expect('repeat' in moved!).toBe(false)
    expect(outcome?.announcement).toBe('Belegnummer bewegt sich jetzt mit dem Inhalt mit.')
  })

  it('relocateElementOutOfTheContentTest', () => {
    const outcome = relocateElement(snapshot(), 'c:3:0', { kind: 'page', x: 30, y: 250 }, CATALOGUE)

    expect((outcome?.definition.flow.sections[3] as FreeSection).elements).toEqual([])
    expect(outcome?.selection).toEqual(['e:4'])
    expect(outcome?.definition.elements[4]).toMatchObject({ x: 30, y: 250, repeat: 'FIRST_PAGE' })
    expect(outcome?.announcement).toBe('Text «Besten Dank» steht jetzt fest auf dem Blatt.')
  })

  it('relocateElementIntoANewFreeSectionTest', () => {
    const outcome = relocateElement(snapshot(), 'e:0', { kind: 'flow', index: 4, x: 0 }, CATALOGUE, 6)
    expect(outcome?.definition.flow.sections).toHaveLength(5)
    expect(outcome?.selection).toEqual(['c:4:0'])
  })

  it('relocateElementThatCannotMoveTest', () => {
    expect(relocateElement(snapshot(), 'e:99', { kind: 'page', x: 0, y: 0 }, CATALOGUE)).toBeNull()
    expect(relocateElement(snapshot(), 's:1', { kind: 'page', x: 0, y: 0 }, CATALOGUE)).toBeNull()
    const withNumber = dropElement(
      snapshot(),
      newElement('PAGE_NUMBER'),
      { kind: 'page', x: 150, y: 280 },
      CATALOGUE,
    )!
    expect(relocateElement(withNumber, 'e:4', { kind: 'flow', index: 0, x: 0 }, CATALOGUE)).toBeNull()
  })
})

describe('dropSection', () => {
  it('dropSectionTest', () => {
    const outcome = dropSection(snapshot(), newSection('VAT_SUMMARY'), 3)
    expect(outcome.selection).toEqual(['s:3'])
    expect(outcome.definition.flow.sections[3].type).toBe('VAT_SUMMARY')
    expect(outcome.announcement).toBe('MwSt-Aufstellung in den Inhalt eingefügt und ausgewählt.')
  })

  it('dropSectionIntoAnEmptyFormTest', () => {
    const outcome = dropSection({ definition: emptyDefinition(), selection: [] }, newSection('FREE'), 5)
    expect(outcome.selection).toEqual(['s:0'])
  })
})

describe('removeSelection', () => {
  it('removeSelectionTest', () => {
    const outcome = removeSelection(snapshot(['e:1']), CATALOGUE)
    expect(outcome?.definition.elements).toHaveLength(3)
    expect(outcome?.selection).toEqual([])
    expect(outcome?.announcement).toBe('Belegnummer gelöscht. Rückgängig mit Strg+Z.')
  })

  it('removeSelectionOfSeveralTest', () => {
    const outcome = removeSelection(snapshot(['e:0', 'e:1', 'c:3:0']), CATALOGUE)
    expect(outcome?.definition.elements).toHaveLength(2)
    expect(outcome?.announcement).toBe('3 Elemente gelöscht. Rückgängig mit Strg+Z.')
  })

  it('removeSelectionWithNothingSelectedTest', () => {
    expect(removeSelection(snapshot(), CATALOGUE)).toBeNull()
    expect(removeSelection(snapshot(['e:99']), CATALOGUE)).toBeNull()
  })
})

describe('duplicateSelection', () => {
  it('duplicateSelectionTest', () => {
    const outcome = duplicateSelection(snapshot(['e:1']), CATALOGUE)
    expect(outcome?.definition.elements).toHaveLength(5)
    // The copy is selected, so it can be moved away at once.
    expect(outcome?.selection).toEqual(['e:4'])
    expect(outcome?.announcement).toBe('Belegnummer dupliziert.')
  })

  it('duplicateSelectionOfSeveralTest', () => {
    const outcome = duplicateSelection(snapshot(['e:0', 'c:3:0']), CATALOGUE)
    expect(outcome?.selection).toEqual(['e:4', 'c:3:1'])
    expect(outcome?.announcement).toBe('2 Elemente dupliziert.')
  })

  it('duplicateSelectionOfASectionTest', () => {
    const outcome = duplicateSelection(snapshot(['s:3']), CATALOGUE)
    expect(outcome?.definition.flow.sections).toHaveLength(5)
    expect(outcome?.selection).toEqual(['s:4'])
  })

  it('duplicateSelectionOfTheTotalsTest', () => {
    // A form has its totals once: nothing is copied, and the designer says why.
    const state = snapshot(['s:2'])
    const outcome = duplicateSelection(state, CATALOGUE)
    expect(outcome?.definition).toBe(state.definition)
    expect(outcome?.selection).toEqual(['s:2'])
    expect(outcome?.announcement).toBe('Totale gibt es nur einmal pro Vorlage.')
    // Selected together with something else, the rest is copied.
    const mixed = duplicateSelection(snapshot(['s:2', 's:3']), CATALOGUE)
    expect(mixed?.definition.flow.sections.filter((section) => section.type === 'TOTALS')).toHaveLength(1)
    expect(mixed?.definition.flow.sections).toHaveLength(5)
  })

  it('duplicateSelectionWithNothingSelectedTest', () => {
    expect(duplicateSelection(snapshot(), CATALOGUE)).toBeNull()
    expect(duplicateSelection(snapshot(['e:99']), CATALOGUE)).toBeNull()
  })
})

describe('nudgeSelection', () => {
  it('nudgeSelectionTest', () => {
    const outcome = nudgeSelection(snapshot(['e:1']), 0.5, 0, CATALOGUE)
    expect(outcome?.definition.elements[1]).toMatchObject({ x: 130.5, y: 50 })
    expect(outcome?.selection).toEqual(['e:1'])
    expect(outcome?.announcement).toBe('Belegnummer: 130.5 mm von links, 50 mm von oben')
  })

  it('nudgeSelectionOfAGroupTest', () => {
    const outcome = nudgeSelection(snapshot(['e:0', 'e:1']), 0, -5, CATALOGUE)
    expect(outcome?.definition.elements[0].y).toBe(73)
    expect(outcome?.definition.elements[1].y).toBe(45)
    expect(outcome?.announcement).toBe('2 Elemente verschoben.')
  })

  it('nudgeSelectionStopsAtTheEdgeTest', () => {
    // The number is 60 mm wide at 130: 20 mm to the right edge, no more.
    const outcome = nudgeSelection(snapshot(['e:1']), 50, 0, CATALOGUE)
    expect(outcome?.definition.elements[1].x).toBe(150)
    // Standing at the edge it cannot move further, and nothing is recorded.
    expect(nudgeSelection(outcome!, 0.5, 0, CATALOGUE)).toBeNull()
  })

  it('nudgeSelectionInsideAFreeSectionTest', () => {
    // 5 mm high at 5 in a section of 20: 10 mm of room below.
    const outcome = nudgeSelection(snapshot(['c:3:0']), 0, 50, CATALOGUE)
    expect(elementAt(outcome!.definition, 'c:3:0')?.y).toBe(15)
  })

  it('nudgeSelectionOfASectionSidewaysTest', () => {
    const outcome = nudgeSelection(snapshot(['s:2']), -5, 0, CATALOGUE)
    expect(outcome?.definition.flow.sections[2]).toMatchObject({ x: 87 })
    expect(outcome?.announcement).toBe('Totale: Einzug 87 mm.')
    // At the right margin already: no further right.
    expect(nudgeSelection(snapshot(['s:2']), 5, 0, CATALOGUE)).toBeNull()
  })

  it('nudgeSelectionOfASectionUpAndDownTest', () => {
    // A section has no height to move in: up and down is its place in the order.
    const outcome = nudgeSelection(snapshot(['s:2']), 0, -0.5, CATALOGUE)
    expect(outcome?.selection).toEqual(['s:1'])
    expect(outcome?.definition.flow.sections[1].type).toBe('TOTALS')
    expect(outcome?.announcement).toBe('Totale: jetzt an Stelle 2 von 4.')
    expect(nudgeSelection(snapshot(['s:0']), 0, -0.5, CATALOGUE)).toBeNull()
    expect(nudgeSelection(snapshot(['s:3']), 0, 0.5, CATALOGUE)).toBeNull()
  })

  it('nudgeSelectionOfAFreeSectionSidewaysTest', () => {
    // A free section spans the content width and has no indent.
    expect(nudgeSelection(snapshot(['s:3']), 5, 0, CATALOGUE)).toBeNull()
  })

  it('nudgeSelectionWithNothingSelectedTest', () => {
    expect(nudgeSelection(snapshot(), 1, 1, CATALOGUE)).toBeNull()
    expect(nudgeSelection(snapshot(['e:1']), 0, 0, CATALOGUE)).toBeNull()
  })
})

describe('copySelection', () => {
  it('copySelectionTest', () => {
    const state = snapshot(['e:1', 'c:3:0'])
    const clipboard = copySelection(state)
    expect(clipboard).toHaveLength(2)
    // A copy of a page element has no home to find again; one from a free section remembers
    // the very element it was copied from, through which its section is found later.
    expect(clipboard[0]).toMatchObject({ kind: 'element', anchor: null })
    const second = clipboard[1]
    if (second.kind !== 'element') throw new Error('an element was copied')
    expect(second.anchor).toBe(elementAt(state.definition, 'c:3:0'))
    // The copy itself is a copy: changing the form later does not reach the clipboard.
    expect(second.element).not.toBe(second.anchor)
    expect(second.element).toEqual(second.anchor)
  })

  it('copySelectionOfASectionTest', () => {
    const state = snapshot(['s:3'])
    const clipboard = copySelection(state)
    expect(clipboard[0].kind).toBe('section')
    // A copy, not the thing itself: a later change to the form does not reach the clipboard.
    expect(clipboard[0]).not.toBe(state.definition.flow.sections[3])
  })

  it('copySelectionWithNothingSelectedTest', () => {
    expect(copySelection(snapshot())).toEqual([])
    expect(copySelection(snapshot(['e:99']))).toEqual([])
  })
})

describe('pasteClipboard', () => {
  it('pasteClipboardTest', () => {
    const state = snapshot(['e:1'])
    const outcome = pasteClipboard(state, copySelection(state))

    expect(outcome?.definition.elements).toHaveLength(5)
    // A little off the original, so the copy can be seen.
    expect(outcome?.definition.elements[4]).toMatchObject({ field: 'document.number', x: 135, y: 55 })
    expect(outcome?.selection).toEqual(['e:4'])
  })

  it('pasteClipboardBackIntoItsFreeSectionTest', () => {
    const state = snapshot(['c:3:0'])
    const outcome = pasteClipboard(state, copySelection(state))
    expect(outcome?.selection).toEqual(['c:3:1'])
  })

  it('pasteClipboardWhereTheFreeSectionIsGoneTest', () => {
    // The section it came from was removed meanwhile: the copy lands on the page instead.
    const state = snapshot(['c:3:0'])
    const clipboard = copySelection(state)
    const without = removeSelection({ ...state, selection: ['s:3'] }, CATALOGUE)!
    const outcome = pasteClipboard(without, clipboard)
    expect(outcome?.selection).toEqual(['e:4'])
  })

  it('pasteClipboardAgainAndAgainTest', () => {
    // Every paste lands beside the one before, not all of them on the same spot.
    const state = snapshot(['e:1'])
    const first = pasteClipboard(state, copySelection(state))!
    const second = pasteClipboard(first, first.clipboard)!
    const third = pasteClipboard(second, second.clipboard)!
    expect(third.definition.elements.slice(4).map((entry) => [entry.x, entry.y])).toEqual([
      [135, 55],
      [140, 60],
      [145, 65],
    ])
  })

  it('pasteClipboardAfterTheContentWasReorderedTest', () => {
    // The free section was the fourth when the element was copied and is the first now: the
    // copy goes into it all the same, because it is found by what it holds.
    const state = snapshot(['c:3:0'])
    const clipboard = copySelection(state)
    const moved = { definition: moveSection(state.definition, 3, 0).definition, selection: [] }
    const outcome = pasteClipboard(moved, clipboard)!
    expect(outcome.selection).toEqual(['c:0:1'])
    expect(elementAt(outcome.definition, 'c:0:1')).toMatchObject({ text: 'Besten Dank', x: 15, y: 10 })
    // And the paste after that follows the copy, not the original.
    const again = pasteClipboard(outcome, outcome.clipboard)!
    expect(again.selection).toEqual(['c:0:2'])
    expect(elementAt(again.definition, 'c:0:2')).toMatchObject({ x: 20, y: 15 })
  })

  it('pasteClipboardOfASectionTest', () => {
    const state = snapshot(['s:3'])
    const outcome = pasteClipboard(state, copySelection(state))
    expect(outcome?.definition.flow.sections).toHaveLength(5)
    expect(outcome?.selection).toEqual(['s:4'])
  })

  it('pasteClipboardOfTheTotalsTest', () => {
    const state = snapshot(['s:2'])
    const clipboard = copySelection(state)
    // While the form has its totals a second one is not pasted …
    const refused = pasteClipboard(state, clipboard)
    expect(refused?.definition).toBe(state.definition)
    expect(refused?.announcement).toBe('Totale gibt es nur einmal pro Vorlage.')
    // … but after they were removed, the copy brings them back.
    const without = removeSelection(state, CATALOGUE)!
    const pasted = pasteClipboard(without, clipboard)
    expect(pasted?.definition.flow.sections.filter((section) => section.type === 'TOTALS')).toHaveLength(1)
  })

  it('pasteClipboardWithNothingCopiedTest', () => {
    expect(pasteClipboard(snapshot(), [])).toBeNull()
  })
})
