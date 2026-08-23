import { parseDecimal } from '../../lib/format'
import type { DocumentCategory, DocumentType, PartnerDocumentType } from '../../lib/types'

/**
 * One copy of a kind of document while the register is being edited.
 *
 * <p>The count is a string, because that is what an input holds. `defaultCopies` travels with
 * it so the mask can say what it deviates from — and so the payload can leave out everything
 * that matches.
 */
export type CopyRow = {
  position: number
  label: string
  defaultCopies: number
  /** How many sheets this customer gets, as typed. `0` means they do not get it. */
  copies: string
}

/**
 * One step of a sale while the assignment is being edited.
 *
 * <p>`documentTypeId` is empty for «the default of the step applies». That is a real choice
 * and not a missing value: an empty row still travels, because it may carry copy counts, but
 * without a kind the backend keeps the customer on the default.
 */
export type AssignmentRow = {
  category: DocumentCategory
  /** Id of the kind this customer gets, as a string; empty means the default of the step. */
  documentTypeId: string
  /** One row per copy of that kind, in printing order. */
  copies: CopyRow[]
}

/** How many sheets one copy may ask for; the backend agrees. */
export const MAX_SHEETS = 99

/**
 * Fills the mask from what the backend answered.
 *
 * <p>An entry the customer did not override keeps an empty id, so it stays on the default
 * even when that default moves later.
 *
 * @param assigned the effective kinds as the API returned them
 * @returns one row per step of a sale, in the order they came
 */
export function toAssignmentRows(
  assigned: readonly PartnerDocumentType[] | undefined,
): AssignmentRow[] {
  return (assigned ?? []).map((entry) => ({
    category: entry.category,
    documentTypeId: entry.overridden ? `${entry.documentTypeId}` : '',
    copies: (entry.copies ?? []).map((copy) => ({
      position: copy.position,
      label: copy.label,
      defaultCopies: copy.defaultCopies,
      copies: `${copy.copies}`,
    })),
  }))
}

/**
 * What the kind is called that a step of a sale falls back to.
 *
 * <p>Read from the catalogue rather than from the answer: the answer names the kind that
 * applies, which for an overridden step is not the default one.
 *
 * @param types every kind of the tenant
 * @param category the step of a sale
 * @returns its name, or `null` when the tenant marked none for that step
 */
export function defaultNameOf(
  types: readonly DocumentType[],
  category: DocumentCategory,
): string | null {
  return (
    types.find((type) => type.category === category && type.categoryDefault === true)?.name ??
    null
  )
}

/** One assignment as `PUT /partners/{id}/document-types` takes it. */
export type AssignmentPayload = {
  assignments: {
    category: DocumentCategory
    documentTypeId?: number
    copies: { position: number; copies: number }[]
  }[]
}

/**
 * Turns the mask into the payload of `PUT /partners/{id}/document-types`.
 *
 * <p>A step travels when it has something to say: a kind of its own, or a copy count that
 * differs from the kind of document. A step that says neither is left out, and the customer
 * then follows the default in both respects.
 *
 * <p>The counts that match are dropped here as well as in the backend. Sending them would be
 * harmless — the backend filters again — but the payload is easier to read without them.
 *
 * @param rows the rows of the mask
 * @returns the assignments as the API wants them
 */
export function assignmentPayload(rows: readonly AssignmentRow[]): AssignmentPayload {
  const assignments = rows
    .map((row) => ({
      category: row.category,
      documentTypeId: row.documentTypeId === '' ? undefined : Number(row.documentTypeId),
      copies: row.copies
        .filter((copy) => (parseDecimal(copy.copies) ?? copy.defaultCopies) !== copy.defaultCopies)
        .map((copy) => ({
          position: copy.position,
          copies: parseDecimal(copy.copies) ?? copy.defaultCopies,
        })),
    }))
    .filter((entry) => entry.documentTypeId !== undefined || entry.copies.length > 0)
  return { assignments }
}

/**
 * Checks the rules the backend would otherwise answer with, so the mask can name the problem
 * before the request goes out.
 *
 * @param rows the rows of the mask
 * @returns the first German complaint, or `null` when the register may be sent
 */
export function assignmentComplaint(rows: readonly AssignmentRow[]): string | null {
  for (const row of rows) {
    for (const copy of row.copies) {
      const sheets = parseDecimal(copy.copies)
      if (sheets === null) return `Die Anzahl bei «${copy.label}» ist keine Zahl.`
      if (!Number.isInteger(sheets)) {
        return `Die Anzahl bei «${copy.label}» ist eine ganze Zahl.`
      }
      if (sheets < 0 || sheets > MAX_SHEETS) {
        return `Die Anzahl bei «${copy.label}» liegt zwischen 0 und ${MAX_SHEETS}.`
      }
    }
  }
  return null
}

/**
 * Says what a copy count means, for the line under the field.
 *
 * @param copy the row
 * @returns for example «Wie die Belegart: 2» or «Wird für diesen Kunden nicht gedruckt»
 */
export function describeCopyRow(copy: CopyRow): string {
  const sheets = parseDecimal(copy.copies)
  if (sheets === 0) return 'Wird für diesen Kunden nicht gedruckt.'
  if (sheets === copy.defaultCopies) return `Wie die Belegart: ${copy.defaultCopies}.`
  return `Abweichend. Die Belegart sagt ${copy.defaultCopies}.`
}
