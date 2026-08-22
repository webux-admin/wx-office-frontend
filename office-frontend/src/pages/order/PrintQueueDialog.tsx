import { useEffect, useRef, useState } from 'react'
import { Download, Printer as PrinterIcon } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { api, type ApiFile } from '../../lib/api'
import { showFile } from '../../lib/files'
import { printFile } from '../../lib/print'
import type { DocumentPrintout, Printer } from '../../lib/types'
import {
  describePrintStep,
  describeSheets,
  pdfPathOf,
  printerNameOf,
  trayNameOf,
} from './printoutForm'

/**
 * Prints the copies of a document, one after another.
 *
 * <p>Every copy is a step of its own, and each step is started by hand. The print dialog of
 * the browser covers the whole page while it is open, so where the sheet is meant to go has
 * to be read **before** it opens — chaining the dialogs automatically would hide exactly the
 * information this screen exists for (ADR-0009).
 *
 * <p>Nothing here steers a printer. The browser decides which device and how many sheets;
 * this box only says what the tenant stored for that copy.
 *
 * @param open whether the box is on screen
 * @param onClose called when it is dismissed
 * @param base the document, for example `/api/tenants/1/orders/42`
 * @param printouts the copies to print, in printing order; empty prints the document once
 * @param printers the printers of the tenant, empty when they may not be read
 * @param draft whether the document is still a draft, which prints a preview
 */
export function PrintQueueDialog({
  open,
  onClose,
  base,
  printouts,
  printers,
  draft,
}: {
  open: boolean
  onClose: () => void
  base: string
  printouts: DocumentPrintout[]
  printers: Printer[]
  draft: boolean
}) {
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  // Kept so a failed print can still be handed over as a download; a second fetch would ask
  // the backend to render the same PDF twice.
  const [fetched, setFetched] = useState<ApiFile | null>(null)
  const printButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const total = Math.max(printouts.length, 1)
  const current = printouts[index]
  const done = index >= total

  // The print button is disabled while the sheet is on its way, and the browser takes the
  // focus off a disabled element — it lands on the page body, outside the box, where the tab
  // trap of the dialog no longer holds it. The same happens when the last copy swaps the
  // whole footer for a single close button. So after every step the focus is put back on the
  // button that is now the one to press.
  useEffect(() => {
    if (!open || busy) return
    const target = done ? closeButton.current : printButton.current
    target?.focus()
  }, [open, busy, done, index])

  const run = async () => {
    setBusy(true)
    setFailure(null)
    let file = fetched
    try {
      if (file === null) {
        file = await api.file(pdfPathOf(base, current?.id))
        setFetched(file)
      }
      await printFile(file)
      setFetched(null)
      setIndex(index + 1)
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    setFailure(null)
    setFetched(null)
    setIndex(index + 1)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={done ? 'Druck abgeschlossen' : 'Drucken'}
      description={
        done
          ? undefined
          : `Ausfertigung ${index + 1} von ${total}. Drucker und Schacht wählen Sie im Dialog des Browsers.`
      }
      footer={
        /* One footer for both states rather than one per state: the button that closes the
           box is the same button throughout, and swapping the whole foot for a new one loses
           the reference this screen puts the focus on. */
        <>
          <Button
            ref={closeButton}
            variant={done ? 'primary' : 'secondary'}
            onClick={onClose}
          >
            {done ? 'Schliessen' : 'Abbrechen'}
          </Button>
          {!done && index + 1 < total && (
            <Button variant="secondary" onClick={skip} disabled={busy}>
              Überspringen
            </Button>
          )}
          {!done && (
            <Button ref={printButton} onClick={() => void run()} busy={busy}>
              <PrinterIcon size={15} aria-hidden />
              Drucken
            </Button>
          )}
        </>
      }
    >
      {/* Mounted whether or not the queue is finished: a region that appears together with
          its text is not a change a screen reader announces. */}
      <p aria-live="polite" className="sr-only">
        {done
          ? `Druck abgeschlossen. ${total === 1 ? 'Die Ausfertigung wurde' : `Alle ${total} Ausfertigungen wurden`} an den Druckdialog übergeben.`
          : describePrintStep(index + 1, total, current, printers)}
      </p>

      {done ? (
        <p className="text-[13px] text-text-secondary">
          {total === 1
            ? 'Die Ausfertigung wurde an den Druckdialog übergeben.'
            : `Alle ${total} Ausfertigungen wurden an den Druckdialog übergeben.`}{' '}
          Was tatsächlich aus dem Gerät kommt, entscheidet der Druckdialog.
        </p>
      ) : (
        <div className="grid gap-4">
          <PrintTarget printout={current} printers={printers} />

          {draft && (
            <p className="text-[12px] text-text-secondary">
              Der Beleg ist ein Entwurf. Gedruckt wird eine Vorschau mit Wasserzeichen und ohne
              Belegnummer.
            </p>
          )}

          <p className="text-[12px] text-text-tertiary">
            Zielgerät, Schacht und Exemplarzahl kann keine Webseite setzen. Die Angaben oben sind
            das, was für diese Ausfertigung hinterlegt ist — wählen müssen Sie sie im Dialog des
            Browsers.
          </p>

          {failure !== null && (
            <ErrorNotice error={failure}>
              {fetched !== null && (
                <Button variant="secondary" onClick={() => showFile(fetched)}>
                  <Download size={15} aria-hidden />
                  PDF herunterladen
                </Button>
              )}
            </ErrorNotice>
          )}
        </div>
      )}
    </Dialog>
  )
}

/**
 * What the sheet being printed is called and where it is meant to go.
 *
 * <p>Set large on purpose: it is the one thing the user has to carry over into the dialog of
 * the browser, and they have a moment to read it before that dialog covers the page.
 */
function PrintTarget({
  printout,
  printers,
}: {
  /** The copy, absent for a document that names none and is printed once. */
  printout?: DocumentPrintout
  printers: Printer[]
}) {
  const printer = printout === undefined ? null : printerNameOf(printout, printers)
  const tray = printout === undefined ? null : trayNameOf(printout, printers)

  return (
    <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.6px] text-text-tertiary">
        Ausfertigung
      </p>
      <p className="mt-0.5 text-[17px] font-semibold leading-6">
        {printout?.label ?? 'Beleg ohne Beschriftung'}
      </p>
      <p className="mt-0.5 text-[13px] text-text-secondary">
        {describeSheets(printout?.copies)}
      </p>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.6px] text-text-tertiary">
            Drucker
          </dt>
          <dd className="mt-0.5 text-[15px] font-medium">{printer ?? 'nicht hinterlegt'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.6px] text-text-tertiary">
            Schacht
          </dt>
          <dd className="mt-0.5 text-[15px] font-medium">{tray ?? 'nicht hinterlegt'}</dd>
        </div>
      </dl>
    </div>
  )
}
