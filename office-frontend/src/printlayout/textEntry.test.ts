// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isTextEntry } from './textEntry'

/** Puts markup on the page and hands back the element with the id `target`. */
function target(markup: string): Element {
  document.body.innerHTML = markup
  const found = document.getElementById('target')
  if (found === null) throw new Error('the markup has no #target')
  return found
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isTextEntry', () => {
  it('isTextEntryTest', () => {
    expect(isTextEntry(target('<input id="target" type="text">'))).toBe(true)
    expect(isTextEntry(target('<textarea id="target"></textarea>'))).toBe(true)
  })

  it('isTextEntryOfEveryKindThatIsTypedIntoTest', () => {
    // An input without a type is a text field.
    expect(isTextEntry(target('<input id="target">'))).toBe(true)
    expect(isTextEntry(target('<input id="target" type="search">'))).toBe(true)
    expect(isTextEntry(target('<input id="target" type="number">'))).toBe(true)
    expect(isTextEntry(target('<input id="target" type="TEXT">'))).toBe(true)
    expect(isTextEntry(target('<select id="target"><option>A4</option></select>'))).toBe(true)
    expect(isTextEntry(target('<div id="target" contenteditable="true"></div>'))).toBe(true)
    // Something inside editable content counts with it.
    expect(isTextEntry(target('<div contenteditable="true"><b id="target">x</b></div>'))).toBe(true)
  })

  it('isTextEntryOfSwitchesAndButtonsTest', () => {
    // On these the keys are free for the designer: Ctrl+Z has to undo the form.
    expect(isTextEntry(target('<input id="target" type="checkbox">'))).toBe(false)
    expect(isTextEntry(target('<input id="target" type="radio">'))).toBe(false)
    expect(isTextEntry(target('<input id="target" type="color">'))).toBe(false)
    expect(isTextEntry(target('<input id="target" type="file">'))).toBe(false)
    expect(isTextEntry(target('<button id="target">Fett</button>'))).toBe(false)
    expect(isTextEntry(target('<div id="target" tabindex="0"></div>'))).toBe(false)
  })

  it('isTextEntryWithoutATargetTest', () => {
    expect(isTextEntry(null)).toBe(false)
    expect(isTextEntry(document.body)).toBe(false)
  })
})
