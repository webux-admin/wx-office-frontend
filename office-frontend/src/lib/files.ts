import type { ApiFile } from './api'

/** How long an object URL stays around before it is released. */
const RELEASE_AFTER_MS = 60_000

/**
 * Shows a file the backend handed out.
 *
 * <p>A new tab first, because the usual next step after asking for a PDF is looking at it and
 * printing it from the viewer. Browsers refuse to open a tab when too much time has passed
 * since the click, and fetching the file takes exactly that time — so a blocked tab falls
 * back to a plain download rather than doing nothing.
 *
 * @param file the bytes and the name the backend proposed
 */
export function showFile(file: ApiFile): void {
  const url = URL.createObjectURL(file.blob)
  // Without `noopener`: with it the call returns null by specification, and the fallback
  // below would fire on every print. The risk it guards against is not there anyway — a
  // blob URL is our own origin and the tab shows a PDF, not a page that could reach back.
  const tab = window.open(url, '_blank')
  if (!tab) {
    const link = document.createElement('a')
    link.href = url
    link.download = file.fileName
    link.click()
  }
  // The tab has read the bytes long before this; holding them any longer only grows memory.
  window.setTimeout(() => URL.revokeObjectURL(url), RELEASE_AFTER_MS)
}
