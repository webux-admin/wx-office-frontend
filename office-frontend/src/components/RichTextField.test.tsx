// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MarkdownLine } from './MarkdownLine'
import { RichTextField } from './RichTextField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
/** What the field held after the last change. */
let held: string

beforeEach(() => {
  held = ''
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Editor({ initial, maxLength = 1000 }: { initial: string; maxLength?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <RichTextField
      label="Text"
      value={value}
      maxLength={maxLength}
      onChange={(next) => {
        held = next
        setValue(next)
      }}
    />
  )
}

const area = () => container.querySelector('textarea') as HTMLTextAreaElement
const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement

function render(initial: string, maxLength?: number) {
  act(() => root.render(<Editor initial={initial} maxLength={maxLength} />))
}

function select(start: number, end: number) {
  act(() => {
    area().focus()
    area().setSelectionRange(start, end)
  })
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
  act(() => {
    area().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
    )
  })
}

describe('RichTextField', () => {
  /** Ctrl+B sets the selection bold, and the selection stays on the same word. */
  it('richTextFieldMakesBoldWithTheKeyboardTest', () => {
    render('Konzept abgenommen')
    select(8, 18)

    press('b', { ctrlKey: true })

    expect(held).toBe('Konzept **abgenommen**')
    expect([area().selectionStart, area().selectionEnd]).toEqual([10, 20])
  })

  it('richTextFieldMakesItalicWithTheKeyboardTest', () => {
    render('Konzept')
    select(0, 7)

    press('i', { metaKey: true })

    expect(held).toBe('*Konzept*')
  })

  /** The bar appears with the focus, and its list button turns the lines into a list. */
  it('richTextFieldMakesAListWithTheBarTest', () => {
    render('Wireframes\nReview')
    expect(button('Aufzählung')).toBeNull()
    select(0, 17)

    act(() => button('Aufzählung').click())

    expect(held).toBe('- Wireframes\n- Review')
    expect(container.textContent).toContain('21 / 1000')
  })

  /** Shift+Enter goes on with the list; plain Enter is left to the form. */
  it('richTextFieldGoesOnWithTheListTest', () => {
    render('- Wireframes')
    select(12, 12)

    press('Enter', { shiftKey: true })
    expect(held).toBe('- Wireframes\n- ')

    let reachedTheForm = false
    container.addEventListener('keydown', (event) => (reachedTheForm = !event.defaultPrevented))
    press('Enter')
    expect(reachedTheForm).toBe(true)
  })

  /** The field grows with its lines, up to six. */
  it('richTextFieldGrowsWithItsLinesTest', () => {
    render('eins')
    expect(area().rows).toBe(1)

    act(() => root.render(<Editor key="three" initial={'1\n2\n3'} />))
    expect(area().rows).toBe(3)
    act(() => root.render(<Editor key="nine" initial={'1\n2\n3\n4\n5\n6\n7\n8\n9'} />))

    expect(area().rows).toBe(6)
  })

  /** A format that would run over the longest text is not set. */
  it('richTextFieldAtTheLongestTextTest', () => {
    render('x'.repeat(10), 10)
    select(0, 10)

    press('b', { ctrlKey: true })

    expect(held).toBe('')
    expect(area().value).toBe('x'.repeat(10))
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
