import type { DocumentChainEntry, DocumentRelation } from '../../lib/types'

/** What each relation is called in the register. */
const RELATION_LABELS: Record<DocumentRelation, string> = {
  SELF: 'Dieser Beleg',
  PREDECESSOR: 'Vorgängerbeleg',
  SUCCESSOR: 'Nachfolgebeleg',
  REVERSAL: 'Storno',
  RELATED: 'Verwandt',
}

/**
 * What a relation is called.
 *
 * @param relation the relation as the API returned it
 * @returns its German name, and the code itself for one this version does not know
 */
export function relationLabel(relation: DocumentRelation): string {
  return RELATION_LABELS[relation] ?? relation
}

/**
 * The documents that were written from this one.
 *
 * <p>Only the direct ones would be a half answer: a Rechnung written from a Lieferschein of
 * this Auftrag came out of this Auftrag too, and whoever is about to take the document back
 * has to know about it.
 *
 * @param chain the chain as the API returned it
 * @returns the successors, oldest first, empty when nothing was written from this document
 */
export function successorsOf(
  chain: readonly DocumentChainEntry[] | undefined,
): DocumentChainEntry[] {
  return (chain ?? []).filter((entry) => entry.relation === 'SUCCESSOR')
}

/**
 * The sentence that warns about documents written from this one.
 *
 * <p>Named rather than counted: «2 Nachfolgebelege» sends the reader to the register, while
 * the numbers answer the question on the spot. Beyond three the count takes over, because a
 * header line is not a list.
 *
 * @param chain the chain as the API returned it
 * @returns the sentence, or `null` where nothing was written from this document
 */
export function successorNotice(
  chain: readonly DocumentChainEntry[] | undefined,
): string | null {
  const successors = successorsOf(chain)
  if (successors.length === 0) return null
  const named = successors
    .slice(0, 3)
    .map((entry) => entry.documentNumber ?? `Entwurf ${entry.id}`)
  const rest = successors.length - named.length
  const list = named.join(', ') + (rest > 0 ? ` und ${rest} weitere` : '')
  return successors.length === 1
    ? `Aus diesem Beleg wurde ${list} geschrieben.`
    : `Aus diesem Beleg wurden ${list} geschrieben.`
}

/**
 * How a chain entry is written in a row: number first, kind of document after it.
 *
 * @param entry one document of the chain
 * @returns for example «RE-2026-0007 · Rechnung», and the draft wording where there is no
 *          number yet
 */
export function chainEntryLabel(entry: DocumentChainEntry): string {
  return `${entry.documentNumber ?? `Entwurf ${entry.id}`} · ${entry.documentTypeName}`
}
