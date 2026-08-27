import { useRef } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/Notice'
import { formatDateTime, formatQuantity } from '../../lib/format'
import { RESEND_LABEL } from './countForm'
import { StocktakeScan } from './StocktakeLinesTable'
import { useCountEntry } from './useCountEntry'
import type { StocktakeLine } from '../../lib/types'

/** What the button under every card says. */
const NEXT_OPEN = 'Weiter zur nächsten offenen Zeile'

/**
 * The lines of a count list as cards, one product each — the shape the mask takes below `sm`.
 *
 * <p>Same route and same logic as {@link StocktakeLinesTable}, only laid out for a phone held
 * in one hand in an aisle: the product name big, one large field for the quantity, and a
 * button that leads to the next line nobody has counted. Two routes would be two places for
 * the same mistake, so the mask swaps the view and keeps everything else — and «everything
 * else» is literally one hook, {@link useCountEntry}, which the table asks as well.
 *
 * <p><b>Saved line by line, on leaving the field.</b> A count takes hours and a dropped
 * connection must not lose a recorded value: where a save fails the card goes red, «Erneut
 * senden» appears, and <b>the typed figure stays in the field</b> — it is the only place it
 * exists (Frontend-ADR-0016).
 *
 * @param lines the lines on screen, in the order they are counted
 * @param blind whether the expected quantity is hidden
 * @param editable false once the list is booked
 * @param onCount saves one line; the promise answers when the backend has taken it
 */
export function StocktakeLineCards({
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
  const list = useRef<HTMLUListElement>(null)
  const mask = useCountEntry({ lines, blind, container: list, onCount })

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
      {/* The same block the table hangs in, not a second one: standing in the aisle with the
          phone is the main case the camera exists for, so it has to be here above all — and it
          must be reachable without scrolling past the first card. */}
      {editable && <StocktakeScan lines={lines} onJump={mask.focusLine} />}

      <ul ref={list} className="grid gap-3">
        {lines.map((line, index) => {
          const entry = mask.entryOf(line, index)
          const hintId = entry.problem === undefined ? undefined : `count-problem-${line.id}`

          return (
            <li
              key={line.id}
              data-count-card
              className={`rounded-[var(--radius-lg)] border bg-surface p-4 ${
                entry.failed ? 'border-danger' : 'border-line-subtle'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[12px] text-text-tertiary">
                  {line.productNumber ?? '-'}
                </span>
                {line.addedDuringCounting && (
                  <span className="text-[11px] text-text-tertiary">gefunden</span>
                )}
              </div>

              {/* Big enough to read at arm's length over a shelf, which is the whole reason this
                  view exists. */}
              <h3 className="mt-0.5 text-[18px] leading-tight font-semibold">{line.productName}</h3>

              {line.lotNumber !== undefined && (
                <p className="mt-1 font-mono text-[13px] text-text-secondary">{line.lotNumber}</p>
              )}

              {!blind && (
                <p className="mt-1 text-[13px] text-text-secondary">
                  <span>{`Soll ${formatQuantity(line.expectedQuantity ?? 0)}`}</span>
                  {entry.difference !== undefined && entry.difference !== 0 && (
                    <span className="ml-3 text-warning">
                      {`Differenz ${formatQuantity(entry.difference)}`}
                    </span>
                  )}
                </p>
              )}

              <label
                htmlFor={`stocktake-count-${line.id}`}
                className="mt-3 block text-[12px] font-medium text-text-secondary"
              >
                Gezählt
              </label>
              <div className="mt-1 flex items-center gap-3">
                {/* Hand written rather than the shared `TextField`: the field has to be big, and
                    at least 16px of type, or a phone browser zooms the page on focus and the
                    mask is no longer usable without zooming back out. No `outline-none` either,
                    so the focus ring from `index.css` stays visible. */}
                <input
                  id={`stocktake-count-${line.id}`}
                  aria-label={`Gezählt ${line.productName}`}
                  aria-invalid={entry.invalid || undefined}
                  aria-describedby={hintId}
                  data-count-index={index}
                  value={entry.value}
                  onChange={(event) => mask.typeInto(line, event.target.value)}
                  onBlur={() => mask.leaveField(line, index)}
                  onKeyDown={(event) => mask.pressKey(event, line, index)}
                  disabled={!editable}
                  inputMode="decimal"
                  className={`h-14 min-w-0 flex-1 rounded-[var(--radius-md)] border bg-surface px-4 text-right font-mono text-[20px] tabular-nums text-text-primary disabled:text-text-secondary ${
                    entry.invalid ? 'border-danger' : 'border-line'
                  }`}
                />
                <span className="w-8 text-[13px] text-text-secondary">
                  {line.unitShortName ?? ''}
                </span>
              </div>

              {entry.problem !== undefined && (
                <p id={hintId} className="mt-1.5 text-[12px] text-danger">
                  {entry.problem}
                </p>
              )}

              {line.countedBy !== undefined && (
                <p className="mt-2 text-[12px] text-text-secondary">
                  {`${line.countedBy}${
                    line.countedAt === undefined ? '' : `, ${formatDateTime(line.countedAt)}`
                  }`}
                </p>
              )}

              {entry.failed && (
                <div className="mt-3">
                  <p className="mb-2 text-[12px] text-danger">
                    Nicht gespeichert. Der Wert steht noch hier.
                  </p>
                  <Button
                    variant="secondary"
                    block
                    className="min-h-12"
                    onClick={() => mask.resend(line, index)}
                  >
                    {RESEND_LABEL}
                  </Button>
                </div>
              )}

              {entry.asking && (
                <div
                  role="alertdialog"
                  aria-label="Zählung überschreiben"
                  className="mt-3 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3"
                >
                  <p className="text-[13px]">{mask.question}</p>
                  <div className="mt-3 grid gap-2">
                    <Button className="min-h-12" block onClick={mask.overwrite}>
                      Überschreiben
                    </Button>
                    <Button variant="secondary" block className="min-h-12" onClick={mask.keep}>
                      Behalten
                    </Button>
                  </div>
                </div>
              )}

              {/* Its own button and not only `Enter`: a phone has no comfortable Enter, and
                  skipping a line one cannot count is the normal case in an aisle. */}
              <div className="mt-3">
                <Button
                  variant="ghost"
                  block
                  className="min-h-12"
                  disabled={entry.nextOpen === undefined}
                  onClick={() => {
                    if (entry.nextOpen !== undefined) mask.focusLine(entry.nextOpen)
                  }}
                >
                  {NEXT_OPEN}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
