import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { billableDefaultKey, billableDefaultUrl } from '../lib/timetracking'
import type { TimeBillableDefault, TimeTargetChoice } from '../lib/types'

/**
 * What the box «verrechenbar» shows for a target and whether it is locked, as the server says.
 *
 * <p>One request per target, shared by the quick line, the row being changed and the stopwatch
 * through the cache. The billing mode of a project decides, so the rule is the server's and not
 * the browser's (backend ADR-0162, frontend ADR-0084).
 *
 * <p>Internal time is not asked about: it is never billable, a rule fixed since ADR-0160 of the
 * backend, and the box is locked for it without an answer.
 *
 * @param tenantId the tenant
 * @param target the project or customer; `null` for internal time
 * @param enabled false where no box is on screen, so nothing is asked
 * @returns the default, `undefined` for internal time, while it is on its way or when it could
 *          not be read
 */
export function useBillableDefault(
  tenantId: number,
  target: TimeTargetChoice | null,
  enabled = true,
): TimeBillableDefault | undefined {
  const rule = useQuery({
    queryKey: billableDefaultKey(tenantId, target),
    queryFn: () => api.get<TimeBillableDefault>(billableDefaultUrl(tenantId, target)),
    enabled: enabled && target !== null,
  })
  return target === null ? undefined : rule.data
}
