import { useContext, useEffect, useRef, useState } from 'react'
import { BarcodeScanner } from '../../components/BarcodeScanner'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatDateTime, formatQuantity } from '../../lib/format'
import { counted, RESEND_LABEL } from './countForm'
import { ScanHandledByTheMask, type ScanLookup } from './scanLookup'
import { useCountEntry } from './useCountEntry'
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
 * <p>What a typed figure means, whether it goes out, what is asked before a count is replaced
 * and where the focus lands afterwards is not decided here: that is {@link useCountEntry}, and
 * the card view of the same route asks the very same hook.
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
  const table = useRef<HTMLTableElement>(null)
  const mask = useCountEntry({ lines, blind, container: table, onCount })

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Keine Zeile"
        description="Diese Zählliste führt an diesem Lagerort nichts."
      />
    )
  }

  return (
    <>
      {/* Over the table and not inside it, so it is reachable without scrolling: whoever
          counts holds the phone in one hand and the article in the other. Where the browser
          reads no bar code this row is empty, and the hand scanner keeps typing into the
          jump field of the mask. */}
      {editable && <StocktakeScan lines={lines} onJump={mask.focusLine} />}

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
              const entry = mask.entryOf(line, index)
              return (
                <tr
                  key={line.id}
                  className={`border-b border-line ${entry.failed ? 'bg-danger-surface' : ''}`}
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
                    {/* The sentence rides along as the hint of the field: a red border that
                        says nothing leaves the user to guess what is wrong with the figure,
                        and the card view has said it from the first day. */}
                    <TextField
                      label={"Gezählt " + line.productName}
                      value={entry.value}
                      data-count-index={index}
                      onChange={(event) => mask.typeInto(line, event.target.value)}
                      onBlur={() => mask.leaveField(line, index)}
                      onKeyDown={(event) => mask.pressKey(event, line, index)}
                      disabled={!editable}
                      inputMode="decimal"
                      numeric
                      invalid={entry.invalid}
                      hint={entry.problem}
                    />
                  </td>
                  {!blind && (
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        entry.difference === undefined || entry.difference === 0
                          ? ''
                          : 'text-warning'
                      }`}
                    >
                      {entry.difference === undefined ? '' : formatQuantity(entry.difference)}
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
                    {entry.failed && (
                      <Button
                        variant="secondary"
                        onClick={() => mask.resend(line, index)}
                        className="ml-2"
                      >
                        {RESEND_LABEL}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {mask.asking !== undefined && (
        <div
          role="alertdialog"
          aria-label="Zählung überschreiben"
          className="mt-4 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3"
        >
          <p className="text-[13px]">{mask.question}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={mask.overwrite}>Überschreiben</Button>
            <Button variant="secondary" onClick={mask.keep}>
              Behalten
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * The camera button of the counting mask, and the one sentence about a code it found nothing
 * for.
 *
 * <p>The main case the camera exists for: stand in the aisle, scan the article, type the
 * quantity, on to the next one. The read number <b>jumps to its line</b> — the scan replaces
 * the search, not the recording, and the keyboard flow (quantity, Enter, next open line) stays
 * exactly as it was.
 *
 * <p>Nothing new is built here, the block from the booking dialog is hung in: where the browser
 * cannot read a bar code the button is not rendered at all, and the camera is asked for on the
 * press and never on load.
 *
 * <p><b>A code the drawn rows do not carry is handed to the server, not turned away.</b> The
 * lines arrive a page at a time and narrowed by whatever chip is in force, so «not on screen»
 * says nothing about the count list — with «Offen» pressed, every line somebody already counted
 * is missing from it, and past row 100 nothing is on screen at all. With a {@link ScanLookup}
 * the scan therefore takes the road the jump field takes and calls a code foreign only once the
 * server has answered for the whole list. That is what «der Scan ersetzt die Suche» means.
 * Without one it reads the rows it was handed, which is then all there is to read.
 *
 * <p>Sits in its own component so that the table, the card view and the mask itself all ask for
 * the same block. Inside a mask that hangs the camera in its own header the block steps aside
 * ({@link ScanHandledByTheMask}) instead of drawing a second button.
 *
 * @param lines the lines on screen, in the order they are counted
 * @param onJump moves the mask to that line and puts the focus in its quantity field
 * @param lookup the road to the whole count list; left out where there is none
 */
export function StocktakeScan({
  lines,
  onJump,
  lookup,
}: {
  lines: readonly StocktakeLine[]
  onJump: (index: number) => void
  lookup?: ScanLookup
}) {
  const handledAbove = useContext(ScanHandledByTheMask)
  // The code the mask was last asked to narrow to. Kept until the next scan, because it is what
  // the lines on screen have to be read against.
  const [asked, setAsked] = useState<string | null>(null)
  // A code the handed over rows do not carry where there is no server to ask — a scan block
  // standing on its own. Then those rows are all there is to read.
  const [foreign, setForeign] = useState<string | null>(null)
  // The code the focus was last moved for, so that a refetch of the lines does not pull it back
  // out of the field somebody is typing into.
  const jumpedFor = useRef<string | null>(null)

  // Read while rendering rather than remembered: the lines on screen and the term they were
  // fetched with are the answer already, and a second copy of it could only drift.
  const answered =
    lookup !== undefined && asked !== null && !lookup.pending && lookup.term === asked
  // The answer is the whole count list narrowed to that code, so whatever is in it belongs to
  // the code — the first row where the reading below picks none. Nothing in it means the list
  // really does not carry the article.
  const jumpTo =
    !answered || asked === null
      ? undefined
      : (lineForCode(lines, asked) ?? (lines.length === 0 ? undefined : 0))
  const missed = answered && jumpTo === undefined ? asked : foreign

  const take = (code: string) => {
    // Code 128 and QR payloads carry spaces and a closing newline as a matter of course. The
    // scanner only turns away the empty string, so what is left after trimming can be empty.
    const read = code.trim()
    if (read === '') return
    setForeign(null)
    const index = lineForCode(lines, read)
    if (index !== undefined) {
      setAsked(null)
      jumpedFor.current = null
      onJump(index)
      return
    }
    if (lookup === undefined) {
      setForeign(read)
      return
    }
    setAsked(read)
    lookup.narrowTo(read)
  }

  // The one thing that is not a rendering: moving the focus into the line the answer brought.
  useEffect(() => {
    if (jumpTo === undefined || asked === null || jumpedFor.current === asked) return
    jumpedFor.current = asked
    onJump(jumpTo)
  }, [jumpTo, asked, onJump])

  // After the hooks, so a block that steps aside runs the same ones as one that does not.
  if (handledAbove) return null

  return (
    <div className="mb-3 flex items-center gap-2">
      {/* No `onClose` that puts the focus back: the overlay closes on the read itself, and
          the focus belongs in the quantity field of the line that was scanned. */}
      <BarcodeScanner label="Artikel mit der Kamera scannen" onScan={take} />

      {/* Mounted for as long as the mask is, with changing text: a region inserted together
          with its text is no change a screen reader announces, and this sentence is the only
          word anybody gets about a code that found nothing. */}
      <p role="status" className={missed === null ? 'sr-only' : 'text-[12px] text-warning'}>
        {missed === null ? '' : `${missed} gehört nicht zu dieser Zählung`}
      </p>
    </div>
  )
}

/**
 * The line a scanned or typed code belongs to.
 *
 * <p>Looks over the product number, the bar code and the lot number — the three things a label
 * in the aisle carries, and the same three the jump field of the mask searches over.
 *
 * <p>Two rules where several lines answer to one code. A lot number wins, because it names
 * exactly one piece and the article it belongs to stands on a second line without a number.
 * Otherwise the line nobody has counted yet is meant: whoever scans is standing in front of the
 * shelf, not correcting somebody else's count.
 *
 * @param lines the lines on screen, in the order they are counted
 * @param code what was read or typed
 * @returns the index of the line, or undefined where this count list carries none
 */
function lineForCode(lines: readonly StocktakeLine[], code: string): number | undefined {
  const wanted = code.trim().toLowerCase()
  if (wanted === '') return undefined

  const matches: number[] = []
  lines.forEach((line, index) => {
    if (codesOf(line).includes(wanted)) matches.push(index)
  })
  if (matches.length === 0) return undefined

  const byLot = matches.find((index) => clean(lines[index].lotNumber) === wanted)
  if (byLot !== undefined) return byLot
  return matches.find((index) => !counted(lines[index])) ?? matches[0]
}

/** What one line answers to: its product number, its bar code and its lot number. */
function codesOf(line: StocktakeLine): string[] {
  return [clean(line.productNumber), clean(line.productEan), clean(line.lotNumber)].filter(
    (code) => code !== '',
  )
}

/** One code, comparable: without the padding a reader adds and without a case. */
function clean(code: string | undefined): string {
  return (code ?? '').trim().toLowerCase()
}
