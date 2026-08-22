// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentPrintout, Printer } from '../../lib/types'
import { PrintQueueDialog } from './PrintQueueDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The print dialog of the browser does not exist in jsdom, and `printFile` waits there for a
// frame that never loads. What it does is tested on its own in `lib/print.test.ts`; what is
// tested here is the queue above it.
const printFile = vi.hoisted(() => vi.fn<(file: unknown) => Promise<void>>())
vi.mock('../../lib/print', () => ({
  printFile,
  PrintNotPossibleError: class PrintNotPossibleError extends Error {},
}))

const showFile = vi.hoisted(() => vi.fn())
vi.mock('../../lib/files', () => ({ showFile }))

const BASE = '/api/tenants/1/orders/42'

const PRINTERS: Printer[] = [
  {
    id: 7,
    code: 'EMPFANG',
    name: 'Empfang',
    active: true,
    trays: [{ id: 71, code: 'S1', name: 'Schacht 1', position: 1 }],
  },
]

const PRINTOUTS: DocumentPrintout[] = [
  {
    id: 101,
    position: 1,
    label: 'Original',
    copies: 1,
    printerId: 7,
    printerName: 'Empfang',
    trayId: 71,
    trayName: 'Schacht 1',
  },
  { id: 102, position: 2, label: 'Buchhaltung', copies: 2 },
]

let container: HTMLDivElement
let root: Root
let asked: string[]
let closed: number

/** Answers every PDF request with a tiny file, and records which one was asked for. */
function stubFetch(failing = false) {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (failing) {
      return Promise.resolve(new Response('{}', { status: 500 }))
    }
    return Promise.resolve(
      new Response('%PDF-1.7', {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="AU-2026-0001.pdf"',
        },
      }),
    )
  })
}

beforeEach(() => {
  closed = 0
  printFile.mockReset()
  printFile.mockResolvedValue(undefined)
  showFile.mockReset()
  stubFetch()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(printouts: DocumentPrintout[] = PRINTOUTS): Promise<void> {
  await act(async () => {
    root.render(
      <PrintQueueDialog
        open
        onClose={() => (closed += 1)}
        base={BASE}
        printouts={printouts}
        printers={PRINTERS}
        draft={false}
      />,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

function spoken(): string {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? ''
}

async function press(label: string) {
  await act(async () => {
    buttonNamed(label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

describe('PrintQueueDialog', () => {
  it('printQueueDialogPrintsOneCopyAfterAnotherTest', async () => {
    await render()
    expect(text()).toContain('Ausfertigung 1 von 2')
    expect(text()).toContain('Original')

    await press('Drucken')

    expect(asked).toEqual([`${BASE}/pdf?printoutId=101`])
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Ausfertigung 2 von 2')
    expect(text()).toContain('Buchhaltung')
    expect(text()).toContain('2 Exemplare')

    await press('Drucken')

    expect(asked).toEqual([`${BASE}/pdf?printoutId=101`, `${BASE}/pdf?printoutId=102`])
    expect(text()).toContain('Druck abgeschlossen')
    expect(text()).toContain('Alle 2 Ausfertigungen wurden an den Druckdialog übergeben')
  })

  it('printQueueDialogWithoutCopiesPrintsTheDocumentOnceTest', async () => {
    await render([])
    expect(text()).toContain('Ausfertigung 1 von 1')
    expect(text()).toContain('Beleg ohne Beschriftung')

    await press('Drucken')

    // No copy of its own means the whole document, so no `printoutId` travels with it.
    expect(asked).toEqual([`${BASE}/pdf`])
    expect(text()).toContain('Die Ausfertigung wurde an den Druckdialog übergeben')
  })

  it('printQueueDialogOffersTheDownloadWhenPrintingFailsTest', async () => {
    printFile.mockRejectedValue(new Error('Der Druckdialog liess sich nicht öffnen.'))
    await render()

    await press('Drucken')

    expect(text()).toContain('Der Druckdialog liess sich nicht öffnen.')
    expect(text()).toContain('PDF herunterladen')
    // The step stands still, so the copy can be tried again or handed over as a file.
    expect(text()).toContain('Ausfertigung 1 von 2')

    await press('PDF herunterladen')
    expect(showFile).toHaveBeenCalledTimes(1)
  })

  it('printQueueDialogWithoutTheFileOffersNoDownloadTest', async () => {
    stubFetch(true)
    await render()

    await press('Drucken')

    expect(text()).toContain('Das Backend meldet einen Fehler.')
    expect(text()).not.toContain('PDF herunterladen')
    expect(printFile).not.toHaveBeenCalled()
  })

  it('printQueueDialogRetriesWithTheFileItAlreadyHasTest', async () => {
    printFile.mockRejectedValueOnce(new Error('Der Druckdialog liess sich nicht öffnen.'))
    await render()

    await press('Drucken')
    await press('Drucken')

    // The second attempt prints the file that was already fetched, it does not ask again.
    expect(asked).toEqual([`${BASE}/pdf?printoutId=101`])
    expect(printFile).toHaveBeenCalledTimes(2)
    expect(text()).toContain('Ausfertigung 2 von 2')
  })

  it('printQueueDialogSkipsACopyTest', async () => {
    printFile.mockRejectedValueOnce(new Error('Der Druckdialog liess sich nicht öffnen.'))
    await render()
    await press('Drucken')

    await press('Überspringen')

    expect(text()).toContain('Ausfertigung 2 von 2')
    expect(text()).not.toContain('PDF herunterladen')

    await press('Drucken')

    // The skipped file was dropped, so the copy that follows is fetched on its own.
    expect(asked).toEqual([`${BASE}/pdf?printoutId=101`, `${BASE}/pdf?printoutId=102`])
  })

  it('printQueueDialogWithoutAFurtherCopyOffersNoSkipTest', async () => {
    await render([PRINTOUTS[0]])

    expect(() => buttonNamed('Überspringen')).toThrow()
  })

  it('printQueueDialogAnnouncesTheStepTest', async () => {
    await render()
    expect(spoken()).toBe('Ausfertigung 1 von 2: Original, 1 Exemplar, Empfang · Schacht 1')

    await press('Drucken')

    expect(spoken()).toBe(
      'Ausfertigung 2 von 2: Buchhaltung, 2 Exemplare, Kein Drucker hinterlegt',
    )

    await press('Drucken')

    expect(spoken()).toContain('Druck abgeschlossen')
  })

  it('printQueueDialogKeepsTheFocusOnTheButtonThatIsDueTest', async () => {
    await render()

    await press('Drucken')

    // While the sheet is on its way the button is disabled, and a disabled element drops the
    // focus onto the page body — outside the box, where the tab trap no longer holds it.
    expect(document.activeElement).toBe(buttonNamed('Drucken'))

    await press('Drucken')

    expect(document.activeElement).toBe(buttonNamed('Schliessen'))
  })

  it('printQueueDialogClosesOnTheLastStepTest', async () => {
    await render([PRINTOUTS[0]])

    await press('Drucken')
    await press('Schliessen')

    expect(closed).toBe(1)
  })
})
