// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileDropField, type FileDropFieldProps } from './FileDropField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function draw(props: Partial<FileDropFieldProps> = {}) {
  const onSelect = props.onSelect ?? vi.fn()
  act(() => {
    root.render(<FileDropField label="Datei wählen" {...props} onSelect={onSelect} />)
  })
  return onSelect as ReturnType<typeof vi.fn>
}

function input(): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

function zone(): HTMLLabelElement {
  return container.querySelector('label') as HTMLLabelElement
}

function xmlFile(name = 'camt.xml', size = 2048): File {
  const file = new File(['<Document/>'], name, { type: 'application/xml' })
  // A `File` takes its size from its content, and the ceiling is what is under test: a 21 MB
  // string in a test would be 21 MB of memory for nothing.
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** Puts files on the hidden input and fires the change the browser would fire. */
function pick(...files: File[]) {
  act(() => {
    Object.defineProperty(input(), 'files', { value: files, configurable: true })
    input().dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Drops files on the visible box. */
function drop(...files: File[]) {
  act(() => {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files } })
    zone().dispatchEvent(event)
  })
}

describe('FileDropField', () => {
  it('onSelectTest', () => {
    const onSelect = draw()

    pick(xmlFile())

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].name).toBe('camt.xml')
    expect(container.textContent).toContain('camt.xml')
  })

  // Dropping and picking both work, and neither replaces the other: a drop zone on its own
  // would be a field a keyboard cannot reach.
  it('onSelectByDroppingTest', () => {
    const onSelect = draw()

    drop(xmlFile('auszug.xml'))

    expect(onSelect.mock.calls[0][0].name).toBe('auszug.xml')
  })

  // Only the first. A second file would silently replace it, and the field says «eine Datei».
  it('onSelectWithTwoDroppedFilesTest', () => {
    const onSelect = draw()

    drop(xmlFile('erste.xml'), xmlFile('zweite.xml'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].name).toBe('erste.xml')
  })

  it('onSelectWithoutAFileTest', () => {
    const onSelect = draw()

    drop()

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  // Refused here rather than at the server: a 30 MB file would travel for a minute only to be
  // turned away, and on a mobile connection that is a minute of somebody's data.
  it('onSelectWithAnOversizedFileTest', () => {
    const onSelect = draw({ maxBytes: 20 * 1024 * 1024 })

    pick(xmlFile('gross.xml', 21 * 1024 * 1024))

    expect(onSelect).toHaveBeenCalledWith(null)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('20 MB')
  })

  it('onSelectAtTheCeilingTest', () => {
    const onSelect = draw({ maxBytes: 20 * 1024 * 1024 })

    pick(xmlFile('genau.xml', 20 * 1024 * 1024))

    expect(onSelect.mock.calls[0][0]).not.toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('clearTest', () => {
    const onSelect = draw()
    pick(xmlFile())

    const clear = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Auswahl aufheben',
    )
    act(() => clear?.click())

    expect(onSelect).toHaveBeenLastCalledWith(null)
    expect(container.textContent).not.toContain('camt.xml')
  })

  it('disabledTest', () => {
    const onSelect = draw({ disabled: true })

    drop(xmlFile())

    expect(onSelect).not.toHaveBeenCalled()
    expect(input().disabled).toBe(true)
  })

  // An error from outside — a rejected upload — beats the field's own message.
  it('errorFromOutsideTest', () => {
    draw({ error: 'Für die IBAN CH44… ist kein Bankkonto erfasst' })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'kein Bankkonto erfasst',
    )
  })

  it('hintTest', () => {
    draw({ hint: 'camt.053 oder camt.054' })

    expect(container.textContent).toContain('camt.053 oder camt.054')
  })

  // The label is the field: the hidden input carries the id the visible box points at, so a
  // screen reader announces one control and not a div wearing a role.
  it('labelPointsAtTheInputTest', () => {
    draw()

    expect(zone().htmlFor).toBe(input().id)
    expect(input().id).not.toBe('')
  })
})
