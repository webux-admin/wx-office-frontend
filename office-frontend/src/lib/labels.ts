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
  SUBSCRIPTION: 'Abonnemente',
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
  MANAGE: 'Verwalten',
  RUN: 'Ausführen',
  VIEW: 'Ansehen',
  EXPORT: 'Exportieren',
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
