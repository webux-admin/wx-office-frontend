/**
 * Weeks as the time screens show them: ISO 8601, Monday to Sunday, numbered «KW 48».
 *
 * <p>Days are ISO strings, `yyyy-MM-dd`, the way the backend sends a `LocalDate`. They are
 * counted in UTC on purpose: a day carries no time zone, and letting the browser attach one
 * moves a day across a change to summer time or west of Greenwich.
 */

const DAY_MS = 86_400_000

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

const WEEKDAYS_LONG = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const

const MONTHS_SHORT = [
  'Jan.',
  'Feb.',
  'März',
  'Apr.',
  'Mai',
  'Juni',
  'Juli',
  'Aug.',
  'Sept.',
  'Okt.',
  'Nov.',
  'Dez.',
] as const

const MONTHS_LONG = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const

/**
 * @param isoDate a day, `yyyy-MM-dd`
 * @param days how many days on, negative for back
 * @returns that day, `yyyy-MM-dd`
 */
export function addDays(isoDate: string, days: number): string {
  return isoOf(new Date(dateOf(isoDate).getTime() + days * DAY_MS))
}

/**
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns 0 for Monday up to 6 for Sunday
 */
export function weekdayIndex(isoDate: string): number {
  return (dateOf(isoDate).getUTCDay() + 6) % 7
}

/**
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns the Monday of its week; the day itself on a Monday
 */
export function mondayOf(isoDate: string): string {
  return addDays(isoDate, -weekdayIndex(isoDate))
}

/**
 * @param monday the first day of a week
 * @returns the seven days from that Monday to the Sunday after it
 */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

/**
 * The number of the week a day belongs to, by ISO 8601: week 1 is the week with the year's first
 * Thursday.
 *
 * <p>The year is the one of that Thursday, which is not always the year of the day: 3 January
 * 2027 lies in week 53 of 2026, and 30 December 2024 in week 1 of 2025.
 *
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns the week, 1 to 53, and the year it counts in
 */
export function isoWeek(isoDate: string): { year: number; week: number } {
  // The Thursday of a week decides the year the week counts in.
  const thursday = thursdayOf(isoDate)
  const year = Number(thursday.slice(0, 4))
  // The 4th of January always lies in week 1.
  const firstThursday = thursdayOf(`${year}-01-04`)
  const days = (dateOf(thursday).getTime() - dateOf(firstThursday).getTime()) / DAY_MS
  return { year, week: 1 + Math.round(days / 7) }
}

/**
 * The week in one line, for the head of the week bar.
 *
 * @param monday the first day of the week
 * @returns «KW 48 · 23.–29. Nov. 2026», «KW 49 · 30. Nov. – 6. Dez. 2026» across two months,
 *          «KW 53 · 28. Dez. 2026 – 3. Jan. 2027» across two years
 */
export function weekLabel(monday: string): string {
  const start = dateOf(monday)
  const end = dateOf(addDays(monday, 6))
  const week = `KW ${isoWeek(monday).week}`
  const startDay = start.getUTCDate()
  const endDay = end.getUTCDate()
  const endText = `${endDay}. ${MONTHS_SHORT[end.getUTCMonth()]} ${end.getUTCFullYear()}`
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    const startText = `${startDay}. ${MONTHS_SHORT[start.getUTCMonth()]} ${start.getUTCFullYear()}`
    return `${week} · ${startText} – ${endText}`
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${week} · ${startDay}. ${MONTHS_SHORT[start.getUTCMonth()]} – ${endText}`
  }
  return `${week} · ${startDay}.–${endText}`
}

/**
 * A day as a column of the week bar names it.
 *
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns «Mo 23.»
 */
export function shortDayLabel(isoDate: string): string {
  return `${WEEKDAYS_SHORT[weekdayIndex(isoDate)]} ${dateOf(isoDate).getUTCDate()}.`
}

/**
 * A day as the heading of its list names it. Without the year: the week bar above says it.
 *
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns «Mittwoch, 25. November»
 */
export function dayTitle(isoDate: string): string {
  const date = dateOf(isoDate)
  const weekday = WEEKDAYS_LONG[weekdayIndex(isoDate)]
  return `${weekday}, ${date.getUTCDate()}. ${MONTHS_LONG[date.getUTCMonth()]}`
}

/**
 * @param isoDate a day, `yyyy-MM-dd`
 * @returns true for a Saturday or a Sunday
 */
export function isWeekend(isoDate: string): boolean {
  return weekdayIndex(isoDate) >= 5
}

/** The day as midnight UTC, so adding days never meets a change of the clock. */
function dateOf(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function isoOf(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

function thursdayOf(isoDate: string): string {
  return addDays(isoDate, 3 - weekdayIndex(isoDate))
}
