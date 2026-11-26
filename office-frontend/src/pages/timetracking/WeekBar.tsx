import { formatDuration } from '../../lib/duration'
import { dayTargetShare, dayTargetText, drawsDayTarget, totalText } from '../../lib/timetracking'
import { dayTitle, shortDayLabel } from '../../lib/week'

/** Why a day after today cannot be chosen, in the words of its tooltip. */
export const FUTURE_DAY_REASON = 'Liegt in der Zukunft. Zeit wird erfasst, wenn sie geleistet ist.'

/** What a screen reader hears for a day up to today that shows «–». */
const NOTHING_RECORDED = 'keine Zeit erfasst'

/**
 * The seven days of a week with what was recorded on each, and the week total.
 *
 * <p>A click chooses the day the list below shows and a new entry goes to. A day after today
 * cannot be chosen: the backend takes no time for the future, and a day that can only lead to a
 * refusal is no choice (#122, decision 2). It says so, in its tooltip and to a screen reader, and
 * stays reachable with the tab key to be read: a Saturday that only looks dimmed reads as a
 * weekend that cannot be recorded (#132). Every day up to today, weekend or not, is chosen alike.
 *
 * <p>The figures are the backend's, day by day and for the week; nothing is added up here. A day
 * or a week without a minute reads «–» and tells a screen reader «keine Zeit erfasst»; a day after
 * today has no time anyway and keeps its reason (#142).
 *
 * <p>With a day target, Monday to Friday up to today carry a thin bar under the total that fills
 * with the time recorded, full at the target. It reminds, it does not judge: one colour, no figure,
 * nothing over the target; tooltip and screen reader say «6:15 von 8:00 erfasst» (#143, backend
 * ADR-0171, frontend ADR-0093).
 *
 * @param totals the minutes per day as the backend sent them; empty while the week loads
 * @param weekTotal the minutes of the week, absent while it loads
 * @param dayTarget the day target in minutes, only for the own week and where the tenant shows
 *   it; absent, no day has a bar
 */
export function WeekBar({
  days,
  totals,
  weekTotal,
  selected,
  today,
  onSelect,
  dayTarget,
}: {
  days: readonly string[]
  totals: ReadonlyMap<string, number>
  weekTotal: number | undefined
  selected: string
  today: string
  onSelect: (day: string) => void
  dayTarget?: number
}) {
  return (
    <nav
      aria-label="Tage der Woche"
      className="rounded-[var(--radius-lg)] border border-line-subtle bg-surface p-2"
    >
      <ul className="grid grid-cols-7 gap-1 sm:grid-cols-8">
        {days.map((day) => {
          const minutes = totals.get(day)
          const chosen = day === selected
          const isToday = day === today
          const future = day > today
          const target =
            dayTarget !== undefined && minutes !== undefined && drawsDayTarget(day, today)
              ? dayTarget
              : undefined
          return (
            <li key={day}>
              {/* Not `disabled`: a disabled button shows no tooltip in every browser and cannot be
                  reached to hear why. */}
              <button
                type="button"
                aria-disabled={future || undefined}
                aria-pressed={chosen}
                aria-current={isToday ? 'date' : undefined}
                aria-label={
                  future
                    ? `${dayTitle(day)}: ${FUTURE_DAY_REASON}`
                    : minutes === undefined
                      ? dayTitle(day)
                      : target !== undefined
                        ? `${dayTitle(day)}: ${dayTargetText(minutes, target)}`
                        : `${dayTitle(day)}: ${minutes === 0 ? NOTHING_RECORDED : formatDuration(minutes)}`
                }
                title={
                  future
                    ? FUTURE_DAY_REASON
                    : target !== undefined && minutes !== undefined
                      ? dayTargetText(minutes, target)
                      : undefined
                }
                onClick={() => {
                  if (!future) onSelect(day)
                }}
                className={`grid w-full gap-0.5 rounded-[var(--radius-md)] border px-1 py-2 text-center transition-colors sm:px-3 sm:text-left ${
                  future
                    ? 'cursor-not-allowed border-dashed border-line opacity-60'
                    : chosen
                      ? 'border-accent bg-accent/12'
                      : 'border-transparent hover:bg-sunken'
                }`}
              >
                <span
                  className={`text-small ${
                    isToday ? 'font-semibold text-accent-text' : 'text-text-secondary'
                  }`}
                >
                  {shortDayLabel(day)}
                </span>
                <span className="font-mono text-body tabular-nums text-text-primary">
                  {minutes === undefined ? '·' : totalText(minutes)}
                </span>
                {/* A day without a bar keeps the room of one, so every total stands at the same
                    height. The bar says nothing a reader would miss: the label says it in words. */}
                {dayTarget !== undefined && (
                  <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
                    {target !== undefined && minutes !== undefined && (
                      <span
                        data-day-target
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${Math.round(dayTargetShare(minutes, target) * 100)}%` }}
                      />
                    )}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        <li className="col-span-7 flex items-baseline justify-between gap-2 border-t border-line-subtle px-1 pt-2 sm:col-span-1 sm:grid sm:content-center sm:justify-start sm:gap-0.5 sm:border-l sm:border-t-0 sm:px-3 sm:pt-0">
          <span className="text-small text-text-secondary">Woche</span>
          <span className="font-mono text-body font-semibold tabular-nums">
            {weekTotal === undefined ? '·' : totalText(weekTotal)}
          </span>
        </li>
      </ul>
    </nav>
  )
}
