// @vitest-environment jsdom
import { act, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FormattedText } from './FormattedText'
import { MarkdownLine } from './MarkdownLine'
import { RichTextField } from './RichTextField'
import { readSelection, selectSpan } from './richTextDom'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
/** What the field handed out last, `undefined` while it handed out nothing. */
let held: string | undefined
/** Lets a test change the value from outside, the way a form resets it. */
const outside: { set: (value: string) => void } = { set: () => {} }

beforeEach(() => {
  held = undefined
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Editor({
  initial,
  maxLength = 1000,
  enterKey,
}: {
  initial: string
  maxLength?: number
  enterKey?: 'form' | 'newLine'
}) {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    outside.set = setValue
  }, [])
  return (
    <RichTextField
      label="Text"
      value={value}
      maxLength={maxLength}
      enterKey={enterKey}
      placeholder="Was wurde gemacht?"
      onChange={(next) => {
        held = next
        setValue(next)
      }}
    />
  )
}

const box = () => container.querySelector('[role="textbox"]') as HTMLDivElement
const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement
const lineKinds = () => [...box().children].map((line) => (line as HTMLElement).dataset.block)

function render(initial: string, options: { maxLength?: number; enterKey?: 'form' | 'newLine' } = {}) {
  act(() => root.render(<Editor initial={initial} {...options} />))
}

/** Puts the focus into the box and selects from one place to another. */
function select(startBlock: number, start: number, endBlock = startBlock, end = start) {
  act(() => {
    box().focus()
    selectSpan(box(), { start: { block: startBlock, offset: start }, end: { block: endBlock, offset: end } })
  })
}

function press(key: string, modifiers: KeyboardEventInit = {}): boolean {
  let handled = false
  act(() => {
    handled = !box().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
    )
  })
  return handled
}

/**
 * Types at the caret the way a browser does: it asks first with `beforeinput`, and where the box
 * lets it, it writes the characters into the text node and tells with `input`.
 */
function type(text: string) {
  act(() => {
    const element = box()
    const asked = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: text,
      bubbles: true,
      cancelable: true,
    })
    if (!element.dispatchEvent(asked)) return
    const selection = document.getSelection()!
    let node = selection.anchorNode!
    let offset = selection.anchorOffset
    if (node.nodeType !== Node.TEXT_NODE) {
      const line = node as Element
      line.querySelector('br')?.remove()
      const empty = document.createTextNode('')
      line.insertBefore(empty, line.childNodes[offset] ?? null)
      node = empty
      offset = 0
    }
    ;(node as Text).insertData(offset, text)
    selection.collapse(node, offset + text.length)
    element.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }))
  })
}

function paste(text: string) {
  act(() => {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
    box().dispatchEvent(event)
  })
}

/** Deletes the character before the caret the way a browser does with Backspace in a line. */
function erase() {
  act(() => {
    const element = box()
    const asked = new InputEvent('beforeinput', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      cancelable: true,
    })
    if (!element.dispatchEvent(asked)) return
    const selection = document.getSelection()!
    const node = selection.anchorNode as Text
    const offset = selection.anchorOffset
    node.deleteData(offset - 1, 1)
    selection.collapse(node, offset - 1)
    element.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }))
  })
}

describe('RichTextField', () => {
  /** The bar stands on top of the text, always, and its buttons take no tab stop. */
  it('richTextFieldShowsTheBarOnTopTest', () => {
    render('')

    const bar = container.querySelector('[role="toolbar"]') as HTMLElement
    expect(bar.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect([...bar.querySelectorAll('button')].map((entry) => entry.getAttribute('aria-label'))).toEqual([
      'Fett',
      'Kursiv',
      'Aufzählung',
      'Nummerierte Liste',
    ])
    expect([...bar.querySelectorAll('button')].every((entry) => entry.tabIndex === -1)).toBe(true)
  })

  /** A bold word stands bold and a list has its points; no marker is seen. */
  it('richTextFieldShowsTheTextAsItReadsTest', () => {
    render('Konzept **fertig** und *versendet*\n- Review')

    expect(box().textContent).toBe('Konzept fertig und versendetReview')
    expect(box().querySelector('strong')?.textContent).toBe('fertig')
    expect(box().querySelector('em')?.textContent).toBe('versendet')
    expect(lineKinds()).toEqual(['text', 'bullet'])
  })

  /** Ctrl+B sets the selection bold, the selection stays on the word, and «Fett» shows pressed. */
  it('richTextFieldMakesBoldWithTheKeyboardTest', () => {
    render('Konzept abgenommen')
    select(0, 8, 0, 18)

    expect(press('b', { ctrlKey: true })).toBe(true)

    expect(held).toBe('Konzept **abgenommen**')
    expect(box().querySelector('strong')?.textContent).toBe('abgenommen')
    expect(readSelection(box())).toEqual({ start: { block: 0, offset: 8 }, end: { block: 0, offset: 18 } })
    expect(button('Fett').getAttribute('aria-pressed')).toBe('true')
  })

  it('richTextFieldMakesItalicWithTheBarTest', () => {
    render('Konzept')
    select(0, 0, 0, 7)

    act(() => button('Kursiv').click())

    expect(held).toBe('*Konzept*')
    expect(button('Kursiv').getAttribute('aria-pressed')).toBe('true')
  })

  /** At a caret the mark waits for what is typed next, and typing goes on with it. */
  it('richTextFieldTypesBoldAfterTheButtonTest', () => {
    render('Konzept')
    select(0, 7)
    type(' ')

    press('b', { metaKey: true })
    expect(held).toBe('Konzept ')
    expect(button('Fett').getAttribute('aria-pressed')).toBe('true')
    type('fertig')
    type('!')

    expect(held).toBe('Konzept **fertig!**')
  })

  /** A star typed is a star: it is stored with a backslash and shown as typed. */
  it('richTextFieldKeepsATypedStarTest', () => {
    render('')
    select(0, 0)

    type('2*3*4')

    expect(held).toBe('2\\*3\\*4')
    expect(box().textContent).toBe('2*3*4')
    expect(box().querySelector('em')).toBeNull()
  })

  /** The bar's button turns the lines into a list and back. */
  it('richTextFieldMakesAListWithTheBarTest', () => {
    render('Wireframes\nReview')
    select(0, 0, 1, 6)

    act(() => button('Aufzählung').click())

    expect(held).toBe('- Wireframes\n- Review')
    expect([...box().children].map((line) => (line as HTMLElement).dataset.marker)).toEqual(['•', '•'])
    expect(button('Aufzählung').getAttribute('aria-pressed')).toBe('true')

    select(0, 0, 1, 6)
    press('7', { ctrlKey: true, shiftKey: true, code: 'Digit7' })
    expect(held).toBe('1. Wireframes\n2. Review')
  })

  /** «- » at the start of a line starts a list; the characters go. */
  it('richTextFieldStartsAListWithAMarkerTest', () => {
    render('')
    select(0, 0)

    type('-')
    type(' ')
    expect(lineKinds()).toEqual(['bullet'])
    type('Punkt')

    expect(held).toBe('- Punkt')
  })

  /** Shift+Enter goes on with the list; with the form taking Enter, plain Enter reaches it. */
  it('richTextFieldGoesOnWithTheListTest', () => {
    render('- Wireframes', { enterKey: 'form' })
    select(0, 12)

    expect(press('Enter', { shiftKey: true })).toBe(true)
    expect(lineKinds()).toEqual(['bullet', 'bullet'])
    type('Review')
    expect(held).toBe('- Wireframes\n- Review')

    expect(press('Enter')).toBe(false)
    expect(lineKinds()).toEqual(['bullet', 'bullet'])
  })

  /** Without the form, Enter is a new line like in any text area; on an empty entry it ends the list. */
  it('richTextFieldMakesANewLineWithEnterTest', () => {
    render('- A')
    select(0, 1)

    press('Enter')
    press('Enter')

    expect(lineKinds()).toEqual(['bullet', 'text'])
    type('Danach')
    expect(held).toBe('- A\nDanach')
  })

  /** Backspace at the start of an entry takes the line out of the list first. */
  it('richTextFieldEndsTheListWithBackspaceTest', () => {
    render('- A\n- B')
    select(1, 0)

    expect(press('Backspace')).toBe(true)

    expect(held).toBe('- A\nB')
    expect(press('Backspace')).toBe(false)
  })

  /** A format that would run over the longest text is not set, and the box stays as it was. */
  it('richTextFieldAtTheLongestTextTest', () => {
    render('x'.repeat(10), { maxLength: 10 })
    select(0, 0, 0, 10)

    press('b', { ctrlKey: true })

    expect(held).toBeUndefined()
    expect(box().querySelector('strong')).toBeNull()
    expect(box().textContent).toBe('x'.repeat(10))
  })

  /** Typing over the limit is taken back. */
  it('richTextFieldRefusesTypingOverTheLimitTest', () => {
    render('abc', { maxLength: 4 })
    select(0, 3)

    type('d')
    type('e')

    expect(held).toBe('abcd')
    expect(box().textContent).toBe('abcd')
  })

  /** Pasted text comes in plain, as much as the limit leaves room for. */
  it('richTextFieldPastesPlainTextTest', () => {
    render('- A', { maxLength: 12 })
    select(0, 1)

    paste('**x**\nzweite Zeile')

    expect(held).toBe('- A\\*\\*x\\*\\*')
    expect(box().textContent).toBe('A**x**')
  })

  it('richTextFieldPastesLinesTest', () => {
    render('- A')
    select(0, 1)

    paste('\nB\nC')

    expect(held).toBe('- A\n- B\n- C')
  })

  /** «Rückgängig» and «Wiederholen» are the field's own. */
  it('richTextFieldUndoesAndRedoesTest', () => {
    render('Konzept')
    select(0, 0, 0, 7)
    press('b', { ctrlKey: true })
    expect(held).toBe('**Konzept**')

    press('z', { ctrlKey: true })
    expect(held).toBe('Konzept')
    expect(box().querySelector('strong')).toBeNull()

    press('y', { ctrlKey: true })
    expect(held).toBe('**Konzept**')
  })

  /** Typing without a pause goes back in one step. */
  it('richTextFieldUndoesTypingInOneStepTest', () => {
    render('')
    select(0, 0)
    type('a')
    type('b')
    type('c')

    press('z', { ctrlKey: true })

    expect(held).toBe('')
  })

  /** A deletion right after typing is a step of its own, and so is typing somewhere else. */
  it('richTextFieldUndoesADeletionOnItsOwnTest', () => {
    render('')
    select(0, 0)
    type('abc')
    erase()
    expect(held).toBe('ab')

    press('z', { ctrlKey: true })
    expect(held).toBe('abc')

    select(0, 0)
    type('x')
    press('z', { ctrlKey: true })
    expect(held).toBe('abc')
  })

  /** A value set from outside — a form after saving — is drawn; an unchanged one is not. */
  it('richTextFieldFollowsTheValueTest', () => {
    render('**alt**')

    act(() => outside.set('- neu'))
    expect(lineKinds()).toEqual(['bullet'])
    expect(box().textContent).toBe('neu')

    act(() => outside.set(''))
    expect(box().dataset.empty).toBe('true')
  })

  /** The counter shows once the text nears its limit. */
  it('richTextFieldCountsNearTheLimitTest', () => {
    render('x'.repeat(7), { maxLength: 10 })
    expect(container.textContent).not.toContain('/ 10')

    act(() => outside.set('x'.repeat(8)))
    expect(container.textContent).toContain('8 / 10')
  })

  /** A text box with several lines, named by its label, and the label puts the focus in it. */
  it('richTextFieldIsALabelledTextBoxTest', () => {
    render('')

    const label = container.querySelector('label') as HTMLLabelElement
    expect(box().getAttribute('aria-multiline')).toBe('true')
    expect(box().getAttribute('aria-labelledby')).toBe(label.id)
    expect(label.htmlFor).toBe(box().id)
    expect(box().getAttribute('aria-placeholder')).toBe('Was wurde gemacht?')

    act(() => label.click())
    expect(document.activeElement).toBe(box())
  })
})

describe('MarkdownLine', () => {
  /** A list stands on one line, bold as bold, the whole text without markers in the tooltip. */
  it('markdownLineTest', () => {
    act(() => root.render(<MarkdownLine text={'- Wireframes\n- **Review** mit Kunde'} />))

    const line = container.querySelector('span') as HTMLSpanElement
    expect(line.textContent).toBe('Wireframes · Review mit Kunde')
    expect(container.querySelector('strong')?.textContent).toBe('Review')
    expect(line.title).toBe('Wireframes · Review mit Kunde')
  })

  /** Markup is text: no element comes of it. */
  it('markdownLineWithMarkupTest', () => {
    act(() => root.render(<MarkdownLine text="<script>alert(1)</script> *x*" />))

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toBe('<script>alert(1)</script> x')
    expect(container.querySelector('em')?.textContent).toBe('x')
  })

  it('markdownLineWithoutTextTest', () => {
    act(() => root.render(<MarkdownLine text={null} />))

    expect(container.innerHTML).toBe('')
  })
})

describe('FormattedText', () => {
  /** Lines as paragraphs, a list as a list, a numbered list counted from 1, both marks nested. */
  it('formattedTextTest', () => {
    act(() =>
      root.render(<FormattedText text={'Termin **nach** Absprache\n- Material\n- ***Montage***\n4. Eins\n7. Zwei'} />),
    )

    expect(container.querySelector('p')?.textContent).toBe('Termin nach Absprache')
    expect([...container.querySelectorAll('ul li')].map((item) => item.textContent)).toEqual([
      'Material',
      'Montage',
    ])
    expect(container.querySelector('ul strong em')?.textContent).toBe('Montage')
    const numbered = container.querySelector('ol') as HTMLOListElement
    expect(numbered.start).toBe(1)
    expect(numbered.children).toHaveLength(2)
  })

  it('formattedTextWithMarkupTest', () => {
    act(() => root.render(<FormattedText text="<img src=x onerror=alert(1)>" />))

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('formattedTextWithoutTextTest', () => {
    act(() => root.render(<FormattedText text={'\n  \n'} />))

    expect(container.innerHTML).toBe('')
  })
})
