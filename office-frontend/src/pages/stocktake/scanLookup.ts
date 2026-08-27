import { createContext } from 'react'

/**
 * The road the counting mask takes to narrow its lines — the one the jump field uses.
 *
 * <p>Held by the mask and not by a view, because the mask is what knows that the lines arrive a
 * page at a time and that a chip may be in force. The camera reaches for it so that a read code
 * is searched over the <b>whole</b> count list rather than over the rows that happen to be
 * drawn: with «Offen» pressed every line somebody already counted is missing from them, and
 * past the first page nothing is on them at all.
 */
export type ScanLookup = {
  /**
   * Puts a scanned code into the jump field, clears the chip and goes back to the first page.
   *
   * <p>All three, because all three hide lines: a code whose line the chip filtered away is
   * still on the count list.
   */
  narrowTo: (code: string) => void
  /** The term the lines on screen were fetched with. */
  term: string
  /** True while the answer to the current term is still on its way. */
  pending: boolean
}

/**
 * Whether the mask around a view hangs the camera in itself.
 *
 * <p>It does, and above both layouts: a scan block inside a view is torn down the moment the
 * lines it was handed run out, and a search that found nothing is exactly when the sentence
 * about it has to stay readable and the camera has to stay reachable for the next article. The
 * views keep asking for the block — they are one mask in two layouts and neither owns the
 * camera — and it steps aside where the mask has one of its own.
 *
 * <p>False outside such a mask, for instance where a view is rendered on its own.
 */
export const ScanHandledByTheMask = createContext(false)
