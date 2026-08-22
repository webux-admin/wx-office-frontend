import { useRef, useState } from 'react'
import { Plus, Rows3 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { originState } from '../../lib/origin'
import type { DocumentLine, SalesDocument } from '../../lib/types'
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
 * The positions of an order.
 *
 * <p>Prices and totals are never computed here. A line is sent to the backend, and what comes
 * back is what is shown. The amount on a document is a legal statement, and there must be
 * exactly one place that decides it.
 */
export function OrderLines({
  tenantId,
  order,
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
}: {
  tenantId: number
  order: SalesDocument
  /** False once the order is issued: nothing may change about a document that is out. */
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
}) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState<DocumentLine | null>(null)
  const opened = useRef(0)

  /**
   * Brings a dialog up. The counter in the key is what resets the fields: a dialog that stays
   * mounted after being closed would otherwise show the line before last.
   */
  const show = (kind: OpenDialog['kind'], line?: DocumentLine) => {
    opened.current += 1
    setDialog({ kind, line, id: opened.current })
    setOpen(true)
  }

  // Closed, not thrown away: the box has to stay in the tree for as long as it fades out.
  const close = () => setOpen(false)

  /**
   * Sends a line and closes the dialog only once the backend has taken it.
   *
   * <p>A refusal keeps the dialog open with everything still in it; the message appears at
   * the head of the dialog. Closing first would throw the typed values away and leave the
   * user to write the line a second time.
   */
  const submit = (run: () => Promise<unknown>) => {
    void run().then(close, () => undefined)
  }

  const edited = dialog?.line
  // Where the way into the product mask leads back to. The catalogue is looked up in its own
  // screen now and then, and the document has to be one click away afterwards.
  const back = originState(
    `/auftraege/${order.id}`,
    order.documentNumber ? `Auftrag ${order.documentNumber}` : 'Auftrag',
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

        <LinesTable
          tenantId={tenantId}
          document={order}
          editable={editable}
          busy={busy}
          onEdit={(line) => show(editorOf(line), line)}
          onMove={(line, position) => onMoveLine(line.lineNumber, position)}
          onRemove={(line) => setRemoving(line)}
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
          partnerId={order.partnerId}
          documentDate={order.documentDate}
          currency={order.baseCurrency ?? order.currency}
          back={back}
          open={open}
          onClose={close}
          onSubmit={(line) =>
            edited ? onUpdateProductLine(edited.lineNumber, line) : onAddProductLine(line)
          }
          line={edited}
          busy={busy}
          error={error}
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
