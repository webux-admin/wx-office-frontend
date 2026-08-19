/**
 * Turning selection values into what a dropdown and a table need.
 *
 * <p>The values themselves belong to the tenant and come from the API: the maintained lists
 * from `/api/tenants/{id}/{list}`, the structural enums from `/api/tenants/{id}/catalogues`.
 * Both arrive as code and label, and both are shaped the same way, so the same functions
 * serve them.
 */

/** The least a value needs to be offered: a code that is stored, a name that is shown. */
export type SelectableEntry = {
  code: string
  name: string
  shortName?: string
  /** Only on maintained values: false for one that may no longer be chosen. */
  active?: boolean
  /** Only on maintained values: true for the one a new record starts on. */
  isDefault?: boolean
  /** Only on structural values: false for one the tenant has hidden. */
  visible?: boolean
}

/** One option of a dropdown. */
export type SelectOption = { value: string; label: string }

/**
 * The options of a dropdown over a selection list.
 *
 * <p>A stored value that is no longer offered is added back at the end. Without it the
 * dropdown would show the next best value, and saving the record unchanged would quietly
 * move it there — a deactivated value stays valid where it is already stored.
 *
 * @param entries the values as the API returned them
 * @param stored the code the record carries, if any
 * @param storedLabel the label the API sent along with the stored code
 * @returns the options in the order they came, the stored value last if it was missing
 */
export function selectOptions(
  entries: readonly SelectableEntry[],
  stored?: string | null,
  storedLabel?: string | null,
): SelectOption[] {
  const offered = entries.filter((entry) => entry.active !== false && entry.visible !== false)
  const options = offered.map((entry) => ({ value: entry.code, label: entry.name }))
  if (!stored || options.some((option) => option.value === stored)) return options

  const known = entries.find((entry) => entry.code === stored)
  return [...options, { value: stored, label: known?.name ?? storedLabel ?? stored }]
}

/**
 * The label of one code.
 *
 * <p>An unknown code is shown as it came in rather than swallowed: a value the tenant added
 * while the list was cached should be visible, not invisible.
 *
 * @param entries the values as the API returned them
 * @param code the code the record carries
 * @returns the label, the raw code if unknown, a hyphen for an empty field
 */
export function labelForCode(
  entries: readonly SelectableEntry[],
  code: string | undefined | null,
): string {
  if (!code) return '-'
  return entries.find((entry) => entry.code === code)?.name ?? code
}

/**
 * The short label of one code, for tables and document lines where the full word does not
 * fit. Falls back to the full name where no short form is maintained.
 *
 * @param entries the values as the API returned them
 * @param code the code the record carries
 * @returns the short label, the raw code if unknown, a hyphen for an empty field
 */
export function shortLabelForCode(
  entries: readonly SelectableEntry[],
  code: string | undefined | null,
): string {
  if (!code) return '-'
  const entry = entries.find((candidate) => candidate.code === code)
  if (!entry) return code
  return entry.shortName ?? entry.name
}

/**
 * The code a new record should start with.
 *
 * @param entries the values as the API returned them
 * @returns the code marked as the default, or an empty string when none is
 */
export function defaultCodeOf(
  entries: readonly { code: string; isDefault?: boolean }[],
): string {
  return entries.find((entry) => entry.isDefault === true)?.code ?? ''
}

/**
 * Turns the translations of a mask into the `labels` map the API expects.
 *
 * <p>The name field of a mask holds the text in the tenant's default language, and the API
 * keeps that text twice: once as `name`, once as the translation for that language. Writing
 * both from the same input is the only way they cannot drift apart.
 *
 * <p>The whole map always goes out: the endpoints replace it rather than merging it, so a
 * translation left out of the payload would be dropped.
 *
 * @param name the text in the default language
 * @param translations the other languages as the mask holds them, empty values included
 * @param defaultLanguage code of the tenant's default language, empty when it is unknown
 * @returns the map to send, or `undefined` when there is nothing to translate
 */
export function labelPayload(
  name: string,
  translations: Record<string, string>,
  defaultLanguage: string,
): Record<string, string> | undefined {
  const labels: Record<string, string> = {}
  for (const [language, label] of Object.entries(translations)) {
    const trimmed = label.trim()
    if (trimmed !== '' && language !== defaultLanguage) labels[language] = trimmed
  }
  if (defaultLanguage !== '' && name.trim() !== '') labels[defaultLanguage] = name.trim()
  return Object.keys(labels).length === 0 ? undefined : labels
}

/**
 * Fills the translation fields of a mask from a stored `labels` map.
 *
 * <p>The default language is left out: its text is shown in the name field, and a second
 * field for the same value would invite the two to disagree.
 *
 * @param labels the map as the API returned it
 * @param defaultLanguage code of the tenant's default language
 * @returns the translations to edit, empty when there are none
 */
export function labelForm(
  labels: Record<string, string> | undefined,
  defaultLanguage: string,
): Record<string, string> {
  const form: Record<string, string> = {}
  for (const [language, label] of Object.entries(labels ?? {})) {
    if (language !== defaultLanguage) form[language] = label
  }
  return form
}
