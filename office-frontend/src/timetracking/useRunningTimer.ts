import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api } from '../lib/api'
import {
  minutesSince,
  msUntilNextMinute,
  timeEntriesKey,
  timerKey,
  timerTabTitle,
  timerUrl,
} from '../lib/timetracking'
import type { RunningTimer } from '../lib/types'

/**
 * The running stopwatch of the signed in user, `null` while none runs.
 *
 * <p>Read once and then only when something can have changed it: a step of this browser, the
 * field opened, or the tab coming back. Never on a timer (backend ADR-0161).
 *
 * @param tenantId the tenant
 * @returns the query; its data is `null` for the 204 «nothing runs»
 */
export function useRunningTimer(tenantId: number) {
  return useQuery({
    queryKey: timerKey(tenantId),
    // A query may not hold undefined, which is what the client makes of a 204.
    queryFn: async () => (await api.get<RunningTimer | undefined>(timerUrl(tenantId))) ?? null,
  })
}

/** Nothing runs, so nothing turns over. */
const subscribeToNothing = () => () => undefined

/**
 * How long the stopwatch runs, counted on in the browser.
 *
 * <p>The screen renders again when the minute since the start turns over, not every second, and
 * asks the backend for nothing. The start is to the second, so the turn comes at the second of
 * the start.
 *
 * @param startedAt the start, an ISO instant; `null` while nothing runs
 * @returns the whole minutes since the start, `null` while nothing runs
 */
export function useMinutesRunning(startedAt: string | null): number | null {
  const subscribe = useCallback(
    (onTurn: () => void) => {
      if (startedAt === null) return subscribeToNothing()
      let handle = setTimeout(function turn() {
        onTurn()
        handle = setTimeout(turn, msUntilNextMinute(startedAt, Date.now()))
      }, msUntilNextMinute(startedAt, Date.now()))
      return () => clearTimeout(handle)
    },
    [startedAt],
  )
  const minutes = useSyncExternalStore(
    startedAt === null ? subscribeToNothing : subscribe,
    () => (startedAt === null ? -1 : minutesSince(startedAt, Date.now())),
  )
  return startedAt === null ? null : minutes
}

/**
 * Reads the stopwatch and the entries anew when the tab comes back into view, so a stop on the
 * phone shows here without reloading the page.
 *
 * <p>The entries too: the stop wrote them on the other device.
 *
 * @param tenantId the tenant
 */
export function useReloadOnReturn(tenantId: number): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState !== 'visible') return
      void queryClient.invalidateQueries({ queryKey: timerKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })
    }
    document.addEventListener('visibilitychange', reload)
    return () => document.removeEventListener('visibilitychange', reload)
  }, [queryClient, tenantId])
}

/**
 * Puts the running time in front of the title of the browser tab, and the old title back once
 * the stopwatch stops.
 *
 * @param minutes how long it runs, `null` while nothing runs
 */
export function useTimerTabTitle(minutes: number | null): void {
  useEffect(() => {
    if (minutes === null) return
    const before = document.title
    document.title = timerTabTitle(minutes, before)
    return () => {
      document.title = before
    }
  }, [minutes])
}
