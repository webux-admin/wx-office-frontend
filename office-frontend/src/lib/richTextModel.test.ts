import { describe, expect, it } from 'vitest'
import { editorLines, writeLines, type InlinePart, type LiteLine } from './markdownLite'
import {
  autoList,
  caretAt,
  carries,
  comparePoints,
  endOf,
  insertText,
  isBlank,
  isCaret,
  listed,
  marksAt,
  NO_MARKS,
  partsOf,
  removeSpan,
  spanOf,
  splitBlock,
  textOf,
  toggleList,
  toggleMark,
  unlist,
  type Span,
} from './richTextModel'

const plain = (text: string): InlinePart => ({ text, bold: false, italic: false })
const bold = (text: string): InlinePart => ({ text, bold: true, italic: false })

/** A selection from line and offset to line and offset. */
const span = (startBlock: number, start: number, endBlock: number, end: number): Span => ({
  start: { block: startBlock, offset: start },
  end: { block: endBlock, offset: end },
})

/** What the lines would be stored as, the shortest way to compare them. */
const stored = (blocks: LiteLine[]) => writeLines(blocks)

describe('textOf', () => {
  it('textOfTest', () => {
    expect(textOf({ kind: 'text', parts: [plain('Konzept '), bold('fertig')] })).toBe('Konzept fertig')
    expect(textOf({ kind: 'text', parts: [] })).toBe('')
  })
})

describe('comparePoints and spanOf', () => {
  it('comparePointsTest', () => {
    expect(comparePoints({ block: 0, offset: 5 }, { block: 1, offset: 0 })).toBeLessThan(0)
    expect(comparePoints({ block: 1, offset: 3 }, { block: 1, offset: 1 })).toBeGreaterThan(0)
    expect(comparePoints({ block: 2, offset: 2 }, { block: 2, offset: 2 })).toBe(0)
  })

  /** A selection made backwards starts at its focus. */
  it('spanOfTest', () => {
    expect(spanOf({ block: 1, offset: 2 }, { block: 0, offset: 4 })).toEqual(span(0, 4, 1, 2))
    expect(isCaret(spanOf({ block: 0, offset: 1 }, { block: 0, offset: 1 }))).toBe(true)
  })
})

describe('endOf and isBlank', () => {
  it('endOfTest', () => {
    expect(endOf(editorLines('Ein\nZwei'))).toEqual({ block: 1, offset: 4 })
  })

  /** Only one empty plain line shows the placeholder; an empty entry of a list does not. */
  it('isBlankTest', () => {
    expect(isBlank(editorLines(''))).toBe(true)
    expect(isBlank([{ kind: 'bullet', parts: [] }])).toBe(false)
    expect(isBlank(editorLines('\n'))).toBe(false)
    expect(isBlank(editorLines('x'))).toBe(false)
  })
})

describe('marksAt and carries', () => {
  const blocks = editorLines('ab **cd** ef')

  /** Typing goes on with the character before the caret, at the start with the first one. */
  it('marksAtTest', () => {
    expect(marksAt(blocks, { block: 0, offset: 5 })).toEqual({ bold: true, italic: false })
    expect(marksAt(blocks, { block: 0, offset: 7 })).toEqual(NO_MARKS)
    expect(marksAt(editorLines('**x**'), { block: 0, offset: 0 })).toEqual({ bold: true, italic: false })
    expect(marksAt(editorLines(''), { block: 0, offset: 0 })).toEqual(NO_MARKS)
  })

  it('carriesTest', () => {
    expect(carries(blocks, span(0, 3, 0, 5), 'bold')).toBe(true)
    expect(carries(blocks, span(0, 2, 0, 5), 'bold')).toBe(false)
    expect(carries(blocks, caretAt({ block: 0, offset: 4 }), 'bold')).toBe(true)
    expect(carries(blocks, span(0, 3, 0, 5), 'italic')).toBe(false)
  })
})

describe('listed', () => {
  it('listedTest', () => {
    const blocks = editorLines('- A\n- B\nC')
    expect(listed(blocks, span(0, 0, 1, 1), 'bullet')).toBe(true)
    expect(listed(blocks, span(0, 0, 2, 1), 'bullet')).toBe(false)
    expect(listed(blocks, span(0, 0, 0, 0), 'number')).toBe(false)
  })
})

describe('toggleMark', () => {
  it('toggleMarkTest', () => {
    const change = toggleMark(editorLines('Konzept abgenommen'), span(0, 8, 0, 18), 'bold')

    expect(stored(change.blocks)).toBe('Konzept **abgenommen**')
    expect(change.selection).toEqual(span(0, 8, 0, 18))
  })

  /** Where all of the selection carries the mark, it goes; where part does, all of it gets it. */
  it('toggleMarkTakesItAwayTest', () => {
    expect(stored(toggleMark(editorLines('**fett**'), span(0, 0, 0, 4), 'bold').blocks)).toBe('fett')
    expect(stored(toggleMark(editorLines('a **b** c'), span(0, 0, 0, 5), 'bold').blocks)).toBe('**a b c**')
  })

  /** Over two lines, each line keeps its kind. */
  it('toggleMarkOverSeveralLinesTest', () => {
    const change = toggleMark(editorLines('- eins\n- zwei'), span(0, 2, 1, 2), 'italic')

    expect(stored(change.blocks)).toBe('- ei*ns*\n- *zw*ei')
  })

  it('toggleMarkAtACaretTest', () => {
    const blocks = editorLines('Text')
    expect(toggleMark(blocks, caretAt({ block: 0, offset: 2 }), 'bold').blocks).toBe(blocks)
  })
})

describe('toggleList', () => {
  it('toggleListTest', () => {
    expect(stored(toggleList(editorLines('Wireframes\nReview'), span(0, 0, 1, 3), 'bullet').blocks)).toBe(
      '- Wireframes\n- Review',
    )
  })

  /** All lines a list of the kind already: they become plain lines; otherwise all become one. */
  it('toggleListBackTest', () => {
    expect(stored(toggleList(editorLines('1. A\n2. B'), span(0, 0, 1, 0), 'number').blocks)).toBe('A\nB')
    expect(stored(toggleList(editorLines('- A\nB'), span(0, 0, 1, 0), 'number').blocks)).toBe('1. A\n2. B')
  })

  it('toggleListOfAnEmptyLineTest', () => {
    const change = toggleList(editorLines(''), caretAt({ block: 0, offset: 0 }), 'bullet')
    expect(change.blocks).toEqual([{ kind: 'bullet', parts: [] }])
  })
})

describe('removeSpan', () => {
  /** Over two lines: the first keeps its kind and takes the rest of the last. */
  it('removeSpanTest', () => {
    const change = removeSpan(editorLines('- Wire\nframes\nReview'), span(0, 4, 2, 2))

    expect(stored(change.blocks)).toBe('- Wireview')
    expect(change.selection).toEqual(caretAt({ block: 0, offset: 4 }))
  })

  it('removeSpanAtACaretTest', () => {
    const blocks = editorLines('Text')
    expect(removeSpan(blocks, caretAt({ block: 0, offset: 1 })).blocks).toBe(blocks)
  })
})

describe('insertText', () => {
  it('insertTextTest', () => {
    const change = insertText(editorLines('Kon abgenommen'), caretAt({ block: 0, offset: 3 }), 'zept', NO_MARKS)

    expect(stored(change.blocks)).toBe('Konzept abgenommen')
    expect(change.selection).toEqual(caretAt({ block: 0, offset: 7 }))
  })

  /** A line break starts a line of the same kind, so pasted lines in a list stay entries. */
  it('insertTextWithLinesTest', () => {
    const change = insertText(editorLines('- A'), caretAt({ block: 0, offset: 1 }), 'x\r\ny\nz', NO_MARKS)

    expect(stored(change.blocks)).toBe('- Ax\n- y\n- z')
    expect(change.selection).toEqual(caretAt({ block: 2, offset: 1 }))
  })

  /** It replaces the selection and carries the marks it is given; a tab becomes a blank. */
  it('insertTextOverASelectionTest', () => {
    const change = insertText(editorLines('alt alt'), span(0, 4, 0, 7), 'neu\tB', { bold: true, italic: false })

    expect(stored(change.blocks)).toBe('alt **neu B**')
  })

  /** A star typed is a star, never a marker. */
  it('insertTextWithAStarTest', () => {
    const change = insertText(editorLines(''), caretAt({ block: 0, offset: 0 }), '2*3*4', NO_MARKS)

    expect(stored(change.blocks)).toBe('2\\*3\\*4')
    expect(textOf(editorLines(stored(change.blocks))[0])).toBe('2*3*4')
  })
})

describe('splitBlock', () => {
  /** A list goes on with its next entry; the text after the caret goes with it. */
  it('splitBlockTest', () => {
    const change = splitBlock(editorLines('- WireframesReview'), caretAt({ block: 0, offset: 10 }))

    expect(stored(change.blocks)).toBe('- Wireframes\n- Review')
    expect(change.selection).toEqual(caretAt({ block: 1, offset: 0 }))
  })

  /** On an empty entry the list ends: no line is added. */
  it('splitBlockOnAnEmptyEntryTest', () => {
    const change = splitBlock(
      [
        { kind: 'bullet', parts: [plain('A')] },
        { kind: 'bullet', parts: [] },
      ],
      caretAt({ block: 1, offset: 0 }),
    )

    expect(change.blocks).toHaveLength(2)
    expect(change.blocks[1].kind).toBe('text')
  })

  it('splitBlockOfAPlainLineTest', () => {
    const change = splitBlock(editorLines('**fett**normal'), span(0, 4, 0, 4))
    expect(stored(change.blocks)).toBe('**fett**\nnormal')
  })
})

describe('unlist', () => {
  it('unlistTest', () => {
    const change = unlist(editorLines('- A\n- B'), { block: 1, offset: 0 })

    expect(stored(change.blocks)).toBe('- A\nB')
    expect(change.selection).toEqual(caretAt({ block: 1, offset: 0 }))
  })
})

describe('autoList', () => {
  /** «- », «* » and «1. » at the start of a plain line start a list, the characters go. */
  it('autoListTest', () => {
    const bullet = autoList([{ kind: 'text', parts: [plain('- ')] }], { block: 0, offset: 2 })
    expect(bullet?.blocks).toEqual([{ kind: 'bullet', parts: [] }])
    expect(bullet?.selection).toEqual(caretAt({ block: 0, offset: 0 }))

    const star = autoList([{ kind: 'text', parts: [plain('* Punkt')] }], { block: 0, offset: 2 })
    expect(star?.blocks).toEqual([{ kind: 'bullet', parts: [plain('Punkt')] }])

    const number = autoList([{ kind: 'text', parts: [plain('12. ')] }], { block: 0, offset: 4 })
    expect(number?.blocks[0].kind).toBe('number')
  })

  /** Elsewhere in the line, in a list already, or without the blank nothing happens. */
  it('autoListWithoutAStartTest', () => {
    expect(autoList([{ kind: 'text', parts: [plain('a - ')] }], { block: 0, offset: 4 })).toBeNull()
    expect(autoList([{ kind: 'text', parts: [plain('- x')] }], { block: 0, offset: 3 })).toBeNull()
    expect(autoList([{ kind: 'bullet', parts: [plain('- ')] }], { block: 0, offset: 2 })).toBeNull()
    expect(autoList([{ kind: 'text', parts: [plain('123. ')] }], { block: 0, offset: 5 })).toBeNull()
  })
})

describe('partsOf', () => {
  it('partsOfTest', () => {
    expect(
      partsOf([
        { char: 'a', bold: true, italic: false },
        { char: 'b', bold: true, italic: false },
        { char: 'c', bold: false, italic: false },
      ]),
    ).toEqual([bold('ab'), plain('c')])
    expect(partsOf([])).toEqual([])
  })
})
