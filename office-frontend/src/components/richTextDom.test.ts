// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editorLines, writeLines } from '../lib/markdownLite'
import { readBlocks, readSelection, renderBlocks, selectSpan } from './richTextDom'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  root.contentEditable = 'true'
  document.body.appendChild(root)
})

afterEach(() => root.remove())

/** What the box holds, in the stored form. */
const stored = () => writeLines(readBlocks(root).blocks)

describe('renderBlocks', () => {
  /** Bold as strong, italic as em, the point of a list as an attribute and no character. */
  it('renderBlocksTest', () => {
    renderBlocks(root, editorLines('Workshop **fertig**\n- *Review*\n1. Konzept\n2. Offerte'))

    const lines = [...root.children] as HTMLElement[]
    expect(lines.map((line) => line.dataset.block)).toEqual(['text', 'bullet', 'number', 'number'])
    expect(lines[0].innerHTML).toBe('Workshop <strong>fertig</strong>')
    expect(lines[1].innerHTML).toBe('<em>Review</em>')
    expect(lines.map((line) => line.dataset.marker)).toEqual([undefined, '•', '1.', '2.'])
    expect(root.textContent).toBe('Workshop fertigReviewKonzeptOfferte')
  })

  /** Bold and italic at once nest; markup in the text stays text. */
  it('renderBlocksWithBothMarksAndMarkupTest', () => {
    renderBlocks(root, editorLines('***<b>x</b>***'))

    expect(root.innerHTML).toBe('<div data-block="text"><strong><em>&lt;b&gt;x&lt;/b&gt;</em></strong></div>')
  })

  /** An empty line holds a br, and the empty box carries the placeholder. */
  it('renderBlocksOfAnEmptyTextTest', () => {
    renderBlocks(root, editorLines(''), 'Was wurde gemacht?')

    expect(root.dataset.empty).toBe('true')
    expect((root.firstElementChild as HTMLElement).dataset.placeholder).toBe('Was wurde gemacht?')
    expect(root.firstElementChild?.innerHTML).toBe('<br>')

    renderBlocks(root, editorLines('x'), 'Was wurde gemacht?')
    expect(root.dataset.empty).toBe('false')
    expect((root.firstElementChild as HTMLElement).dataset.placeholder).toBeUndefined()
  })

  /** A numbered list counts from 1 again after another line. */
  it('renderBlocksCountsEachListTest', () => {
    renderBlocks(root, editorLines('1. A\nB\n1. C'))

    expect([...root.children].map((line) => (line as HTMLElement).dataset.marker)).toEqual([
      '1.',
      undefined,
      '1.',
    ])
  })
})

describe('readBlocks', () => {
  /** What the editor drew reads back as the same text. */
  it('readBlocksTest', () => {
    const text = 'Workshop **fertig** und *mehr*\n- ***A***\n1. B\n\n2\\*3'
    renderBlocks(root, editorLines(text))

    expect(stored()).toBe(text)
  })

  /** What browsers make of a box: b and i, styled spans, a loose line, list items, hard blanks. */
  it('readBlocksOfWhatABrowserWroteTest', () => {
    root.innerHTML =
      'lose <b>fett</b><div>neu <span style="font-weight: 700">auch</span>&nbsp;<i>schief</i></div>' +
      '<ul><li>Punkt</li></ul><ol><li>Eins</li></ol><p><span style="font-style: italic">x</span>​</p>'

    expect(stored()).toBe('lose **fett**\nneu **auch** *schief*\n- Punkt\n1. Eins\n*x*')
  })

  /** A style that takes the mark away again inside a marked element. */
  it('readBlocksWithAStyleThatUndoesAMarkTest', () => {
    root.innerHTML = '<div><strong>a<span style="font-weight: normal">b</span></strong></div>'

    expect(stored()).toBe('**a**b')
  })

  it('readBlocksOfAnEmptyBoxTest', () => {
    expect(readBlocks(root).blocks).toEqual([{ kind: 'text', parts: [] }])
    root.innerHTML = '<br>'
    expect(readBlocks(root).blocks).toEqual([{ kind: 'text', parts: [] }])
  })

  /** A place in a text node, at an element and between lines. */
  it('readBlocksFindsPlacesTest', () => {
    renderBlocks(root, editorLines('ab **cd**\n\n- ef'))
    const strongText = root.querySelector('strong')!.firstChild!

    const { points } = readBlocks(root, [
      { node: strongText, offset: 1 },
      { node: root.children[1], offset: 0 },
      { node: root, offset: 2 },
      { node: root, offset: 3 },
    ])

    expect(points).toEqual([
      { block: 0, offset: 4 },
      { block: 1, offset: 0 },
      { block: 2, offset: 0 },
      { block: 2, offset: 2 },
    ])
  })
})

describe('readSelection and selectSpan', () => {
  /** A selection set by place reads back as the same places. */
  it('selectSpanTest', () => {
    renderBlocks(root, editorLines('Konzept **abgenommen**\n- Review'))

    selectSpan(root, { start: { block: 0, offset: 8 }, end: { block: 1, offset: 3 } })

    expect(document.getSelection()?.toString()).toBe('abgenommenRev')
    expect(readSelection(root)).toEqual({ start: { block: 0, offset: 8 }, end: { block: 1, offset: 3 } })
  })

  /** Between two stretches the caret goes to the end of the first, so typing keeps its marks. */
  it('selectSpanBetweenStretchesTest', () => {
    renderBlocks(root, editorLines('**fett**normal'))

    selectSpan(root, { start: { block: 0, offset: 4 }, end: { block: 0, offset: 4 } })

    const selection = document.getSelection()!
    expect(selection.anchorNode?.parentElement?.tagName).toBe('STRONG')
    expect(selection.anchorOffset).toBe(4)
  })

  /** On an empty line the caret goes into the line itself. */
  it('selectSpanOnAnEmptyLineTest', () => {
    renderBlocks(root, editorLines('A\n'))

    selectSpan(root, { start: { block: 1, offset: 0 }, end: { block: 1, offset: 0 } })

    expect(document.getSelection()?.anchorNode).toBe(root.children[1])
    expect(readSelection(root)).toEqual({ start: { block: 1, offset: 0 }, end: { block: 1, offset: 0 } })
  })

  /** A selection outside the box is none of its business. */
  it('readSelectionOutsideTheBoxTest', () => {
    const outside = document.createElement('p')
    outside.textContent = 'anderswo'
    document.body.appendChild(outside)
    document.getSelection()?.setBaseAndExtent(outside.firstChild!, 0, outside.firstChild!, 3)

    expect(readSelection(root)).toBeNull()
    outside.remove()
  })
})
