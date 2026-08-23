import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer as PrinterIcon, X } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import type { DocumentPrintout, PrintLayout, Printer } from '../../lib/types'
import { usePrintLayouts } from '../../printlayout/usePrintLayouts'
import { PrintQueueDialog } from './PrintQueueDialog'
import {
  MAX_PRINTOUTS,
  MAX_SHEETS,
  describeSheets,
  nextPrintoutRow,
  printerNameOf,
  printoutComplaint,
  printoutsKey,
  selectablePrinters,
  toPrintoutPayload,
  toPrintoutRows,
  trayNameOf,
  traysOf,
  withMovedPrintout,
  type PrintoutRow,
} from './printoutForm'

const TITLE = 'Dokumente'

const DESCRIPTION =
  'Die Ausfertigungen dieses Belegs: wie sie beschriftet sind, wie viele Exemplare, auf welcher Vorlage und auf welchem Drucker sie gedacht sind. Ohne Ausfertigung wird nichts gedruckt.'

/**
 * The copies one document is printed in, and the way to the printer.
 *
 * <p>Materialised from the kind of document when the draft was started, so a later change to
 * the kind leaves this document alone. While it is a draft the list may be changed; once it is
 * issued it is only shown (ADR-0043 of the backend).
 *
 * @param tenantId the tenant
 * @param base the document, for example `/api/tenants/1/orders/42`
 * @param editable whether the copies may be changed, which needs a draft and the write right
 * @param readOnlyNote why they may not be changed, when the reason is the missing right
 * @param draft whether the document is still a draft, which prints a preview
 */
export function DocumentPrintouts({
  tenantId,
  base,
  editable,
  readOnlyNote,
  draft,
}: {
  tenantId: number
  base: string
  editable: boolean
  readOnlyNote?: string
  draft: boolean
}) {
  const { can } = useAuth()
  const mayReadPrinters = can('PRINTER_READ')

  const printouts = useQuery({
    queryKey: ['printouts', tenantId, base],
    queryFn: () => api.get<DocumentPrintout[]>(`${base}/printouts`),
  })

  // Only for the two dropdowns. Whoever may read a document may print it, and the names of
  // printer and tray travel on the copy itself, so the list is a convenience, not a condition.
  const printers = useQuery({
    queryKey: ['printers', tenantId],
    queryFn: () => api.get<Printer[]>(`/api/tenants/${tenantId}/printers`),
    enabled: mayReadPrinters,
  })

  // The same for the form a copy may print on. Asked only where the right is there: the name
  // travels with the copy, so a user without PRINT_LAYOUT_READ still sees what is set — and
  // asking anyway would be a 403 on every document.
  const mayReadLayouts = can('PRINT_LAYOUT_READ')
  const layouts = usePrintLayouts(mayReadLayouts ? tenantId : null)

  if (printouts.isPending) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <LoadingBlock label="Ausfertigungen werden geladen" />
      </Panel>
    )
  }
  if (printouts.error !== null) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <ErrorNotice error={printouts.error} />
      </Panel>
    )
  }

  return (
    <PrintoutsPanel
      /* Keyed by what is stored: the rows below hold what was typed, and that has to give way
         when a save or a takeover rewrites the list underneath them. */
      key={printoutsKey(printouts.data)}
      tenantId={tenantId}
      base={base}
      stored={printouts.data}
      printers={printers.data ?? []}
      forms={layouts.data ?? []}
      mayReadLayouts={mayReadLayouts}
      mayReadPrinters={mayReadPrinters}
      editable={editable}
      readOnlyNote={readOnlyNote}
      draft={draft}
    />
  )
}

function PrintoutsPanel({
  tenantId,
  base,
  stored,
  printers,
  forms,
  mayReadLayouts,
  mayReadPrinters,
  editable,
  readOnlyNote,
  draft,
}: {
  tenantId: number
  base: string
  stored: DocumentPrintout[]
  printers: Printer[]
  forms: PrintLayout[]
  mayReadLayouts: boolean
  mayReadPrinters: boolean
  editable: boolean
  readOnlyNote?: string
  draft: boolean
}) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<PrintoutRow[]>(() => toPrintoutRows(stored))
  const [dirty, setDirty] = useState(false)
  const [complaint, setComplaint] = useState<string | null>(null)
  const [queue, setQueue] = useState<DocumentPrintout[] | null>(null)
  // Counted up on every start, never reset: the dialog holds which copy is due in state, and
  // only a new key builds it again. A key that repeats would reopen it half finished.
  const [queueId, setQueueId] = useState(0)

  const save = useMutation({
    mutationFn: () => api.put<DocumentPrintout[]>(`${base}/printouts`, toPrintoutPayload(rows)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['printouts', tenantId] })
    },
  })

  const change = (next: PrintoutRow[]) => {
    setRows(next)
    setDirty(true)
    setComplaint(null)
    save.reset()
  }

  const replace = (index: number, patch: Partial<PrintoutRow>) =>
    change(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  const submit = () => {
    const problem = printoutComplaint(rows)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  const print = (printouts: DocumentPrintout[]) => {
    setQueueId(queueId + 1)
    setQueue(printouts)
  }

  const failure = complaint === null ? save.error : new Error(complaint)

  return (
    <>
      <Panel
        title={TITLE}
        description={readOnlyNote ?? DESCRIPTION}
        action={
          <span className="flex shrink-0 items-center gap-2">
            {editable && (
              <Button variant="secondary" onClick={submit} busy={save.isPending}>
                Übernehmen
              </Button>
            )}
            {/* No copy, no print: there is nothing to hand to a print dialog, so the button
                is not offered rather than offered and then failing (ADR-0053 of the backend). */}
            {stored.length > 0 && (
              <Button variant="secondary" onClick={() => print(stored)} disabled={dirty}>
                <PrinterIcon size={15} aria-hidden />
                {stored.length > 1 ? 'Alle drucken' : 'Drucken'}
              </Button>
            )}
          </span>
        }
      >
        <div className="grid gap-3">
          {dirty && (
            <p className="text-[12px] text-text-tertiary" aria-live="polite">
              Gedruckt wird immer der gespeicherte Stand. Zuerst übernehmen.
            </p>
          )}

          {rows.length === 0 && (
            <p className="text-[13px] text-text-secondary">
              Für diesen Beleg ist keine Ausfertigung hinterlegt — er wird nicht gedruckt.
              {editable
                ? ' Wer ihn doch drucken will, legt eine Ausfertigung an.'
                : ''}{' '}
              Ansehen und als PDF öffnen lässt er sich weiterhin.
            </p>
          )}

          {rows.map((row, index) =>
            editable ? (
              <EditableRow
                key={index}
                row={row}
                index={index}
                count={rows.length}
                printers={printers}
                forms={forms}
                mayReadLayouts={mayReadLayouts}
                mayReadPrinters={mayReadPrinters}
                onChange={(patch) => replace(index, patch)}
                onMove={(direction) => change(withMovedPrintout(rows, index, direction))}
                onRemove={() => change(rows.filter((_, position) => position !== index))}
                busy={save.isPending}
                onPrint={
                  dirty || stored[index] === undefined
                    ? undefined
                    : () => print([stored[index]])
                }
              />
            ) : (
              <ReadOnlyRow
                key={index}
                printout={stored[index]}
                printers={printers}
                onPrint={() => print([stored[index]])}
              />
            ),
          )}

          {editable && (
            <div className="flex items-center justify-between">
              {rows.length < MAX_PRINTOUTS ? (
                <button
                  type="button"
                  onClick={() => change([...rows, nextPrintoutRow(rows.length)])}
                  className="text-[12px] text-text-secondary transition-colors hover:text-accent-text"
                >
                  + Ausfertigung
                </button>
              ) : (
                <span className="text-[12px] text-text-tertiary">
                  Mehr als {MAX_PRINTOUTS} Ausfertigungen sind nicht möglich.
                </span>
              )}
              <span className="text-[12px] text-text-tertiary">
                {rows.length} von {MAX_PRINTOUTS}
              </span>
            </div>
          )}

          {failure !== null && failure !== undefined && <ErrorNotice error={failure} />}
        </div>
      </Panel>

      <PrintQueueDialog
        key={queueId}
        open={queue !== null}
        onClose={() => setQueue(null)}
        base={base}
        printouts={queue ?? []}
        printers={printers}
        draft={draft}
      />
    </>
  )
}

/** One copy while the document is a draft: everything on it may be changed. */
function EditableRow({
  row,
  index,
  count,
  printers,
  forms,
  mayReadLayouts,
  mayReadPrinters,
  onChange,
  onMove,
  onRemove,
  onPrint,
  busy,
}: {
  row: PrintoutRow
  index: number
  count: number
  printers: Printer[]
  forms: PrintLayout[]
  mayReadLayouts: boolean
  mayReadPrinters: boolean
  onChange: (patch: Partial<PrintoutRow>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  /** Absent while the row is unsaved, because only the stored list is printed. */
  onPrint?: () => void
  busy: boolean
}) {
  const name = `${index + 1}. Ausfertigung`
  const trays = traysOf(printers, row.printerId === '' ? undefined : Number(row.printerId))

  return (
    <div className="rounded-[var(--radius-md)] border border-line-subtle p-3">
      <div className="flex items-center justify-between gap-3 pb-2.5">
        <span className="text-[12px] font-medium text-text-secondary">{name}</span>
        <span className="flex items-center gap-2">
          {onPrint !== undefined && (
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex items-center gap-1 text-[12px] text-text-secondary transition-colors hover:text-accent-text"
            >
              <PrinterIcon size={13} aria-hidden />
              Drucken
            </button>
          )}
          <RowOrderButtons
            name={name}
            upDisabled={busy || index === 0}
            downDisabled={busy || index === count - 1}
            onUp={() => onMove(-1)}
            onDown={() => onMove(1)}
          />
          <button
            type="button"
            disabled={busy}
            aria-label={`${name} entfernen`}
            onClick={onRemove}
            className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-danger disabled:opacity-40"
          >
            <X size={14} aria-hidden />
          </button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_90px_2fr_2fr]">
        <TextField
          label="Beschriftung"
          value={row.label}
          maxLength={60}
          onChange={(event) => onChange({ label: event.target.value })}
        />
        <TextField
          label="Anzahl"
          value={row.copies}
          inputMode="numeric"
          numeric
          maxLength={2}
          onChange={(event) => onChange({ copies: event.target.value })}
        />

        {mayReadPrinters ? (
          <>
            <SelectField
              label="Drucker"
              value={row.printerId}
              onChange={(event) =>
                // A tray belongs to one printer, so it cannot survive a change of printer.
                onChange({ printerId: event.target.value, trayId: '' })
              }
            >
              <option value="">Kein Drucker</option>
              {selectablePrinters(
                printers,
                row.printerId === '' ? undefined : Number(row.printerId),
              ).map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {printer.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Schacht"
              value={row.trayId}
              disabled={trays.length === 0}
              onChange={(event) => onChange({ trayId: event.target.value })}
              hint={
                row.printerId === ''
                  ? 'Erst den Drucker wählen.'
                  : trays.length === 0
                    ? 'Dieser Drucker hat nur einen Schacht.'
                    : undefined
              }
            >
              <option value="">Kein Schacht</option>
              {trays.map((tray) => (
                <option key={tray.id} value={tray.id}>
                  {tray.name}
                </option>
              ))}
            </SelectField>
          </>
        ) : (
          <p className="text-[12px] text-text-tertiary sm:col-span-2">
            Drucker und Schacht bleiben, wie sie hinterlegt sind. Zum Ändern fehlt das Recht
            PRINTER_READ.
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 border-t border-line-subtle pt-3 sm:grid-cols-2">
        {mayReadLayouts ? (
          <SelectField
            label="Druckvorlage"
            value={row.documentLayoutId}
            onChange={(event) => onChange({ documentLayoutId: event.target.value })}
            hint="Leer: wie der Beleg selbst. Sonst wird dieses Exemplar auf der gewählten Vorlage gezeichnet."
          >
            <option value="">Wie der Beleg</option>
            {forms
              .filter((form) => form.active || `${form.id}` === row.documentLayoutId)
              .map((form) => (
                <option key={form.id} value={form.id}>
                  {form.active ? form.name : `${form.name} (deaktiviert)`}
                </option>
              ))}
          </SelectField>
        ) : (
          <p className="text-[12px] text-text-tertiary">
            Die Druckvorlage bleibt, wie sie hinterlegt ist. Zum Ändern fehlt das Recht
            PRINT_LAYOUT_READ.
          </p>
        )}

        <CheckboxField
          label="Internes Dokument"
          checked={row.internal}
          onChange={(event) => onChange({ internal: event.target.checked })}
          hint="Bleibt im Haus: geht später nicht per Mail an den Kunden."
        />
      </div>

      <p className="mt-2 text-[12px] text-text-tertiary">
        Höchstens {MAX_SHEETS} Exemplare. Drucker und Schacht sind eine Notiz für den Druckdialog,
        keine Steuerung.
      </p>
    </div>
  )
}

/** One copy of a document that is issued, or that the user may not change. */
function ReadOnlyRow({
  printout,
  printers,
  onPrint,
}: {
  printout?: DocumentPrintout
  printers: Printer[]
  onPrint: () => void
}) {
  if (printout === undefined) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line-subtle px-3.5 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          <span className="font-mono text-[12px] text-text-tertiary">{printout.position}</span>
          {printout.label}
          {printout.internal === true && <Badge tone="neutral">Intern</Badge>}
        </p>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          {describeSheets(printout.copies)} ·{' '}
          {printerNameOf(printout, printers) ?? 'kein Drucker hinterlegt'}
          {trayNameOf(printout, printers) === null
            ? ''
            : ` · ${trayNameOf(printout, printers)}`}
          {printout.documentLayoutName === undefined
            ? ''
            : ` · Vorlage ${printout.documentLayoutName}`}
        </p>
      </div>
      <Button variant="secondary" onClick={onPrint}>
        <PrinterIcon size={15} aria-hidden />
        Drucken
      </Button>
    </div>
  )
}
