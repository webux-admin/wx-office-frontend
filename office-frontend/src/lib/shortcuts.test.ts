import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isSubmitShortcut,
  onMac,
  submitShortcutLabel,
  submitShortcutTitle,
  type KeyPress,
} from './shortcuts'

/** A key press, with only what the test cares about spelled out. */
function press(fields: Partial<KeyPress> = {}): KeyPress {
  return { key: 's', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...fields }
}

describe('isSubmitShortcut', () => {
  it('isSubmitShortcutTest', () => {
    expect(isSubmitShortcut(press({ key: 's', ctrlKey: true }))).toBe(true)
  })

  it('isSubmitShortcutWithTheCommandKeyTest', () => {
    expect(isSubmitShortcut(press({ key: 's', metaKey: true }))).toBe(true)
  })

  /** Whoever holds shift while typing gets an upper case S, and means the same thing. */
  it('isSubmitShortcutWithAnUpperCaseKeyTest', () => {
    expect(isSubmitShortcut(press({ key: 'S', ctrlKey: true }))).toBe(true)
  })

  it('isSubmitShortcutWithEnterTest', () => {
    expect(isSubmitShortcut(press({ key: 'Enter', ctrlKey: true }))).toBe(true)
    expect(isSubmitShortcut(press({ key: 'NumpadEnter', metaKey: true }))).toBe(true)
  })

  /** Enter on its own would save a half-filled mask while somebody is still typing. */
  it('isSubmitShortcutWithBareEnterTest', () => {
    expect(isSubmitShortcut(press({ key: 'Enter' }))).toBe(false)
  })

  it('isSubmitShortcutWithoutAModifierTest', () => {
    expect(isSubmitShortcut(press({ key: 's' }))).toBe(false)
  })

  /** A near miss must not fire: those combinations mean other things in a browser. */
  it('isSubmitShortcutWithShiftTest', () => {
    expect(isSubmitShortcut(press({ key: 's', ctrlKey: true, shiftKey: true }))).toBe(false)
  })

  it('isSubmitShortcutWithAltTest', () => {
    expect(isSubmitShortcut(press({ key: 'Enter', ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('isSubmitShortcutWithAnotherKeyTest', () => {
    expect(isSubmitShortcut(press({ key: 'a', ctrlKey: true }))).toBe(false)
    expect(isSubmitShortcut(press({ key: 'Escape', ctrlKey: true }))).toBe(false)
  })
})

describe('submitShortcutLabel', () => {
  it('submitShortcutLabelTest', () => {
    expect(submitShortcutLabel(false)).toBe('Strg+S')
  })

  it('submitShortcutLabelOnMacTest', () => {
    expect(submitShortcutLabel(true)).toBe('⌘S')
  })
})

describe('submitShortcutTitle', () => {
  it('submitShortcutTitleTest', () => {
    expect(submitShortcutTitle('Speichern', false)).toBe('Speichern (Strg+S oder Strg+Enter)')
  })

  it('submitShortcutTitleOnMacTest', () => {
    expect(submitShortcutTitle('Anlegen', true)).toBe('Anlegen (⌘S oder ⌘Enter)')
  })
})

describe('onMac', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('onMacTest', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })

    expect(onMac()).toBe(true)
  })

  it('onMacWithAnotherPlatformTest', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })

    expect(onMac()).toBe(false)
  })

  /** Rendered without a browser — in a test, or one day on a server. */
  it('onMacWithoutANavigatorTest', () => {
    vi.stubGlobal('navigator', undefined)

    expect(onMac()).toBe(false)
  })
})
