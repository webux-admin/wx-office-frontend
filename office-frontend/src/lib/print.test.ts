// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintNotPossibleError, printFile } from './print'

const FILE = {
  blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
  fileName: 'AU-2026-0001.pdf',
}

/** jsdom knows no object URLs, so both halves are recorded instead. */
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

/**
 * Gives the frame the window jsdom does not create for it and lets it finish loading.
 *
 * @param view what the frame answers as its `contentWindow`; `null` for a frame that has none
 * @returns the print calls that window recorded
 */
function loadFrame(view: object | null): { calls: number } {
  const frame = document.querySelector('iframe')
  if (frame === null) throw new Error('no frame was added')
  const record = { calls: 0 }
  Object.defineProperty(frame, 'contentWindow', {
    configurable: true,
    value:
      view === null
        ? null
        : { print: () => (record.calls += 1), ...view },
  })
  frame.dispatchEvent(new Event('load'))
  return record
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
})

describe('printFile', () => {
  it('printFileTest', async () => {
    const { created } = stubUrls()

    const printing = printFile(FILE)
    const view = loadFrame({})

    await expect(printing).resolves.toBeUndefined()
    expect(created).toEqual([FILE.blob])
    expect(view.calls).toBe(1)
  })

  it('printFileNamesTheFrameAndHidesItTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    const frame = document.querySelector('iframe')
    loadFrame({})
    await printing

    expect(frame?.title).toBe('AU-2026-0001.pdf')
    expect(frame?.getAttribute('aria-hidden')).toBe('true')
  })

  it('printFileReleasesTheFrameAndTheObjectUrlTest', async () => {
    const { revoked } = stubUrls()

    const printing = printFile(FILE)
    loadFrame({})
    await printing
    expect(document.querySelector('iframe')).not.toBeNull()
    expect(revoked).toEqual([])

    await vi.advanceTimersByTimeAsync(60_000)

    expect(document.querySelector('iframe')).toBeNull()
    expect(revoked).toEqual(['blob:test'])
  })

  it('printFileWithoutAWindowTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    loadFrame(null)

    await expect(printing).rejects.toBeInstanceOf(PrintNotPossibleError)
  })

  it('printFileWithoutAPrintDialogTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    // A frame the browser refuses to print from answers with a window that has no `print`.
    loadFrame({ print: undefined })

    await expect(printing).rejects.toBeInstanceOf(PrintNotPossibleError)
  })

  it('printFileWhenPrintingIsRefusedTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    loadFrame({
      print: () => {
        throw new Error('blocked')
      },
    })

    await expect(printing).rejects.toBeInstanceOf(PrintNotPossibleError)
  })

  it('printFileWhenTheFrameNeverLoadsTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    const failure = expect(printing).rejects.toBeInstanceOf(PrintNotPossibleError)
    await vi.advanceTimersByTimeAsync(20_000)

    await failure
  })

  it('printFileSetsTheSourceBeforeInsertingTheFrameTest', async () => {
    stubUrls()
    const insert = document.body.appendChild.bind(document.body)
    let sourceWhenInserted: string | null = null
    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLIFrameElement) sourceWhenInserted = node.getAttribute('src')
      return insert(node)
    })

    const printing = printFile(FILE)
    loadFrame({})
    await printing

    // A frame inserted without a source loads `about:blank` and fires a load event for it.
    expect(sourceWhenInserted).toBe('blob:test')
  })

  it('printFileIgnoresTheEmptyStartDocumentTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    const blank = loadFrame({ location: { href: 'about:blank' } })
    expect(blank.calls).toBe(0)
    const loaded = loadFrame({ location: { href: 'blob:test' } })

    await expect(printing).resolves.toBeUndefined()
    expect(loaded.calls).toBe(1)
  })

  it('printFileSettlesOnlyOnceTest', async () => {
    stubUrls()

    const printing = printFile(FILE)
    const view = loadFrame({})
    await printing
    // A second load event — some browsers fire one when the frame is torn down — must not
    // print a second sheet.
    document.querySelector('iframe')?.dispatchEvent(new Event('load'))

    expect(view.calls).toBe(1)
  })
})
