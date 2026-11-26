import { describe, expect, it } from 'vitest'
import {
  inlineParts,
  liteLines,
  newLine,
  plainLine,
  toggleEmphasis,
  toggleList,
} from './markdownLite'

describe('inlineParts', () => {
  it('inlinePartsTest', () => {
    expect(inlineParts('Konzept **abgenommen** und *versendet*')).toEqual([
      { text: 'Konzept ', bold: false, italic: false },
      { text: 'abgenommen', bold: true, italic: false },
      { text: ' und ', bold: false, italic: false },
      { text: 'versendet', bold: false, italic: true },
    ])
  })

  /** A marker without its partner stays as it was typed. */
  it('inlinePartsWithAnUnclosedMarkerTest', () => {
    expect(inlineParts('**fett ohne Ende')).toEqual([
      { text: '**fett ohne Ende', bold: false, italic: false },
    ])
    expect(inlineParts('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6', bold: false, italic: false }])
  })

  /** Markup of a page is text like any other: it never becomes an element. */
  it('inlinePartsWithMarkupTest', () => {
    expect(inlineParts('<script>alert(1)</script> **<b>x</b>**')).toEqual([
      { text: '<script>alert(1)</script> ', bold: false, italic: false },
      { text: '<b>x</b>', bold: true, italic: false },
    ])
  })

  it('inlinePartsOfAnEmptyLineTest', () => {
    expect(inlineParts('')).toEqual([])
  })
})

describe('liteLines', () => {
  /** Both lists, plain lines and empty lines between them. */
  it('liteLinesTest', () => {
    const lines = liteLines('Workshop\n\n- Wireframes\n- **Review**\n1. Konzept\n2. Offerte')

    expect(lines.map((line) => line.kind)).toEqual(['text', 'bullet', 'bullet', 'number', 'number'])
    expect(lines[2].parts).toEqual([{ text: 'Review', bold: true, italic: false }])
    expect(lines[4].number).toBe(2)
  })

  /** «-Wort» without a blank and «*kursiv*» at the start are no list. */
  it('liteLinesWithoutAListMarkerTest', () => {
    expect(liteLines('-Wort\n*kursiv*').map((line) => line.kind)).toEqual(['text', 'text'])
  })

  it('liteLinesOfNothingTest', () => {
    expect(liteLines(null)).toEqual([])
    expect(liteLines('')).toEqual([])
    expect(liteLines('\n \n')).toEqual([])
  })
})

describe('plainLine', () => {
  /** A list becomes one line, the way the invoice writes it: «A · B · C». */
  it('plainLineTest', () => {
    expect(plainLine('- Wireframes\n- **Review** mit Kunde\n- *Offerte*')).toBe(
      'Wireframes · Review mit Kunde · Offerte',
    )
  })

  it('plainLineOfPlainTextTest', () => {
    expect(plainLine('Ticket 4711')).toBe('Ticket 4711')
    expect(plainLine(undefined)).toBe('')
  })
})

describe('toggleEmphasis', () => {
  it('toggleEmphasisTest', () => {
    expect(toggleEmphasis('Konzept abgenommen', 8, 18, '**')).toEqual({
      value: 'Konzept **abgenommen**',
      selectionStart: 10,
      selectionEnd: 20,
    })
  })

  /** Set again, the marker goes. */
  it('toggleEmphasisTwiceTest', () => {
    expect(toggleEmphasis('Konzept **abgenommen**', 10, 20, '**').value).toBe('Konzept abgenommen')
  })

  /** Without a selection the pair goes in, the caret between. */
  it('toggleEmphasisWithoutASelectionTest', () => {
    expect(toggleEmphasis('', 0, 0, '*')).toEqual({ value: '**', selectionStart: 1, selectionEnd: 1 })
  })

  /** Inside bold, italic is added and not mistaken for a marker already there. */
  it('toggleEmphasisItalicInsideBoldTest', () => {
    expect(toggleEmphasis('**fett**', 2, 6, '*').value).toBe('***fett***')
  })
})

describe('toggleList', () => {
  it('toggleListTest', () => {
    expect(toggleList('Wireframes\nReview', 0, 17, 'bullet').value).toBe('- Wireframes\n- Review')
  })

  it('toggleListNumberedTest', () => {
    expect(toggleList('Konzept\nOfferte\nVersand', 3, 20, 'number').value).toBe(
      '1. Konzept\n2. Offerte\n3. Versand',
    )
  })

  /** Lines that all are such a list already become plain again. */
  it('toggleListBackTest', () => {
    expect(toggleList('- Wireframes\n- Review', 2, 5, 'bullet').value).toBe('Wireframes\n- Review')
    expect(toggleList('- Wireframes\n- Review', 0, 21, 'bullet').value).toBe('Wireframes\nReview')
  })

  /** One kind of list turns into the other. */
  it('toggleListFromBulletsToNumbersTest', () => {
    expect(toggleList('- A\n- B', 0, 7, 'number').value).toBe('1. A\n2. B')
  })

  /** Only the lines of the selection change; the caret on one line turns that one. */
  it('toggleListOfOneLineTest', () => {
    const edited = toggleList('Kopf\nWireframes\nFuss', 7, 7, 'bullet')

    expect(edited.value).toBe('Kopf\n- Wireframes\nFuss')
    expect(edited.selectionStart).toBe(5)
    expect(edited.selectionEnd).toBe(17)
  })
})

describe('newLine', () => {
  /** A bullet goes on with «- ». */
  it('newLineTest', () => {
    expect(newLine('- Wireframes', 12)).toEqual({
      value: '- Wireframes\n- ',
      selectionStart: 15,
      selectionEnd: 15,
    })
  })

  it('newLineInANumberedListTest', () => {
    expect(newLine('1. Konzept\n2. Review', 20).value).toBe('1. Konzept\n2. Review\n3. ')
  })

  /** On an empty entry the list ends: the marker goes, no line is added. */
  it('newLineOnAnEmptyEntryTest', () => {
    expect(newLine('- Wireframes\n- ', 15)).toEqual({
      value: '- Wireframes\n',
      selectionStart: 13,
      selectionEnd: 13,
    })
  })

  /** Outside a list it is a plain line break. */
  it('newLineInPlainTextTest', () => {
    expect(newLine('Workshop', 8).value).toBe('Workshop\n')
  })
})
