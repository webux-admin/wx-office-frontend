/** Formatting helpers for Swiss German output. */

const AMOUNT = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const COUNT = new Intl.NumberFormat('de-CH')

const QUANTITY = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 })

// `numeric: 'auto'` so a distance of zero reads "jetzt" rather than "in 0 Sekunden".
const RELATIVE = new Intl.RelativeTimeFormat('de-CH', { numeric: 'auto' })

const DATE_TIME = new Intl.DateTimeFormat('de-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const LONG_DATE = new Intl.DateTimeFormat('de-CH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/**
 * Formats an amount the way it is printed on a document: two decimals, apostrophe as
 * thousands separator. The currency is not appended: it belongs next to the number, not
 * inside it, because a column of amounts shows the currency once in its header.
 *
 * @param value the amount, `undefined` for an unknown one
 * @returns the formatted amount, or a hyphen when there is nothing to show
 */
export function formatAmount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-'
  return AMOUNT.format(value)
}

/**
 * Formats a whole number, for example a record count.
 *
 * @param value the number, `undefined` for an unknown one
 * @returns the formatted number, or a hyphen when there is nothing to show
 */
export function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-'
  return COUNT.format(value)
}

/**
 * Formats a date as it appears under a page title, for example
 * "Dienstag, 18. August 2026".
 *
 * @param value the date
 * @returns the formatted date
 */
export function formatLongDate(value: Date): string {
  return LONG_DATE.format(value)
}

/**
 * Formats a date the backend sent as an ISO day, for example `2026-08-18` as `18.08.2026`.
 *
 * <p>The string is taken apart rather than parsed into a `Date`: a `LocalDate` carries no
 * time zone, and letting the browser attach one shifts the day west of Greenwich.
 *
 * @param value the ISO day, `undefined` for an empty field
 * @returns the formatted day, or a hyphen when there is nothing to show
 */
export function formatDate(value: string | undefined | null): string {
  if (!value) return '-'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  return `${match[3]}.${match[2]}.${match[1]}`
}

/**
 * Formats an instant as day and time, for example `18.08.2026, 14:05`.
 *
 * <p>Unlike a date, an instant is a point on the timeline and is shown in the reader time
 * zone on purpose.
 *
 * @param value the ISO instant, `undefined` for an empty field
 * @returns the formatted moment, or a hyphen when there is nothing to show
 */
export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '-'
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return value
  return DATE_TIME.format(moment)
}

/**
 * Steps of {@link formatRelativeTime}, from the finest upwards. The limit is the point at
 * which the next unit takes over.
 */
const RELATIVE_STEPS: { limit: number; seconds: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, seconds: 1, unit: 'second' },
  { limit: 3600, seconds: 60, unit: 'minute' },
  { limit: 86_400, seconds: 3600, unit: 'hour' },
  { limit: 2_592_000, seconds: 86_400, unit: 'day' },
  { limit: 31_536_000, seconds: 2_592_000, unit: 'month' },
  { limit: Number.POSITIVE_INFINITY, seconds: 31_536_000, unit: 'year' },
]

/**
 * Says how long ago something happened, for example "vor 5 Minuten".
 *
 * <p>Answers the question people actually ask of a timestamp in a list, which is not "when
 * exactly" but "recently or long ago". The exact moment belongs next to it, in a tooltip.
 *
 * @param value the ISO instant, `undefined` for an empty field
 * @param now the moment to measure against, injectable so a test is not at the mercy of the clock
 * @returns the distance in words, or a hyphen when there is nothing to show
 */
export function formatRelativeTime(
  value: string | undefined | null,
  now: Date = new Date(),
): string {
  if (!value) return '-'
  const moment = new Date(value)
  if (Number.isNaN(moment.getTime())) return value

  const seconds = (moment.getTime() - now.getTime()) / 1000
  const step = RELATIVE_STEPS.find((entry) => Math.abs(seconds) < entry.limit)
  // The list is closed by an infinite limit, so there is always a step; the fallback only
  // satisfies the type.
  const chosen = step ?? RELATIVE_STEPS[RELATIVE_STEPS.length - 1]
  return RELATIVE.format(Math.round(seconds / chosen.seconds), chosen.unit)
}

/**
 * Formats a quantity, dropping decimals that carry no information.
 *
 * <p>Three pieces are `3`, not `3.000`, but a quarter hour stays `0.25`.
 *
 * @param value the quantity, `undefined` for an unknown one
 * @returns the formatted quantity, or a hyphen when there is nothing to show
 */
export function formatQuantity(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-'
  return QUANTITY.format(value)
}

/**
 * Formats a percentage, for example a VAT or discount rate.
 *
 * @param value the percentage, `undefined` for an unknown one
 * @returns the formatted percentage including the sign, or a hyphen
 */
export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-'
  return `${QUANTITY.format(value)} %`
}

/**
 * Reads a number a user typed into a form field.
 *
 * <p>Accepts the comma as a decimal separator, because that is what a Swiss keyboard offers,
 * and the apostrophe as a thousands separator, because that is how amounts are shown back.
 *
 * @param input the raw field value
 * @returns the number, or `null` when the field is empty or not a number
 */
export function parseDecimal(input: string): number | null {
  const cleaned = input.trim().replace(/[’']/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * The current day as the ISO string a `<input type="date">` and the backend both expect.
 *
 * <p>Built from the local calendar fields rather than `toISOString`, which would jump to the
 * previous day for anyone east of Greenwich in the early hours.
 *
 * @param today the day to format, the current one by default
 * @returns the day as `yyyy-MM-dd`
 */
export function toIsoDate(today: Date = new Date()): string {
  const month = `${today.getMonth() + 1}`.padStart(2, '0')
  const day = `${today.getDate()}`.padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

/**
 * Builds the initials shown in an avatar.
 *
 * <p>Takes the first letter of the first and the last word, so "Martin Muster" becomes MM
 * and a single name still yields one letter rather than nothing.
 *
 * @param name the display name
 * @returns one or two upper case letters, empty for an empty name
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
