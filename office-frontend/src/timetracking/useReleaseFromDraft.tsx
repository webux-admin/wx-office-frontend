import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { formatDurationShort } from '../lib/duration'
import { formatDate } from '../lib/format'
import { billingReleaseUrl, releasedText, timeBillingKey } from '../lib/timeBilling'
import {
  TIMETRACKING_RIGHTS,
  entryServiceText,
  timeEntriesKey,
} from '../lib/timetracking'
import type { TimeEntry, TimeReleaseRequest } from '../lib/types'

/**
 * «Vom Entwurf lösen» for an entry on an invoice draft, with its question and its answer.
 *
 * <p>For an entry whose position somebody removed from a draft that is not issued yet: it becomes
 * open again. The backend refuses it while the position still stands on the draft — the hours
 * would be billed and open at once — and its sentence stands in the question (backend ADR-0163,
 * Entscheidung 11). Needs `TIME_BILL`.
 *
 * @param tenantId the tenant
 * @param onReleased receives what the release did, in one sentence, for the status line of the
 *   screen
 * @returns whether an entry offers the step, the step itself, and the question to render
 */
export function useReleaseFromDraft(
  tenantId: number,
  onReleased: (sentence: string) => void,
): {
  mayRelease: (entry: TimeEntry) => boolean
  ask: (entry: TimeEntry) => void
  question: ReactNode
} {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<TimeEntry | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: timeBillingKey(tenantId) })
  }

  const release = useMutation({
    mutationFn: (entry: TimeEntry) =>
      api.post<TimeEntry[]>(billingReleaseUrl(tenantId), {
        entryIds: [entry.id],
      } satisfies TimeReleaseRequest),
    onSuccess: (entries) => {
      setAsking(null)
      onReleased(releasedText(entries))
      refresh()
    },
    // Refused because the entry stands elsewhere now: its state is read anew.
    onError: refresh,
  })

  const question = (
    <ConfirmDialog
      open={asking !== null}
      title="Vom Entwurf lösen?"
      confirmLabel="Lösen"
      onConfirm={() => {
        if (asking !== null) release.mutate(asking)
      }}
      onCancel={() => {
        release.reset()
        setAsking(null)
      }}
      busy={release.isPending}
      error={release.error}
    >
      {asking !== null && (
        <p>
          {formatDurationShort(asking.durationMinutes)} {entryServiceText(asking)} vom{' '}
          {formatDate(asking.workDate)} wird wieder offen. Das geht nur, wenn seine Position im
          Entwurf schon entfernt ist; sonst wären die Stunden beim Ausstellen verrechnet und
          zugleich offen.
        </p>
      )}
    </ConfirmDialog>
  )

  return {
    mayRelease: (entry) => entry.state === 'IN_DRAFT' && can(TIMETRACKING_RIGHTS.bill),
    ask: (entry) => {
      release.reset()
      setAsking(entry)
    },
    question,
  }
}
