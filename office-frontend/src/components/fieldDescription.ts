import type { ReactNode } from 'react'

/**
 * The ids a control names in `aria-describedby`: the line under it and the tooltip.
 *
 * @param hintId id of the line under the field
 * @param tooltipId id of the tooltip text
 * @param extras what decides whether either is drawn
 * @returns the attribute value, `undefined` when there is nothing to describe the control
 */
export function describedBy(
  hintId: string,
  tooltipId: string,
  extras: { hint?: ReactNode; error?: string; tooltip?: ReactNode },
): string | undefined {
  const ids = [
    extras.error !== undefined || (extras.hint !== undefined && extras.hint !== null)
      ? hintId
      : undefined,
    extras.tooltip !== undefined ? tooltipId : undefined,
  ].filter((id): id is string => id !== undefined)
  return ids.length === 0 ? undefined : ids.join(' ')
}
