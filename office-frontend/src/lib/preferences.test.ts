// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSessionFamily,
  clearSessionText,
  readFlag,
  readSessionText,
  writeFlag,
  writeSessionText,
} from './preferences'

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('readFlag', () => {
  it('readFlagTest', () => {
    window.localStorage.setItem('webux.sidebarCollapsed', 'true')

    expect(readFlag('sidebarCollapsed', false)).toBe(true)
  })

  it('readFlagWithStoredFalseTest', () => {
    window.localStorage.setItem('webux.sidebarCollapsed', 'false')

    expect(readFlag('sidebarCollapsed', true)).toBe(false)
  })

  it('readFlagWithoutStoredValueTest', () => {
    expect(readFlag('sidebarCollapsed', true)).toBe(true)
    expect(readFlag('sidebarCollapsed', false)).toBe(false)
  })

  it('readFlagWithGarbageValueTest', () => {
    window.localStorage.setItem('webux.sidebarCollapsed', 'vielleicht')

    expect(readFlag('sidebarCollapsed', true)).toBe(false)
  })

  it('readFlagWhenStorageThrowsTest', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage is not available')
    })

    expect(readFlag('sidebarCollapsed', true)).toBe(true)
  })
})

describe('writeFlag', () => {
  it('writeFlagTest', () => {
    writeFlag('sidebarCollapsed', true)

    expect(window.localStorage.getItem('webux.sidebarCollapsed')).toBe('true')
    expect(readFlag('sidebarCollapsed', false)).toBe(true)
  })

  it('writeFlagOverwritesTest', () => {
    writeFlag('sidebarCollapsed', true)
    writeFlag('sidebarCollapsed', false)

    expect(readFlag('sidebarCollapsed', true)).toBe(false)
  })

  it('writeFlagWhenStorageThrowsTest', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded')
    })

    expect(() => writeFlag('sidebarCollapsed', true)).not.toThrow()
  })
})

describe('readSessionText', () => {
  it('readSessionTextTest', () => {
    writeSessionText('accounting.draft.7', '{"rows":[]}')

    expect(readSessionText('accounting.draft.7')).toBe('{"rows":[]}')
  })

  it('readSessionTextWithoutStoredValueTest', () => {
    expect(readSessionText('accounting.draft.7')).toBeNull()
  })

  it('readSessionTextWhenStorageThrowsTest', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage is not available')
    })

    expect(readSessionText('accounting.draft.7')).toBeNull()
  })
})

describe('writeSessionText', () => {
  /** The prefix is the point: nothing on this origin may collide with it. */
  it('writeSessionTextTest', () => {
    writeSessionText('accounting.draft.7', 'x')

    expect(window.sessionStorage.getItem('webux.accounting.draft.7')).toBe('x')
  })

  /**
   * And the store is the other point. Half an entry carries account numbers and amounts of a
   * business; it belongs to the tab it was typed in, not to the machine. `localStorage` would
   * keep it over a browser restart and past the next sign-in (ADR-0045 section 4).
   */
  it('writeSessionTextKeepsNothingBeyondTheTabTest', () => {
    writeSessionText('accounting.draft.7', 'x')

    expect(window.localStorage.getItem('webux.accounting.draft.7')).toBeNull()
  })

  /** The two stores do not read each other: a settings value is no rescued draft. */
  it('writeSessionTextIgnoresTheSettingsStoreTest', () => {
    window.localStorage.setItem('webux.accounting.draft.7', 'aus localStorage')

    expect(readSessionText('accounting.draft.7')).toBeNull()
  })

  it('writeSessionTextWhenStorageThrowsTest', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded')
    })

    expect(() => writeSessionText('accounting.draft.7', 'x')).not.toThrow()
  })
})

describe('clearSessionText', () => {
  it('clearSessionTextTest', () => {
    writeSessionText('accounting.draft.7', 'x')
    clearSessionText('accounting.draft.7')

    expect(readSessionText('accounting.draft.7')).toBeNull()
  })

  /** Removing what is not there is no error: it is the state the caller wanted. */
  it('clearSessionTextWithoutStoredValueTest', () => {
    expect(() => clearSessionText('accounting.draft.7')).not.toThrow()
  })

  it('clearSessionTextWhenStorageThrowsTest', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('storage is not available')
    })

    expect(() => clearSessionText('accounting.draft.7')).not.toThrow()
  })
})

describe('clearSessionFamily', () => {
  it('clearSessionFamilyTest', () => {
    writeSessionText('accounting.draft.1', 'eins')
    writeSessionText('accounting.draft.2', 'zwei')
    writeSessionText('accounting.draft.3', 'drei')

    clearSessionFamily('accounting.draft.', 'accounting.draft.2')

    expect(readSessionText('accounting.draft.1')).toBeNull()
    expect(readSessionText('accounting.draft.2')).toBe('zwei')
    expect(readSessionText('accounting.draft.3')).toBeNull()
  })

  /**
   * Nothing of the family stored: nothing happens, and the neighbours stay — including the
   * settings in the other store, which this never reaches into.
   */
  it('clearSessionFamilyWithoutMembersTest', () => {
    writeFlag('sidebarCollapsed', true)

    clearSessionFamily('accounting.draft.', 'accounting.draft.1')

    expect(readFlag('sidebarCollapsed', false)).toBe(true)
  })

  /** The one to keep is the only member: it survives, and that is the ordinary case. */
  it('clearSessionFamilyWithOnlyTheKeptOneTest', () => {
    writeSessionText('accounting.draft.1', 'eins')

    clearSessionFamily('accounting.draft.', 'accounting.draft.1')

    expect(readSessionText('accounting.draft.1')).toBe('eins')
  })

  /**
   * A store that throws halfway through is caught rather than carried up into a render.
   *
   * <p>The member has to be stored **before** the store starts throwing, or nothing reaches
   * the code this test is about: an empty store has `length === 0`, the loop never runs, and
   * `key` is never called — the test then stays green with the `try`/`catch` deleted outright.
   * So the spy is asserted to have been called, and the value is asserted to be still there.
   */
  it('clearSessionFamilyWhenStorageThrowsTest', () => {
    writeSessionText('accounting.draft.2', 'zwei')
    const key = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new DOMException('storage is not available')
    })

    expect(() => clearSessionFamily('accounting.draft.', 'accounting.draft.1')).not.toThrow()

    expect(key).toHaveBeenCalled()
    // Nothing was removed: the walk broke off at the first key and threw.
    expect(readSessionText('accounting.draft.2')).toBe('zwei')
  })
})
