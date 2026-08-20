// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showFile } from './files'

const FILE = { blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }), fileName: 'AU-2026-0001.pdf' }

/** jsdom knows neither object URLs nor real windows, so both are stubbed. */
function stubUrls(): { created: Blob[]; revoked: string[] } {
  const created: Blob[] = []
  const revoked: string[] = []
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      created.push(blob)
      return 'blob:test'
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  })
  return { created, revoked }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('showFile', () => {
  it('showFileTest', () => {
    const { created } = stubUrls()
    const open = vi.fn(() => ({}) as Window)
    vi.stubGlobal('open', open)

    showFile(FILE)

    expect(created).toEqual([FILE.blob])
    // No `noopener`: it would make window.open return null on every call and turn every
    // print into a download.
    expect(open).toHaveBeenCalledWith('blob:test', '_blank')
  })

  it('showFileFallsBackToADownloadWhenTheTabIsBlockedTest', () => {
    stubUrls()
    vi.stubGlobal('open', vi.fn(() => null))
    let downloaded: { href: string; download: string } | undefined
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded = { href: this.href, download: this.download }
      })

    showFile(FILE)

    expect(click).toHaveBeenCalledOnce()
    expect(downloaded).toEqual({ href: 'blob:test', download: 'AU-2026-0001.pdf' })
    click.mockRestore()
  })

  it('showFileReleasesTheObjectUrlTest', () => {
    vi.useFakeTimers()
    const { revoked } = stubUrls()
    vi.stubGlobal('open', vi.fn(() => ({}) as Window))

    showFile(FILE)
    expect(revoked).toEqual([])
    vi.advanceTimersByTime(60_000)

    expect(revoked).toEqual(['blob:test'])
  })
})
