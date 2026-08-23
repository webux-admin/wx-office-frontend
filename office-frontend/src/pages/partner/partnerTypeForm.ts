import type { DocumentCategory, DocumentType, PartnerDocumentType } from '../../lib/types'

/**
 * One step of a sale while the assignment is being edited.
 *
 * <p>`documentTypeId` is empty for «the default of the step applies». That is a real choice
 * and not a missing value: an empty row is left out of the payload, and the backend then
 * falls back to the default — which is exactly what the row says.
 */
export type AssignmentRow = {
  category: DocumentCategory
  /** Id of the kind this customer gets, as a string; empty means the default of the step. */
  documentTypeId: string
}

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
  assignments: { category: DocumentCategory; documentTypeId: number }[]
}

/**
 * Turns the mask into the payload of `PUT /partners/{id}/document-types`.
 *
 * <p>Only the rows that name a kind travel. A step the payload leaves out loses its
 * assignment, which is how a row goes back to the default of the step.
 *
 * @param rows the rows of the mask
 * @returns the assignments as the API wants them
 */
export function assignmentPayload(rows: readonly AssignmentRow[]): AssignmentPayload {
  return {
    assignments: rows
      .filter((row) => row.documentTypeId !== '')
      .map((row) => ({
        category: row.category,
        documentTypeId: Number(row.documentTypeId),
      })),
  }
}
