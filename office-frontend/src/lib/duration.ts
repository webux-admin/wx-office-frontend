/**
 * Durations as people type them into one field, and as the time screens write them back.
 *
 * <p>Its own building block because the rule is the reading and not the screen: «1:30», «1.5»,
 * «90m» and «9-10:30» all mean an hour and a half, and that is worth testing without a renderer.
 * The backend knows only minutes and times of day; reading «1:30» is the work of the screen
 * (backend ADR-0160, frontend ADR-0082).
 */

/** The shortest entry the backend takes: one minute. */
export const MIN_DURATION_MINUTES = 1

/** The longest entry the backend takes: one whole day. */
export const MAX_DURATION_MINUTES = 1440

const MINUTES_PER_HOUR = 60

/** What a duration field means once it is read. */
export type Duration = {
  /** How long, in whole minutes, 1 to 1440. */
  minutes: number
  /** From, `HH:mm`; only where a range was typed. */
  startTime?: string
  /** To, `HH:mm`; only where a range was typed. `00:00` is midnight at the end of the day. */
  endTime?: string
}

/** What a duration field says: nothing yet, a duration, or why it is none. */
export type DurationReading =
  | { state: 'empty' }
  | { state: 'read'; duration: Duration }
  | { state: 'refused'; message: string }

const UNKNOWN = 'Keine Dauer erkannt. Zum Beispiel 1:30, 1.5, 90m oder 9-10:30.'
const TOO_SHORT = 'Eine Dauer ist mindestens 1 Minute lang.'
const TOO_LONG = 'Eine Dauer ist höchstens 24 Stunden lang.'
const NOT_AFTER =
  'Bis muss nach Von liegen. Eine Zeit über Mitternacht wird als zwei Einträge erfasst.'

/** A time of day in a range: hours alone, or hours and two digits of minutes. */
const CLOCK = '(\\d{1,2})(?::(\\d{2}))?'

/** «9-10:30», «9:00 - 10:30», also with the dash a Mac keyboard types. */
const RANGE = new RegExp(`^${CLOCK}\\s*[-–—]\\s*${CLOCK}$`)

/** «1:30» — hours and minutes. */
const HOURS_AND_MINUTES = /^(\d{1,2}):(\d{2})$/

/** «1.5», «1,5», «2» — hours, a decimal fraction allowed. */
const DECIMAL_HOURS = /^(\d+(?:[.,]\d+)?)$/

/**
 * «2h», «1.5h», «2h 15m», «2h15», and the words the screen writes itself: «1 Std. 30 Min.». The
 * hours may carry a fraction, the minutes after them may not.
 */
const HOURS_FIRST = /^(\d+(?:[.,]\d+)?)\s*(?:h|std\.?)(?:\s*(\d+)\s*(?:m|min\.?)?)?$/

/** «90m», «90 min» — minutes alone. */
const MINUTES_ONLY = /^(\d+)\s*(?:m|min\.?)$/

/**
 * Reads what was typed into a duration field.
 *
 * <p>A number without a unit is hours: «2» is two hours, «1.5» and «1,5» an hour and a half. A
 * fraction of an hour is rounded to the minute, because an entry is kept to the minute. A range
 * keeps its times of day; its end «0» or «24:00» is midnight at the end of the day.
 *
 * @param input what stands in the field
 * @returns `empty` for a blank field, `read` with the minutes (and the range, where one was
 *          typed), or `refused` with the sentence the field shows: nothing recognisable, less
 *          than one minute, more than 24 hours, or a range that does not end after it starts —
 *          one over midnight included
 */
export function readDuration(input: string): DurationReading {
  const text = input.trim().toLowerCase()
  if (text === '') return { state: 'empty' }

  const range = RANGE.exec(text)
  if (range) return readRange(range)

  const clock = HOURS_AND_MINUTES.exec(text)
  if (clock) {
    const minutes = Number(clock[2])
    if (minutes >= MINUTES_PER_HOUR) return refused(UNKNOWN)
    return bounded(Number(clock[1]) * MINUTES_PER_HOUR + minutes)
  }

  const decimal = DECIMAL_HOURS.exec(text)
  if (decimal) return bounded(hoursToMinutes(decimal[1]))

  const hoursFirst = HOURS_FIRST.exec(text)
  if (hoursFirst) {
    const minutes = hoursFirst[2] === undefined ? 0 : Number(hoursFirst[2])
    return bounded(hoursToMinutes(hoursFirst[1]) + minutes)
  }

  const minutesOnly = MINUTES_ONLY.exec(text)
  if (minutesOnly) return bounded(Number(minutesOnly[1]))

  return refused(UNKNOWN)
}

/**
 * A duration the way a sentence says it.
 *
 * @param minutes how long, not negative
 * @returns «1 Std. 30 Min.», «45 Min.», «2 Std.»; «0 Min.» for nothing
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  if (hours === 0) return `${rest} Min.`
  if (rest === 0) return `${hours} Std.`
  return `${hours} Std. ${rest} Min.`
}

/**
 * A duration the way a column of hours shows it: short, and with the minutes always two digits,
 * so the figures stand under each other.
 *
 * <p>The hours are not cut off at 24: a week of work reads «42:30».
 *
 * @param minutes how long, not negative
 * @returns «1:30», «0:45», «0:00», «42:30»
 */
export function formatDurationShort(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  return `${hours}:${String(rest).padStart(2, '0')}`
}

/**
 * A time of day the way the backend writes it.
 *
 * @param minutes minutes since midnight; 1440 is midnight at the end of the day
 * @returns `HH:mm`, «00:00» for both midnights
 */
export function clockTime(minutes: number): string {
  const ofDay = minutes % MAX_DURATION_MINUTES
  const hours = Math.floor(ofDay / MINUTES_PER_HOUR)
  const rest = ofDay % MINUTES_PER_HOUR
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/**
 * Reads a range: the two times of day, and the minutes between them.
 *
 * <p>The end may be «0» or «24:00», both midnight at the end of the day — the backend writes that
 * as `00:00`. An end at or before the start is refused: a time over midnight is two entries.
 */
function readRange(match: RegExpExecArray): DurationReading {
  const start = minutesOfDay(match[1], match[2])
  const end = minutesOfDay(match[3], match[4])
  if (start === null || end === null) return refused(UNKNOWN)
  const until = end === 0 ? MAX_DURATION_MINUTES : end
  const minutes = until - start
  if (minutes <= 0) return refused(NOT_AFTER)
  return {
    state: 'read',
    duration: { minutes, startTime: clockTime(start), endTime: clockTime(until) },
  }
}

/**
 * Minutes since midnight of a time of day in a range.
 *
 * @returns the minutes, 0 to 1440; `null` for something that is no time of day, like «25» or
 *          «9:75». 24 is allowed with no minutes only, as the end of the day
 */
function minutesOfDay(hours: string, minutes: string | undefined): number | null {
  const hour = Number(hours)
  const minute = minutes === undefined ? 0 : Number(minutes)
  if (minute >= MINUTES_PER_HOUR) return null
  if (hour > 24 || (hour === 24 && minute > 0)) return null
  return hour * MINUTES_PER_HOUR + minute
}

/** Hours as typed, a comma or a point before the fraction, rounded to the minute. */
function hoursToMinutes(hours: string): number {
  return Math.round(Number(hours.replace(',', '.')) * MINUTES_PER_HOUR)
}

/** A plain duration, held against the shortest and the longest entry. */
function bounded(minutes: number): DurationReading {
  if (minutes < MIN_DURATION_MINUTES) return refused(TOO_SHORT)
  if (minutes > MAX_DURATION_MINUTES) return refused(TOO_LONG)
  return { state: 'read', duration: { minutes } }
}

function refused(message: string): DurationReading {
  return { state: 'refused', message }
}
