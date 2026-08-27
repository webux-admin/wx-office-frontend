import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { overwriteQuestion } from '../../lib/inventory'
import {
  counted,
  countedQuantity,
  countProblem,
  isSerialLine,
  nextOpenIndex,
  typedDifference,
} from './countForm'
import type { StocktakeLine } from '../../lib/types'

/** Who a count belongs to where the server sent no name with it. */
const SOMEBODY = 'jemandem'

/**
 * Puts the focus into the quantity field of one line and brings it into view.
 *
 * <p>Stands here rather than in each view, and is handed the box rather than reaching for one:
 * the mask calls it after a count to move on, and the page above calls it after a scan — the
 * camera sits over both layouts and has to reach a line without knowing which of them is drawn.
 * Two copies of these three lines is how the two views drifted apart once already.
 *
 * <p>The figure is selected, not just focused: a scan lands on a line that usually already
 * carries a count, and the next thing typed is meant to replace it.
 *
 * @param container the element the quantity fields sit in, null while nothing is drawn
 * @param index the line, counted the way it is drawn
 */
export function focusCountField(container: HTMLElement | null, index: number) {
  const field = container?.querySelector<HTMLInputElement>(`[data-count-index="${index}"]`)
  field?.focus()
  field?.select()
  // Called optionally, like the three type-aheads do it: a browser without a scroller — and
  // every test environment — has no such method, and a scan must not die on that.
  field?.scrollIntoView?.({ block: 'nearest' })
}

/**
 * What this browser last handed over for one line: the figure as it was typed, and what the
 * line said the server held at that moment.
 *
 * <p>Both halves are needed. The figure alone would swallow a re-count of the same number after
 * somebody else changed the line — the field would show it, the server would hold something
 * else, and nobody would ever be told.
 */
type Handed = { value: string; seen: number | undefined }

/** What one line looks like right now — everything a view draws, and nothing it does. */
export type CountEntry = {
  /** What stands in the field — the typed text, or what the server counted. */
  value: string
  /** Why this figure cannot go out, or undefined. Shown and not only counted: a red field
   *  without a word leaves the user guessing what is wrong with it. */
  problem: string | undefined
  /** Whether the field is to be drawn as wrong — a refused figure or a save that failed. */
  invalid: boolean
  /** Whether the last save of this line failed. The typed value stays either way. */
  failed: boolean
  /** What this line differs by against its frozen quantity, live while typing. */
  difference: number | undefined
  /** Where the way on leads, or undefined when nothing is open any more. */
  nextOpen: number | undefined
  /** Whether this is the line the overwrite question is about. */
  asking: boolean
}

/** The counting mask behind both of its views. */
export type CountEntryState = {
  /** What the view needs to draw one line. */
  entryOf: (line: StocktakeLine, index: number) => CountEntry
  /** Takes what was typed into one field. */
  typeInto: (line: StocktakeLine, value: string) => void
  /** Leaving the field saves it — the mask has no save button (Frontend-ADR-0016). */
  leaveField: (line: StocktakeLine, index: number) => void
  /** `Enter` saves and moves the focus into the next open line. */
  pressKey: (
    event: KeyboardEvent<HTMLInputElement>,
    line: StocktakeLine,
    index: number,
  ) => void
  /** Sends the same figure again after a save failed. */
  resend: (line: StocktakeLine, index: number) => void
  /** The line whose count would be overwritten, while the question stands. */
  asking: StocktakeLine | undefined
  /** The question itself, in the wording of Frontend-ADR-0016. */
  question: string
  /** Answers it with yes: the figure goes out. */
  overwrite: () => void
  /** Answers it with no: the other person's count stands. */
  keep: () => void
  /** Moves the focus into the quantity field of one line and brings it into view. */
  focusLine: (index: number) => void
}

/**
 * The counting mask of an inventory: what is typed, what goes to the server, and what is asked
 * before a count is replaced.
 *
 * <p><b>One state machine for both views.</b> The table and the cards are the same mask in two
 * layouts on one route, and the issue's argument against a second route holds against a second
 * copy of this logic just as well: it drifted apart within a day — one view read `1’200` as
 * 1200 and the other as nothing at all.
 *
 * <p>Two rules that are easy to get the wrong way round:
 *
 * <ul>
 *   <li><b>What was sent is remembered together with what the line said at the time.</b> The
 *       typed figure alone is not enough to call a count a repeat: after somebody else has
 *       changed the line, the very same figure is a re-count and has to reach the question or
 *       the server. Silence is the one thing this mask must never answer a count with.</li>
 *   <li><b>A figure that failed is forgotten as sent.</b> It is not with the server, so leaving
 *       the field again has to send it, and so does «Erneut senden».</li>
 * </ul>
 *
 * @param lines the lines on screen, in the order they are counted
 * @param blind whether the expected quantity is hidden, which leaves nothing to differ from
 * @param container the element the quantity fields sit in — a table in one view and a list of
 *        cards in the other, which is why the view holds it and hands it over
 * @param onCount saves one line; the promise answers when the backend has taken it
 * @returns the state of the mask, and the handles both views hang their fields on
 */
export function useCountEntry({
  lines,
  blind,
  container,
  onCount,
}: {
  lines: readonly StocktakeLine[]
  blind: boolean
  container: RefObject<HTMLElement | null>
  onCount: (line: StocktakeLine, quantity: number) => Promise<unknown>
}): CountEntryState {
  // What stands in each field, by line id. Only the lines somebody has typed into are in here;
  // everything else is drawn from what the server sent.
  const [typed, setTyped] = useState<Record<number, string>>({})
  // Which lines failed to save. They keep their typed value and offer to send it again.
  const [failed, setFailed] = useState<Record<number, boolean>>({})
  // The line whose count is about to be overwritten, what would overwrite it, and where it
  // stands — the place is remembered rather than looked up again, because a refetch hands out
  // new line objects and `indexOf` would then find nothing.
  const [asking, setAsking] = useState<
    { line: StocktakeLine; quantity: number; index: number } | null
  >(null)
  // What was last handed to the server, per line. `Enter` sends and then moves the focus on,
  // and that move leaves the field — without this the blur would send the same figure a second
  // time, twice per counted line for a whole count. Not state: nothing on screen depends on it.
  const handedOver = useRef<Record<number, Handed>>({})

  const valueOf = (line: StocktakeLine) =>
    typed[line.id] ?? (line.countedQuantity === undefined ? '' : String(line.countedQuantity))

  const focusLine = (index: number) => focusCountField(container.current, index)

  /**
   * Whether this figure is with the server already, so that leaving the field again is not a
   * second count but the same one.
   *
   * <p>True on two states, and on nothing else: the answer has not come back yet, or it has and
   * it says exactly what was sent. Where the line now holds something else, somebody else
   * counted it in the meantime — then this is a re-count and belongs in front of the question,
   * never in the bin.
   */
  const alreadyWithTheServer = (line: StocktakeLine, value: string, quantity: number) => {
    const handed = handedOver.current[line.id]
    if (handed === undefined || handed.value !== value) return false
    return line.countedQuantity === handed.seen || line.countedQuantity === quantity
  }

  const send = (line: StocktakeLine, index: number, force = false) => {
    const value = valueOf(line)
    if (value.trim() === '') return
    if (countProblem(value, isSerialLine(line)) !== undefined) return
    const quantity = countedQuantity(value)
    if (quantity === undefined) return

    // Nothing to send. «Erneut senden» and an answered question say otherwise and go out.
    if (!force && alreadyWithTheServer(line, value, quantity)) return

    // Somebody else already counted this line: ask before it is overwritten. Their count is a
    // statement with a name and a time on it, and two people counting one list must not quietly
    // undo each other (Frontend-ADR-0016).
    if (!force && counted(line) && line.countedQuantity !== quantity) {
      setAsking({ line, quantity, index })
      return
    }

    handedOver.current[line.id] = { value, seen: line.countedQuantity }
    void onCount(line, quantity).then(
      () => {
        setFailed((current) => ({ ...current, [line.id]: false }))
        const next = nextOpenIndex(lines, index)
        if (next !== undefined) focusLine(next)
      },
      () => {
        // Nothing arrived, so the figure is not with the server: leaving the field again has to
        // send it, and so does «Erneut senden».
        delete handedOver.current[line.id]
        setFailed((current) => ({ ...current, [line.id]: true }))
      },
    )
  }

  // Reads state and pure functions only, and hands out no handler of its own. A view calls this
  // while it renders, and everything on the way to the server reaches for a ref — which is not
  // to be touched during a render. So the handlers stand next to it, on the mask.
  const entryOf = (line: StocktakeLine, index: number): CountEntry => {
    const value = valueOf(line)
    const problem = countProblem(value, isSerialLine(line))
    const broken = failed[line.id] === true
    return {
      value,
      problem,
      invalid: problem !== undefined || broken,
      failed: broken,
      difference: blind ? undefined : typedDifference(value, line),
      nextOpen: nextOpenIndex(lines, index),
      asking: asking !== null && asking.line.id === line.id,
    }
  }

  return {
    entryOf,
    typeInto: (line, value) => setTyped((current) => ({ ...current, [line.id]: value })),
    leaveField: (line, index) => send(line, index),
    pressKey: (event, line, index) => {
      if (event.key !== 'Enter' || event.repeat) return
      event.preventDefault()
      send(line, index)
    },
    resend: (line, index) => send(line, index, true),
    asking: asking?.line,
    question:
      asking === null
        ? ''
        : overwriteQuestion(asking.line.countedBy ?? SOMEBODY, asking.line.countedAt),
    overwrite: () => {
      if (asking === null) return
      setAsking(null)
      send(asking.line, asking.index, true)
    },
    keep: () => setAsking(null),
    focusLine,
  }
}
