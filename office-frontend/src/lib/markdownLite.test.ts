import { describe, expect, it } from 'vitest'
import {
  editorLines,
  inlineParts,
  liteLines,
  lineOf,
  plainLine,
  writeLines,
  writeParts,
  type InlinePart,
  type LiteLine,
} from './markdownLite'

const plain = (text: string): InlinePart => ({ text, bold: false, italic: false })
const bold = (text: string): InlinePart => ({ text, bold: true, italic: false })
const italic = (text: string): InlinePart => ({ text, bold: false, italic: true })
const both = (text: string): InlinePart => ({ text, bold: true, italic: true })

describe('inlineParts', () => {
  it('inlinePartsTest', () => {
    expect(inlineParts('Konzept **abgenommen** und *versendet*')).toEqual([
      plain('Konzept '),
      bold('abgenommen'),
      plain(' und '),
      italic('versendet'),
    ])
  })

  /** Bold and italic at once, written either way round. */
  it('inlinePartsWithBothMarksTest', () => {
    expect(inlineParts('***beides***')).toEqual([both('beides')])
    expect(inlineParts('**fett *beides* fett**')).toEqual([
      bold('fett '),
      both('beides'),
      bold(' fett'),
    ])
    expect(inlineParts('*a**b***')).toEqual([italic('a'), both('b')])
  })

  /** A backslash keeps a star, a backslash or a list marker as typed. */
  it('inlinePartsWithEscapesTest', () => {
    expect(inlineParts('2\\*3\\*4')).toEqual([plain('2*3*4')])
    expect(inlineParts('C:\\\\Daten')).toEqual([plain('C:\\Daten')])
    expect(inlineParts('**\\*wichtig**')).toEqual([bold('*wichtig')])
    // A backslash before a letter is no escape and stays.
    expect(inlineParts('a\\b')).toEqual([plain('a\\b')])
    expect(inlineParts('Ende\\')).toEqual([plain('Ende\\')])
  })

  /** A marker without its partner, or next to a blank, stays as it was typed. */
  it('inlinePartsWithAnUnclosedMarkerTest', () => {
    expect(inlineParts('**fett ohne Ende')).toEqual([plain('**fett ohne Ende')])
    expect(inlineParts('2 * 3 = 6')).toEqual([plain('2 * 3 = 6')])
    expect(inlineParts('Preis * Menge * Faktor')).toEqual([plain('Preis * Menge * Faktor')])
    expect(inlineParts('Fussnote*')).toEqual([plain('Fussnote*')])
    expect(inlineParts('a****b')).toEqual([plain('a****b')])
  })

  /** Markup of a page is text like any other: it never becomes an element. */
  it('inlinePartsWithMarkupTest', () => {
    expect(inlineParts('<script>alert(1)</script> **<b>x</b>**')).toEqual([
      plain('<script>alert(1)</script> '),
      bold('<b>x</b>'),
    ])
  })

  it('inlinePartsOfAnEmptyLineTest', () => {
    expect(inlineParts('')).toEqual([])
  })
})

describe('lineOf', () => {
  it('lineOfTest', () => {
    expect(lineOf('- **Review**')).toEqual({ kind: 'bullet', parts: [bold('Review')] })
    expect(lineOf('12. Offerte')).toEqual({ kind: 'number', parts: [plain('Offerte')] })
    expect(lineOf('  Workshop  ')).toEqual({ kind: 'text', parts: [plain('Workshop')] })
  })

  /** «-Wort», three digits and an escaped marker are no list. */
  it('lineOfWithoutAListMarkerTest', () => {
    expect(lineOf('-Wort').kind).toBe('text')
    expect(lineOf('123. Etappe').kind).toBe('text')
    expect(lineOf('\\- kein Punkt')).toEqual({ kind: 'text', parts: [plain('- kein Punkt')] })
    expect(lineOf('2\\. Etappe')).toEqual({ kind: 'text', parts: [plain('2. Etappe')] })
  })

  it('lineOfAnEmptyLineTest', () => {
    expect(lineOf('   ')).toEqual({ kind: 'text', parts: [] })
  })
})

describe('liteLines', () => {
  /** Both lists, plain lines and empty lines between them. */
  it('liteLinesTest', () => {
    const lines = liteLines('Workshop\n\n- Wireframes\n- **Review**\n1. Konzept\r\n2. Offerte')

    expect(lines.map((line) => line.kind)).toEqual(['text', 'bullet', 'bullet', 'number', 'number'])
    expect(lines[2].parts).toEqual([bold('Review')])
  })

  it('liteLinesOfNothingTest', () => {
    expect(liteLines(null)).toEqual([])
    expect(liteLines('')).toEqual([])
    expect(liteLines('\n \n')).toEqual([])
  })
})

describe('editorLines', () => {
  /** The editor keeps empty lines: one the user has just started is still there. */
  it('editorLinesTest', () => {
    expect(editorLines('A\n\n- B').map((line) => line.kind)).toEqual(['text', 'text', 'bullet'])
    expect(editorLines('A\n\n- B')[1].parts).toEqual([])
  })

  it('editorLinesOfNothingTest', () => {
    expect(editorLines('')).toEqual([{ kind: 'text', parts: [] }])
    expect(editorLines(undefined)).toEqual([{ kind: 'text', parts: [] }])
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
    expect(plainLine('Ticket 4711, 2\\*3')).toBe('Ticket 4711, 2*3')
    expect(plainLine(undefined)).toBe('')
  })
})

describe('writeParts', () => {
  it('writePartsTest', () => {
    expect(writeParts([plain('Konzept '), bold('abgenommen'), plain(' und '), italic('versendet')])).toBe(
      'Konzept **abgenommen** und *versendet*',
    )
  })

  /** Bold and italic overlap: the markers open and close where each mark changes. */
  it('writePartsWithBothMarksTest', () => {
    expect(writeParts([both('beides')])).toBe('***beides***')
    expect(writeParts([bold('a'), both('b')])).toBe('**a*b***')
    expect(writeParts([italic('a'), bold('b')])).toBe('*a***b**')
  })

  /** A blank at the edge of a set off stretch stands outside it; between two bold words in. */
  it('writePartsWithBlanksAtTheEdgeTest', () => {
    expect(writeParts([bold('fett '), plain('normal')])).toBe('**fett** normal')
    expect(writeParts([plain('a'), italic(' b')])).toBe('a *b*')
    expect(writeParts([bold('a'), plain(' '), bold('b')])).toBe('**a b**')
    expect(writeParts([bold(' ')])).toBe(' ')
  })

  /** Stars and backslashes of the text keep a backslash. */
  it('writePartsWithStarsTest', () => {
    expect(writeParts([plain('2*3 \\ 4')])).toBe('2\\*3 \\\\ 4')
    expect(writeParts([bold('*')])).toBe('**\\***')
  })

  it('writePartsOfNothingTest', () => {
    expect(writeParts([])).toBe('')
  })

  /** What is written reads back as the same stretches. */
  it('writePartsRoundTripTest', () => {
    const cases: InlinePart[][] = [
      [bold('a'), italic('b'), plain('c')],
      [italic('a'), bold('b'), both('c'), plain('d*e')],
      [plain('**kein**'), bold('\\')],
      [both('x'), italic('y')],
    ]
    for (const parts of cases) {
      expect(inlineParts(writeParts(parts))).toEqual(parts)
    }
  })
})

describe('writeLines', () => {
  it('writeLinesTest', () => {
    const lines: LiteLine[] = [
      { kind: 'text', parts: [plain('Workshop')] },
      { kind: 'bullet', parts: [plain('Wireframes')] },
      { kind: 'bullet', parts: [bold('Review')] },
      { kind: 'number', parts: [plain('Konzept')] },
      { kind: 'number', parts: [plain('Offerte')] },
    ]

    expect(writeLines(lines)).toBe('Workshop\n- Wireframes\n- **Review**\n1. Konzept\n2. Offerte')
  })

  /** A numbered list counts from 1 again after any other line. */
  it('writeLinesCountsEachListTest', () => {
    const lines: LiteLine[] = [
      { kind: 'number', parts: [plain('A')] },
      { kind: 'text', parts: [plain('Zwischentext')] },
      { kind: 'number', parts: [plain('B')] },
      { kind: 'number', parts: [plain('C')] },
    ]

    expect(writeLines(lines)).toBe('1. A\nZwischentext\n1. B\n2. C')
  })

  /** A plain line that would read as a list keeps its marker as typed. */
  it('writeLinesWithAListMarkerInPlainTextTest', () => {
    const lines: LiteLine[] = [
      { kind: 'text', parts: [plain('- kein Punkt')] },
      { kind: 'text', parts: [plain('2. Etappe')] },
      { kind: 'text', parts: [plain('-Wort')] },
    ]

    expect(writeLines(lines)).toBe('\\- kein Punkt\n2\\. Etappe\n-Wort')
    expect(liteLines(writeLines(lines)).map((line) => line.kind)).toEqual(['text', 'text', 'text'])
  })

  /** An empty line of any kind is an empty line. */
  it('writeLinesWithEmptyLinesTest', () => {
    expect(writeLines([{ kind: 'text', parts: [] }])).toBe('')
    expect(
      writeLines([
        { kind: 'bullet', parts: [plain('A')] },
        { kind: 'bullet', parts: [] },
      ]),
    ).toBe('- A\n')
  })
})
