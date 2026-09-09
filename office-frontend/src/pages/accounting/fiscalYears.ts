import { toIsoDate } from '../../lib/format'
import type { FiscalYear } from '../../lib/types'

/**
 * The year a screen starts on.
 *
 * <p>The year today falls into, and the latest one where today falls into none. Every
 * evaluation needs it, because the endpoints refuse a reading without a year — so the screen
 * picks before it may ask.
 *
 * @param years the years of the tenant
 * @returns the one to start on, undefined where the tenant has none
 */
export function defaultYearOf(years: readonly FiscalYear[]): FiscalYear | undefined {
  const today = toIsoDate()
  const running = years.find((year) => year.startDate <= today && today <= year.endDate)
  if (running !== undefined) return running
  return [...years].sort((one, other) => one.endDate.localeCompare(other.endDate)).at(-1)
}
