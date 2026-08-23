/**
 * Translating the due moment of a reminder between its two forms.
 *
 * <p>A reminder is typed as a local day and a local time of day, but the backend stores an
 * instant. {@link composeDueAt} and {@link splitDueAt} are inverses of each other on whole
 * minutes: splitting what was composed hands the two field values back unchanged.
 */

/**
 * Turns the two field values of a reminder into the ISO instant the backend stores.
 *
 * <p>The fields are read as local time, because that is what the person typing them means: a
 * reminder for 09:00 is due at nine on their clock. Seconds are zero — the fields edit whole
 * minutes.
 *
 * @param date the day as `yyyy-MM-dd`, the way a date input holds it
 * @param time the time of day as `HH:mm`, the way a time input holds it
 * @returns the ISO instant in UTC
 * @throws Error when one of the two fields is not a complete value
 */
export function composeDueAt(date: string, time: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!dateMatch || !timeMatch) {
    throw new Error(`Kein vollständiger Zeitpunkt: "${date}" "${time}"`)
  }
  const moment = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  )
  return moment.toISOString()
}

/**
 * Splits a stored instant back into the two field values a reminder is edited with.
 *
 * <p>The instant is turned into local time first, so what the fields show is what
 * {@code formatDateTime} shows next to them. Seconds are dropped — the fields edit whole
 * minutes.
 *
 * @param iso the ISO instant as the backend sent it
 * @returns the local day as `yyyy-MM-dd` and the local time of day as `HH:mm`
 * @throws Error when the value is not a readable instant
 */
export function splitDueAt(iso: string): { date: string; time: string } {
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) {
    throw new Error(`Kein lesbarer Zeitpunkt: "${iso}"`)
  }
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return {
    date: `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`,
    time: `${pad(moment.getHours())}:${pad(moment.getMinutes())}`,
  }
}
