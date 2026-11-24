import { formatDuration, formatDurationShort } from '../../lib/duration'
import { dayTotalText } from '../../lib/timetracking'
import { dayTitle, shortDayLabel } from '../../lib/week'

/**
 * The seven days of a week with what was recorded on each, and the week total.
 *
 * <p>A click chooses the day the list below shows and a new entry goes to. A day after today
 * cannot be chosen: the backend takes no time for the future, and a day that can only lead to a
 * refusal is no choice (#122, decision 2).
 *
 * <p>The figures are the backend's, day by day and for the week; nothing is added up here.
 *
 * @param totals the minutes per day as the backend sent them; empty while the week loads
 * @param weekTotal the minutes of the week, absent while it loads
 */
export function WeekBar({
  days,
  totals,
  weekTotal,
  selected,
  today,
  onSelect,
}: {
  days: readonly string[]
  totals: ReadonlyMap<string, number>
  weekTotal: number | undefined
  selected: string
  today: string
  onSelect: (day: string) => void
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
          return (
            <li key={day}>
              <button
                type="button"
                disabled={day > today}
                aria-pressed={chosen}
                aria-current={isToday ? 'date' : undefined}
                aria-label={
                  minutes === undefined
                    ? dayTitle(day)
                    : `${dayTitle(day)}: ${formatDuration(minutes)}`
                }
                onClick={() => onSelect(day)}
                className={`grid w-full gap-0.5 rounded-[var(--radius-md)] border px-1 py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-left ${
                  chosen ? 'border-accent bg-accent/12' : 'border-transparent hover:bg-sunken'
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
                  {minutes === undefined ? '·' : dayTotalText(day, minutes)}
                </span>
              </button>
            </li>
          )
        })}
        <li className="col-span-7 flex items-baseline justify-between gap-2 border-t border-line-subtle px-1 pt-2 sm:col-span-1 sm:grid sm:content-center sm:justify-start sm:gap-0.5 sm:border-l sm:border-t-0 sm:px-3 sm:pt-0">
          <span className="text-small text-text-secondary">Woche</span>
          <span className="font-mono text-body font-semibold tabular-nums">
            {weekTotal === undefined ? '·' : formatDurationShort(weekTotal)}
          </span>
        </li>
      </ul>
    </nav>
  )
}
