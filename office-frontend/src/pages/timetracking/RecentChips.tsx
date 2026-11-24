import { recentTargetLabel } from '../../lib/timetracking'
import type { TimeRecentTarget } from '../../lib/types'

/**
 * The chips «Zuletzt»: what was recorded on lately, one click from the next entry.
 *
 * <p>A click fills project or customer and service; duration and text stay as typed. The
 * backend leaves out what would be refused today — a completed project, a deactivated customer
 * or service —, so a chip never leads into an error (backend ADR-0160). No chips, no row.
 */
export function RecentChips({
  targets,
  failed,
  onPick,
}: {
  targets: readonly TimeRecentTarget[]
  /** True where the chips could not be read; the line works without them. */
  failed: boolean
  onPick: (target: TimeRecentTarget) => void
}) {
  if (failed) {
    return <p className="text-small text-text-tertiary">«Zuletzt» konnte nicht geladen werden.</p>
  }
  if (targets.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-small text-text-secondary">Zuletzt:</span>
      <ul aria-label="Zuletzt" className="flex flex-wrap gap-1.5">
        {targets.map((target) => (
          <li key={`${target.projectId ?? ''}-${target.partnerId ?? ''}-${target.productId ?? ''}`}>
            <button
              type="button"
              onClick={() => onPick(target)}
              className="rounded-[var(--radius-full)] border border-line bg-surface px-3 py-1 text-small text-text-primary transition-colors hover:border-text-tertiary hover:bg-sunken"
            >
              {recentTargetLabel(target)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
