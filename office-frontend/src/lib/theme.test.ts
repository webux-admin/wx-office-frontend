// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, currentTheme, otherTheme, resolveTheme, systemTheme } from './theme'

/** Replaces matchMedia so the test decides what the operating system asks for. */
function stubSystem(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('resolveTheme', () => {
  it('resolveThemeTest', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark')
    expect(resolveTheme('light', 'dark')).toBe('light')
  })

  it('resolveThemeWithoutChoiceFollowsTheSystemTest', () => {
    expect(resolveTheme(null, 'dark')).toBe('dark')
    expect(resolveTheme(null, 'light')).toBe('light')
  })

  it('resolveThemeWithUnknownValueFallsBackToTheSystemTest', () => {
    expect(resolveTheme('sepia', 'dark')).toBe('dark')
    expect(resolveTheme('', 'light')).toBe('light')
  })
})

describe('otherTheme', () => {
  it('otherThemeTest', () => {
    expect(otherTheme('light')).toBe('dark')
    expect(otherTheme('dark')).toBe('light')
  })
})

describe('systemTheme', () => {
  it('systemThemeTest', () => {
    stubSystem(true)

    expect(systemTheme()).toBe('dark')
  })

  it('systemThemeWithoutDarkPreferenceTest', () => {
    stubSystem(false)

    expect(systemTheme()).toBe('light')
  })
})

describe('applyTheme', () => {
  it('applyThemeTest', () => {
    applyTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('webux.theme')).toBe('dark')
  })

  it('applyThemeIsRememberedByCurrentThemeTest', () => {
    stubSystem(false)
    applyTheme('dark')

    // The remembered choice outranks a system that asks for light.
    expect(currentTheme()).toBe('dark')
  })

  it('applyThemeWhenStorageThrowsStillPaintsTest', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded')
    })

    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('currentTheme', () => {
  it('currentThemeWithoutChoiceTest', () => {
    stubSystem(true)

    expect(currentTheme()).toBe('dark')
  })
})
