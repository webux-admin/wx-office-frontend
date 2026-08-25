import { useRef, useState } from 'react'
import { Plus, Rows3 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { shortfallText } from '../../lib/inventory'
import { originState } from '../../lib/origin'
import type { SalesDocumentKind } from '../../lib/salesDocument'
import type {
  DocumentLine,
  OpenLineQuantity,
  SalesDocument,
  StockShortfall,
} from '../../lib/types'
import { FreeLineDialog } from './FreeLineDialog'
import { LinesTable } from './LinesTable'
import { ProductLineDialog } from './ProductLineDialog'
import { StructureLineDialog } from './StructureLineDialog'
import { editorOf, type FreeLine, type ProductLine, type StructureLine } from './lineForm'

/** Which dialog is on screen, over which line, and how often one has been opened. */
type OpenDialog = {
  kind: 'product' | 'free' | 'structure'
  /** The line being edited; absent while a new one is added. */
  line?: DocumentLine
  /** Bumped on every opening, so the dialog is mounted afresh and reads its fields again. */
  id: number
}

/**
 * What the strip over the positions says.
 *
 * <p>Counts positions and not products: the reader is looking at a table of positions, and «2
 * Produkte» would leave them counting rows to find out which ones.
 *
 * @param shortfalls what the stock check reported
 * @param itemLines how many charged positions the document has
 * @returns the sentence, for example «2 von 5 Positionen sind nicht gedeckt»
 */
function stripText(shortfalls: readonly StockShortfall[], itemLines: number): string {
  const affected = new Set(shortfalls.flatMap((shortfall) => shortfall.lineNumbers)).size
  const head = affected === 1
    ? `1 von ${itemLines} Positionen ist nicht gedeckt`
    : `${affected} von ${itemLines} Positionen sind nicht gedeckt`
  // A location set to block refuses the issuing outright, so the strip says so rather than
  // letting somebody find out by pressing the button.
  return shortfalls.some((shortfall) => shortfall.blocking)
    ? `${head} und lassen sich nicht ausstellen`
    : head
}

/**
 * The positions of a sales document.
 *
 * <p>Prices and totals are never computed here. A line is sent to the backend, and what comes
 * back is what is shown. The amount on a document is a legal statement, and there must be
 * exactly one place that decides it.
 */
export function DocumentLines({
  tenantId,
  kind,
  document,
  editable,
  onAddProductLine,
  onUpdateProductLine,
  onAddFreeLine,
  onUpdateFreeLine,
  onAddStructureLine,
  onUpdateStructureLine,
  onMoveLine,
  onRemoveLine,
  busy,
  error,
  readOnlyNote,
  openOfOwnLines,
  openOfPredecessorLines,
  shortfalls,
}: {
  tenantId: number
  /** Which of the four kinds of document this is, so that a way back leads to this one. */
  kind: SalesDocumentKind
  document: SalesDocument
  /** False once the document is issued: nothing may change about one that is out. */
  editable: boolean
  /*
   * The six that a dialog submits answer with a promise. The dialog closes on the answer and
   * not on the click: a line the backend refuses has to stay on screen, because the dialog is
   * the only place the typed values exist.
   */
  onAddProductLine: (line: ProductLine) => Promise<unknown>
  onUpdateProductLine: (lineNumber: number, line: ProductLine) => Promise<unknown>
  onAddFreeLine: (line: FreeLine) => Promise<unknown>
  onUpdateFreeLine: (lineNumber: number, line: FreeLine) => Promise<unknown>
  onAddStructureLine: (line: StructureLine) => Promise<unknown>
  onUpdateStructureLine: (lineNumber: number, line: StructureLine) => Promise<unknown>
  /** Moves a line to another position, counted the way the lines are numbered. */
  onMoveLine: (lineNumber: number, position: number) => void
  onRemoveLine: (lineNumber: number) => void
  busy: boolean
  error: unknown
  /** Why nothing can be changed here, where that is not the state of the document itself. */
  readOnlyNote?: string
  /** What is still open on this document's own positions, by printed position. */
  openOfOwnLines?: ReadonlyMap<number, OpenLineQuantity>
  /** What is still open on the lines this document was taken over from, by their line id. */
  openOfPredecessorLines?: ReadonlyMap<number, OpenLineQuantity>
  /**
   * What this draft is short of, as the stock check reported it. Left out on an issued
   * document and wherever the check could not be read — a reading that failed says nothing,
   * and saying nothing is better than saying the wrong thing.
   */
  shortfalls?: readonly StockShortfall[]
}) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<DocumentLine | null>(null)
  const [shortfallsOpen, setShortfallsOpen] = useState(false)
  const opened = useRef(0)

  /**
   * True once the dialog on screen has had its one press. Opening a dialog clears it again.
   *
   * <p>A ref and not `useState`: the two clicks of a double click can land in the same tick,
   * and a state value read in the second one would still be the old one. It is the second
   * lock next to the one the dialog itself puts on its buttons, and the one that does not
   * depend on how long a box takes to fade out — on a document an amount is a statement, and
   * it must not stand there twice.
   *
   * <p>It is also the only one of the two the tests reach. jsdom does not act on `inert` and
   * does no hit testing at all, so the lock on the fading box is pinned there as an attribute
   * and nothing more. Take this one out because the box is inert anyway and the whole suite
   * stays green while the double click puts two positions on the document.
   */
  const sent = useRef(false)

  /**
   * Brings a dialog up. The counter in the key is what resets the fields: a dialog that stays
   * mounted after being closed would otherwise show the line before last.
   */
  const show = (dialogKind: OpenDialog['kind'], line?: DocumentLine) => {
    opened.current += 1
    sent.current = false
    setDialog({ kind: dialogKind, line, id: opened.current })
    setOpen(true)
  }

  /** Asks whether a line really goes, with the question starting on a fresh press. */
  const askRemoval = (line: DocumentLine) => {
    sent.current = false
    setRemoving(line)
  }

  // Closed, not thrown away: the box has to stay in the tree for as long as it fades out.
  const close = () => setOpen(false)

  /**
   * Sends a line and closes the dialog only once the backend has taken it.
   *
   * <p>A refusal keeps the dialog open with everything still in it; the message appears at
   * the head of the dialog. Closing first would throw the typed values away and leave the
   * user to write the line a second time.
   *
   * <p>A second call goes nowhere while the first is on its way, and nowhere afterwards
   * either where that one went through: the dialog is on its way out by then. Only a refusal
   * opens the way again, or the user could not correct what the backend complained about.
   */
  const submit = (run: () => Promise<unknown>) => {
    if (sent.current) return
    sent.current = true
    void run().then(close, () => {
      sent.current = false
    })
  }

  const edited = dialog?.line
  const short = shortfalls ?? []
  const itemLines = (document.lines ?? []).filter((line) => line.kind === 'ITEM')
  // One sentence per position, so the table can mark the rows without knowing what a
  // shortfall is.
  const byLineNumber = new Map<number, string>()
  short.forEach((shortfall) =>
    shortfall.lineNumbers.forEach((lineNumber) =>
      byLineNumber.set(lineNumber, shortfallText(shortfall)),
    ),
  )
  // Where the way into the product mask leads back to. The catalogue is looked up in its own
  // screen now and then, and the document has to be one click away afterwards.
  const back = originState(
    `${kind.path}/${document.id}`,
    document.documentNumber ? `${kind.singular} ${document.documentNumber}` : kind.singular,
  )

  return (
    <>
      <Panel
        title="Positionen"
        padded={false}
        action={
          editable ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => show('product')}>
                <Plus size={15} aria-hidden />
                Aus Katalog
              </Button>
              <Button variant="secondary" onClick={() => show('free')}>
                <Plus size={15} aria-hidden />
                Freie Zeile
              </Button>
              <Button variant="secondary" onClick={() => show('structure')}>
                <Rows3 size={15} aria-hidden />
                Zeile einfügen
              </Button>
            </div>
          ) : undefined
        }
      >
        {readOnlyNote !== undefined && (
          <p className="px-5 pt-4 text-[13px] text-text-secondary">{readOnlyNote}</p>
        )}

        {/* Only where there is something to report. A strip that is always there is read as
            decoration within a day, and then the one day it matters it is not read either. */}
        {short.length > 0 && (
          <div className="mx-5 mt-4 rounded-[var(--radius-md)] bg-warning/12 px-3.5 py-3">
            <button
              type="button"
              onClick={() => setShortfallsOpen((wasOpen) => !wasOpen)}
              aria-expanded={shortfallsOpen}
              className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 text-left text-[13px] text-text-primary"
            >
              <span className="font-medium">Lager:</span>
              <span>{stripText(short, itemLines.length)}</span>
              <span className="text-[12px] text-text-secondary underline-offset-2">
                {shortfallsOpen ? 'weniger' : 'Details'}
              </span>
            </button>
            {shortfallsOpen && (
              <ul className="mt-2 grid gap-1">
                {short.map((shortfall) => (
                  <li key={shortfall.productId} className="text-[12px] text-text-secondary">
                    {shortfallText(shortfall)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <LinesTable
          tenantId={tenantId}
          document={document}
          editable={editable}
          busy={busy}
          onEdit={(line) => show(editorOf(line), line)}
          onMove={(line, position) => onMoveLine(line.lineNumber, position)}
          onRemove={askRemoval}
          openOfOwnLines={openOfOwnLines}
          openOfPredecessorLines={openOfPredecessorLines}
          shortfalls={byLineNumber}
        />

        {error !== null && error !== undefined && (
          <div className="px-5 pb-4">
            <ErrorNotice error={error} />
          </div>
        )}
      </Panel>

      {dialog?.kind === 'product' && (
        <ProductLineDialog
          key={dialog.id}
          tenantId={tenantId}
          partnerId={document.partnerId}
          documentDate={document.documentDate}
          currency={document.baseCurrency ?? document.currency}
          back={back}
          open={open}
          onClose={close}
          onSubmit={(line) =>
            edited ? onUpdateProductLine(edited.lineNumber, line) : onAddProductLine(line)
          }
          line={edited}
          busy={busy}
          error={error}
          stockLocationId={document.effectiveStockLocationId}
          stockEffect={document.stockEffect}
        />
      )}

      {dialog?.kind === 'free' && (
        <FreeLineDialog
          key={dialog.id}
          tenantId={tenantId}
          open={open}
          onClose={close}
          onSubmit={(line) =>
            submit(() =>
              edited ? onUpdateFreeLine(edited.lineNumber, line) : onAddFreeLine(line),
            )
          }
          line={edited}
          defaultPriceIncludesVat={document.pricesIncludeVat}
          busy={busy}
          error={error}
        />
      )}

      {dialog?.kind === 'structure' && (
        <StructureLineDialog
          key={dialog.id}
          tenantId={tenantId}
          open={open}
          onClose={close}
          onSubmit={(line) =>
            submit(() =>
              edited
                ? onUpdateStructureLine(edited.lineNumber, line)
                : onAddStructureLine(line),
            )
          }
          line={edited}
          busy={busy}
          error={error}
        />
      )}

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Position entfernen"
        description="Die folgenden Positionen rücken auf."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Abbrechen
            </Button>
            <Button
              busy={busy}
              onClick={() => {
                // The same one press per opened dialog. A second one during the fade would
                // read the line of the render before it and, once the lines have moved up,
                // take a different one off the document than the one that was asked about.
                // This is the guard the suite holds, not the inert box: jsdom acts on neither
                // `inert` nor a hit test.
                if (sent.current) return
                sent.current = true
                if (removing) onRemoveLine(removing.lineNumber)
                setRemoving(null)
              }}
            >
              Entfernen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Position {removing?.lineNumber}
          {removing?.description ? ` — ${removing.description}` : ''} wird endgültig entfernt.
          Rückgängig machen lässt sich das nicht.
        </p>
      </Dialog>
    </>
  )
}
