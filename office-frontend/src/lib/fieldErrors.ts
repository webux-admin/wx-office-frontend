/**
 * Field errors: which message belongs under which field.
 *
 * <p>Two sources feed them. The mask checks what it can before sending, and the backend answers
 * a refused request with a list `errors` of `{ field, message }` inside its `ProblemDetail`
 * (backend ADR-0132). Both end up in the same shape, so a field does not care where its
 * message came from.
 */
import { ApiError } from './api'

/** Message per field name, for example `{ uid: 'Keine gültige Schweizer UID' }`. */
export type FieldErrors = Readonly<Record<string, string>>

/**
 * Reads the field errors out of a failed request.
 *
 * <p>The backend names a field by its path in the request body. An index is dropped —
 * `addresses[0].town` becomes `addresses.town` — because a mask that collects one address does
 * not count. With `prefix`, a mask whose body is the nested object itself reads its own names:
 * the address dialog strips `addresses.` and finds `town`. A name without the prefix is kept as
 * it is, since bean validation on that endpoint names it plainly.
 *
 * <p>The first message per field wins; a second rule broken on the same field adds nothing a
 * user could act on before fixing the first.
 *
 * @param error what the request threw, anything at all
 * @param prefix the path of the nested object this mask edits, such as `addresses.`
 * @returns the messages per field, empty when the error carries none
 */
export function fieldErrorsOf(error: unknown, prefix = ''): FieldErrors {
  if (!(error instanceof ApiError)) return {}
  const details = error.details
  if (!details || typeof details !== 'object') return {}
  const entries = (details as { errors?: unknown }).errors
  if (!Array.isArray(entries)) return {}

  const result: Record<string, string> = {}
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const { field, message } = entry as { field?: unknown; message?: unknown }
    if (typeof field !== 'string' || typeof message !== 'string') continue
    const name = withoutPrefix(field.replace(/\[\d+\]/g, ''), prefix)
    if (!(name in result)) result[name] = message
  }
  return result
}

function withoutPrefix(field: string, prefix: string): string {
  return prefix !== '' && field.startsWith(prefix) ? field.slice(prefix.length) : field
}

/**
 * Whether an error is fully told by the fields of a mask.
 *
 * <p>When it is, the messages stand at their fields and a notice above the form would only say
 * the same thing a second time. When it is not — a rule about the record as a whole, or a field
 * this mask does not show — the notice is the only place the user learns about it.
 *
 * @param error what the request threw
 * @param shown the field names this mask draws a message for
 * @param prefix the same prefix as for {@link fieldErrorsOf}
 * @returns true when every message of the error stands at a shown field
 */
export function isToldByFields(error: unknown, shown: readonly string[], prefix = ''): boolean {
  const fields = Object.keys(fieldErrorsOf(error, prefix))
  return fields.length > 0 && fields.every((field) => shown.includes(field))
}

/**
 * The messages of a nested object, under its own field names.
 *
 * <p>A mask that collects a partner and its first address holds both under one set of names
 * (`name` and `addresses.name`); the address fields only want theirs, without the prefix.
 *
 * @param errors the messages of the whole form
 * @param prefix the path of the nested object, such as `addresses.`
 * @returns the messages whose field starts with the prefix, with the prefix taken off
 */
export function nestedErrors(errors: FieldErrors, prefix: string): FieldErrors {
  const result: Record<string, string> = {}
  for (const [field, message] of Object.entries(errors)) {
    if (field.startsWith(prefix)) result[field.slice(prefix.length)] = message
  }
  return result
}

/**
 * Puts a nested object's messages under the names they have in the whole form.
 *
 * @param errors the messages of the nested object, under its own field names
 * @param prefix the path of the nested object, such as `addresses.`
 * @returns the same messages with the prefix in front of each field
 */
export function prefixedErrors(errors: FieldErrors, prefix: string): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).map(([field, message]) => [`${prefix}${field}`, message]),
  )
}

/**
 * The first message per item of a list, by the index the backend names the item with.
 *
 * <p>A refused document names its position as `lines[2].serviceDateTo`. The index is what tells
 * the mask which position the message belongs to, so `fieldErrorsOf`, which drops it, does not
 * serve here.
 *
 * @param error what the request threw, anything at all
 * @param list the name of the list, such as `lines`
 * @returns the first message of each index that carries one
 */
export function listItemErrorsOf(error: unknown, list: string): ReadonlyMap<number, string> {
  const result = new Map<number, string>()
  if (!(error instanceof ApiError)) return result
  const details = error.details
  if (!details || typeof details !== 'object') return result
  const entries = (details as { errors?: unknown }).errors
  if (!Array.isArray(entries)) return result

  const prefix = `${list}[`
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const { field, message } = entry as { field?: unknown; message?: unknown }
    if (typeof field !== 'string' || typeof message !== 'string') continue
    if (!field.startsWith(prefix)) continue
    const close = field.indexOf(']', prefix.length)
    const index = Number(field.slice(prefix.length, close))
    if (close < 0 || !Number.isInteger(index) || !field.startsWith('.', close + 1)) continue
    if (!result.has(index)) result.set(index, message)
  }
  return result
}
