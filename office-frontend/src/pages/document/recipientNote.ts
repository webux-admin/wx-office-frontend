import type { DocumentStatus } from '../../lib/types'

/**
 * What the recipient section says about where its name and address come from.
 *
 * <p>The two answers are not the same promise. A draft follows the partner record: change the
 * address of the customer and the draft is pulled along (ADR-0040). Issuing the document is
 * what freezes the copy, and from then on it stays the way it was sent — that is the sentence
 * an issued or cancelled document keeps.
 *
 * @param status the status of the document
 * @returns the sentence for the section header, never empty
 */
export function recipientNote(status: DocumentStatus): string {
  return status === 'DRAFT'
    ? 'Folgt dem Kunden: solange der Beleg Entwurf ist, zieht eine geänderte Adresse nach.'
    : 'Kopie aus den Stammdaten, festgehalten beim Ausstellen.'
}
