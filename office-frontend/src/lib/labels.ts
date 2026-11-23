/**
 * German wording for the codes the backend speaks in — those, and only those, that no
 * endpoint labels.
 *
 * <p>Selection values and structural enums are labelled by the tenant and read from the API
 * (see `masterdata/useMasterData`). What is left here is the permission catalogue: it is the
 * vocabulary of the application itself, the same for every tenant, and comes back as bare
 * codes.
 */

/**
 * Looks a code up in a table of labels.
 *
 * <p>An unknown code is shown as it came in rather than swallowed: a value the backend added
 * and the frontend has not learned yet should be visible, not invisible.
 *
 * @param labels the table to look in
 * @param code the code from the API, `undefined` when the field is empty
 * @returns the German label, the raw code if unknown, a hyphen for an empty field
 */
export function labelOf<T extends string>(
  labels: Record<T, string>,
  code: T | string | undefined | null,
): string {
  if (!code) return '-'
  return (labels as Record<string, string>)[code] ?? code
}

/** Modules of the permission catalogue, in the order the backend returns them. */
export const PERMISSION_MODULES: Record<string, string> = {
  TENANT: 'Mandant',
  MASTERDATA: 'Stammdaten',
  NUMBERING: 'Nummernkreise',
  PARTNER: 'Kunden und Lieferanten',
  PRODUCT: 'Produkte',
  DOCUMENT: 'Belegarten',
  OFFER: 'Offerten',
  ORDER: 'Aufträge',
  DELIVERY_NOTE: 'Lieferscheine',
  INVOICE: 'Rechnungen',
  CREDIT_NOTE: 'Gutschriften',
  INVENTORY: 'Lager',
  OUTBOX: 'Postausgang',
  DUNNING: 'Mahnwesen',
  BANKING: 'Bankauszug',
  ACCOUNTING: 'Buchhaltung',
  PROJECT: 'Projekte',
  CONTRACT: 'Verträge',
  // The run, not the contract: what is agreed lives in CONTRACT (backend ADR-0136).
  SUBSCRIPTION: 'Abo-Lauf',
  TIMETRACKING: 'Zeiterfassung',
  USER: 'Benutzer',
  REPORT: 'Auswertungen',
}

/**
 * The verb of a permission code, without repeating the module it belongs to.
 *
 * <p>Used in the permission matrix, where the module already stands in the row heading and
 * `PARTNER_WRITE` only has to say "Bearbeiten".
 */
const PERMISSION_VERBS: Record<string, string> = {
  READ: 'Lesen',
  WRITE: 'Bearbeiten',
  DEACTIVATE: 'Deaktivieren',
  FINALISE: 'Ausstellen',
  REOPEN: 'Zurückstellen',
  CANCEL: 'Stornieren',
  CONFIGURE: 'Einrichten',
  MANAGE: 'Verwalten',
  RUN: 'Ausführen',
  // Its own verb beside «Bearbeiten»: after posting nothing is correctable any more, and a
  // right that reads «Bearbeiten» would be granted to whoever captures a draft.
  POST: 'Verbuchen',
  // The act at the fiscal year — locking a period, closing and reopening a year.
  CLOSE: 'Abschliessen',
  VIEW: 'Ansehen',
  EXPORT: 'Exportieren',
  // The time tracking: one's own times. The times of everybody are «Lesen», those of others
  // «Bearbeiten» — the line under each right says so (see PERMISSION_HINTS).
  TRACK: 'Erfassen',
  BILL: 'Abrechnen',
}

/**
 * Codes whose bare verb would not tell them apart from their neighbours in the matrix.
 *
 * <p>`VAT_RATE_WRITE` sits in the PRODUCT module next to `PRODUCT_WRITE`; two rows both
 * saying "Bearbeiten" would be indistinguishable, so this one names its subject.
 */
const PERMISSION_LABELS: Record<string, string> = {
  VAT_RATE_WRITE: 'MwSt-Sätze pflegen',
}

/**
 * Turns a permission code into the action it allows.
 *
 * @param code a permission code such as `PARTNER_DEACTIVATE`
 * @returns the German label, or the raw code when its ending is unknown
 */
export function permissionAction(code: string): string {
  const special = PERMISSION_LABELS[code]
  if (special) return special
  const verb = code.slice(code.lastIndexOf('_') + 1)
  return PERMISSION_VERBS[verb] ?? code
}

/**
 * One line under a right in the permission matrix, for the rights whose verb alone would be
 * read wrongly.
 *
 * <p>The time tracking is why it exists. Its «Lesen» means the times of everybody — one's own
 * come with «Erfassen» —, its «Bearbeiten» the times of others, and «Abrechnen» does nothing
 * without the right to write invoices. The times of others are personal data about how somebody
 * works (OR Art. 328b, backend ADR-0159): whoever grants them should read what they grant.
 */
const PERMISSION_HINTS: Record<string, string> = {
  TIME_TRACK: 'Eigene Zeiten erfassen, ändern und löschen, mit eigener Stoppuhr.',
  TIME_READ: 'Die Zeiten aller Benutzer lesen, auswerten und exportieren.',
  TIME_WRITE:
    'Zeiten anderer erfassen und ändern, Projektbedingungen, Standardleistungen und Abrechnungstakt pflegen.',
  TIME_BILL: 'Zeiten in Rechnungsentwürfe übernehmen, nur zusammen mit «Rechnungen: Bearbeiten».',
}

/**
 * Says in one line what a right allows, where its verb does not.
 *
 * @param code a permission code such as `TIME_READ`
 * @returns the German line, or `undefined` for a right whose verb says it all
 */
export function permissionHint(code: string): string | undefined {
  return Object.hasOwn(PERMISSION_HINTS, code) ? PERMISSION_HINTS[code] : undefined
}
