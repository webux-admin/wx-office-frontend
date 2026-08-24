// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BarcodeScanner } from './BarcodeScanner'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CODE = '7612345678901'

let container: HTMLDivElement
let root: Root

/** A camera that hands out a stream nobody has to close for real. */
function stubCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }) },
  })
}

/** A browser that can read bar codes and always sees the same one. */
function stubDetector(codes: { rawValue: string }[]) {
  ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve(codes)
    }
  }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
  vi.useRealTimers()
})

function cameraButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Mit der Kamera scannen',
  )
}

describe('BarcodeScanner', () => {
  /**
   * No greyed out button that explains itself after the click: where the browser cannot read
   * a bar code, the hand scanner is the way and the control is simply not there.
   */
  it('barcodeScannerHiddenWithoutSupportTest', async () => {
    await act(async () => {
      root.render(<BarcodeScanner onScan={() => undefined} />)
    })

    expect(container.innerHTML).toBe('')
  })

  it('barcodeScannerFillsFieldTest', async () => {
    stubCamera()
    stubDetector([{ rawValue: CODE }])
    const scanned: string[] = []
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await act(async () => {
      root.render(<BarcodeScanner onScan={(code) => scanned.push(code)} />)
    })
    expect(cameraButton()).toBeDefined()

    await act(async () => {
      cameraButton()?.click()
    })
    // The camera is asked for on the click, so the stream has to settle first.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(scanned).toEqual([CODE])
  })

  /** A picture without a code keeps the overlay open rather than reporting nothing. */
  it('barcodeScannerWithoutACodeInThePictureTest', async () => {
    stubCamera()
    stubDetector([])
    const scanned: string[] = []
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await act(async () => {
      root.render(<BarcodeScanner onScan={(code) => scanned.push(code)} />)
    })
    await act(async () => {
      cameraButton()?.click()
    })
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(300)
    })

    expect(scanned).toEqual([])
    expect(document.body.textContent).toContain('Strichcode vor die Kamera halten.')
  })

  /** A refusal takes the button away for this session and says once how it comes back. */
  it('barcodeScannerWithARefusedCameraTest', async () => {
    stubDetector([{ rawValue: CODE }])
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error('NotAllowedError')) },
    })

    await act(async () => {
      root.render(<BarcodeScanner onScan={() => undefined} />)
    })
    await act(async () => {
      cameraButton()?.click()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(cameraButton()).toBeUndefined()
    expect(document.body.textContent).toContain('Browsereinstellungen')
  })
})
