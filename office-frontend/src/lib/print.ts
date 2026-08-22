import type { ApiFile } from './api'

/**
 * Printing a PDF through the print dialog of the browser.
 *
 * <p>There is no other way from a web page to a printer. A page may ask the browser to open
 * its dialog; it may not name the printer, the tray or the number of sheets. What the tenant
 * stored for a copy is therefore shown next to the dialog and chosen by the person standing
 * in front of it (ADR-0009).
 */

/** Thrown when the browser did not open its print dialog. */
export class PrintNotPossibleError extends Error {
  constructor(message = 'Der Druckdialog liess sich nicht öffnen.') {
    super(message)
    this.name = 'PrintNotPossibleError'
  }
}

/** How long the PDF may take to load into the frame before the attempt is given up. */
const LOAD_TIMEOUT_MS = 20_000

/** How long the frame and its object URL stay around after the dialog was asked for. */
const RELEASE_AFTER_MS = 60_000

/**
 * Whether the frame still shows the empty document a frame starts out with.
 *
 * <p>Second guard next to setting the source first: a browser that fires a load event for
 * `about:blank` anyway must not make us print it.
 *
 * @param view the window of the frame
 * @returns true while the frame shows `about:blank`
 */
function showsTheEmptyStartDocument(view: Window): boolean {
  try {
    return view.location.href === 'about:blank'
  } catch {
    // A window we may not look into is never the empty one we just created.
    return false
  }
}

/**
 * Opens the print dialog of the browser for one PDF.
 *
 * <p>The file is loaded into a hidden iframe and printed from there, rather than in a tab of
 * its own: a tab needs a click to be allowed to open, and by the time the PDF has been
 * fetched the click is spent — that is why {@link import('./files').showFile} already has to
 * fall back to a download. A frame needs no permission, keeps the mask on screen and lets the
 * caller print several copies one after another.
 *
 * <p>The promise settles when the dialog has been asked for. In every browser that ships
 * today `print()` blocks until the dialog is dismissed, so awaiting one call before starting
 * the next is what keeps the copies in order and lets the user see which one is being printed.
 *
 * @param file the bytes and the name the backend proposed
 * @returns a promise that resolves once the dialog was asked for
 * @throws PrintNotPossibleError if the frame does not load, carries no window, or the browser
 *         refuses to print it
 */
export function printFile(file: ApiFile): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file.blob)
    const frame = document.createElement('iframe')
    // Named, because an unlabelled frame is an unlabelled stop for a screen reader.
    frame.title = file.fileName
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0'

    let settled = false

    /** Ends the attempt once, and lets the browser have the frame a while longer. */
    const finish = (failure?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      // The dialog reads the bytes out of the frame while it is open, so neither the frame
      // nor the URL may go before it is done with them.
      window.setTimeout(() => {
        frame.remove()
        URL.revokeObjectURL(url)
      }, RELEASE_AFTER_MS)
      if (failure) reject(failure)
      else resolve()
    }

    const timer = window.setTimeout(
      () => finish(new PrintNotPossibleError('Das PDF liess sich nicht zum Drucken laden.')),
      LOAD_TIMEOUT_MS,
    )

    frame.addEventListener('load', () => {
      // A frame can load more than once — the browser fires one for the document being torn
      // down as well — and a second sheet nobody asked for is the worst kind of bug here.
      if (settled) return
      const view = frame.contentWindow
      if (!view || typeof view.print !== 'function') {
        finish(new PrintNotPossibleError())
        return
      }
      // Printing the empty start document would hand out a blank sheet and report success.
      if (showsTheEmptyStartDocument(view)) return
      try {
        view.print()
      } catch {
        finish(new PrintNotPossibleError())
        return
      }
      finish()
    })

    // The source is set before the frame is inserted: a frame that enters the page without
    // one loads `about:blank` first and fires a load event for it, and that event arrives
    // before the PDF is anywhere near ready.
    frame.src = url
    document.body.appendChild(frame)
  })
}
