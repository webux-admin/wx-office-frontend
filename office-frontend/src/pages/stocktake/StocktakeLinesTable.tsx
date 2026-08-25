import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatDateTime, formatQuantity } from '../../lib/format'
import { counted, countProblem, nextOpenIndex } from './countForm'
import type { StocktakeLine } from '../../lib/types'

/**
 * The lines of a count list, with the counted quantity as the one editable column.
 *
 * <p>A hand-written table and not the shared {@code DataTable}, for the same reason the
 * position table of a document is one: a column is typed into, the focus moves from row to
 * row, and a row remembers what was typed while the request is on its way.
 *
 * <p><b>Saved line by line, on leaving the field.</b> A count takes hours, often on a phone in
 * an aisle, and a dropped connection must not lose a recorded value. Where a save fails the
 * row goes red, «Erneut senden» appears, and <b>the typed figure stays in the field</b> — it
 * is the only place it exists (Frontend-ADR-0016).
 *
 * @param lines the lines on screen, in the order they are counted
 * @param blind whether the expected quantity is hidden
 * @param editable false once the list is booked
 * @param onCount saves one line; the promise answers when the backend has taken it
 */
export function StocktakeLinesTable({
  lines,
  blind,
  editable,
  onCount,
}: {
  lines: readonly StocktakeLine[]
  blind: boolean
  editable: boolean
  onCount: (line: StocktakeLine, quantity: number) => Promise<unknown>
}) {
  // What stands in each field, by line id. Only the rows somebody has typed into are in here;
  // everything else is drawn from what the server sent.
  const [typed, setTyped] = useState<Record<number, string>>({})
  // Which rows failed to save. They keep their typed value and offer to send it again.
  const [failed, setFailed] = useState<Record<number, boolean>>({})
  // The row whose count is about to be overwritten, and what would overwrite it.
  const [asking, setAsking] = useState<{ line: StocktakeLine; quantity: number } | null>(null)
  const table = useRef<HTMLTableElement>(null)

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Keine Zeile"
        description="Diese Zählliste führt an diesem Lagerort nichts."
      />
    )
  }

  const valueOf = (line: StocktakeLine) =>
    typed[line.id] ?? (line.countedQuantity === undefined ? '' : String(line.countedQuantity))

  /** Moves the focus into the quantity field of one row, and scrolls it into view. */
  const focusRow = (index: number) => {
    const field = table.current?.querySelector<HTMLInputElement>(
      `[data-count-index="${index}"]`,
    )
    field?.focus()
    field?.select()
    field?.scrollIntoView({ block: 'nearest' })
  }

  /** Sends one row and moves on, or asks first where a count would be overwritten. */
  const send = (line: StocktakeLine, index: number, force = false) => {
    const value = valueOf(line)
    if (value.trim() === '') return
    const problem = countProblem(value, line.lotNumber !== undefined && isSerial(line))
    if (problem !== undefined) return
    const quantity = Number(value.replace(',', '.'))
    // Somebody else already counted this row: ask before it is overwritten. Their count is a
    // statement, and two people counting one list must not quietly undo each other.
    if (!force && counted(line) && line.countedQuantity !== quantity) {
      setAsking({ line, quantity })
      return
    }
    void onCount(line, quantity).then(
      () => {
        setFailed((current) => ({ ...current, [line.id]: false }))
        const next = nextOpenIndex(lines, index)
        if (next !== undefined) focusRow(next)
      },
      () => setFailed((current) => ({ ...current, [line.id]: true })),
    )
  }

  const pressKey = (event: KeyboardEvent<HTMLInputElement>, line: StocktakeLine,
                    index: number) => {
    if (event.key !== 'Enter' || event.repeat) return
    event.preventDefault()
    send(line, index)
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table ref={table} className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-text-tertiary">
              <th className="px-3 py-2 w-[110px]">Nummer</th>
              <th className="px-3 py-2">Bezeichnung</th>
              <th className="px-3 py-2 w-[130px]">Charge/Serie</th>
              {!blind && <th className="px-3 py-2 w-[90px] text-right">Soll</th>}
              <th className="px-3 py-2 w-[120px] text-right">Gezählt</th>
              {!blind && <th className="px-3 py-2 w-[90px] text-right">Differenz</th>}
              <th className="px-3 py-2 w-[70px]">Einheit</th>
              <th className="px-3 py-2 w-[170px]">Gezählt von</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const value = valueOf(line)
              const problem = countProblem(value, isSerial(line))
              const broken = failed[line.id] === true
              const difference =
                line.expectedQuantity === undefined || value.trim() === ''
                  ? undefined
                  : Number(value.replace(',', '.')) - line.expectedQuantity
              return (
                <tr
                  key={line.id}
                  className={`border-b border-line ${broken ? 'bg-danger-surface' : ''}`}
                >
                  <td className="px-3 py-2 font-mono text-[12px] text-text-tertiary">
                    {line.productNumber ?? '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{line.productName}</span>
                    {line.addedDuringCounting && (
                      <span className="ml-2 text-[11px] text-text-tertiary">gefunden</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px]">{line.lotNumber ?? ''}</td>
                  {!blind && (
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatQuantity(line.expectedQuantity ?? 0)}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <TextField
                      label={"Gezählt " + line.productName}
                      value={value}
                      data-count-index={index}
                      onChange={(event) =>
                        setTyped((current) => ({ ...current, [line.id]: event.target.value }))
                      }
                      onBlur={() => send(line, index)}
                      onKeyDown={(event) => pressKey(event, line, index)}
                      disabled={!editable}
                      inputMode="decimal"
                      numeric
                      invalid={problem !== undefined || broken}
                    />
                  </td>
                  {!blind && (
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        difference === undefined || difference === 0 ? '' : 'text-warning'
                      }`}
                    >
                      {difference === undefined ? '' : formatQuantity(difference)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-text-secondary">{line.unitShortName ?? ''}</td>
                  <td className="px-3 py-2 text-[12px] text-text-secondary">
                    {line.countedBy === undefined
                      ? ''
                      : `${line.countedBy}${
                          line.countedAt === undefined
                            ? ''
                            : `, ${formatDateTime(line.countedAt)}`
                        }`}
                    {broken && (
                      <Button
                        variant="secondary"
                        onClick={() => send(line, index, true)}
                        className="ml-2"
                      >
                        Erneut senden
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {asking !== null && (
        <div
          role="alertdialog"
          aria-label="Zählung überschreiben"
          className="mt-4 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3"
        >
          <p className="text-[13px]">
            {`Gezählt von ${asking.line.countedBy ?? 'jemandem'}`}
            {asking.line.countedAt === undefined
              ? ''
              : ` um ${formatDateTime(asking.line.countedAt)}`}
            {' — überschreiben?'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                const target = asking
                setAsking(null)
                send(target.line, lines.indexOf(target.line), true)
              }}
            >
              Überschreiben
            </Button>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              Behalten
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Whether a line stands for a single piece.
 *
 * <p>Read off the lot number rather than sent as a flag of its own: a line without one is not
 * a serial line, and one with one is exactly as serial as its product is. The server refuses a
 * count above one either way; this only spares the user the refusal.
 */
function isSerial(line: StocktakeLine): boolean {
  return line.lotNumber !== undefined && line.expectedQuantity !== undefined
    && line.expectedQuantity <= 1
}
