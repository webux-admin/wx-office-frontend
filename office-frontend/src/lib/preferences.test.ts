// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFlag, writeFlag } from './preferences'

afterEach(() => {
  window.localStorage.clear()
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
