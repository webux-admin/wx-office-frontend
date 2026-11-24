import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { fieldErrorsOf, type FieldErrors } from '../lib/fieldErrors'
import { INVOICE_KIND, salesDocumentKey, salesDocumentListKey } from '../lib/salesDocument'
import {
  billedMeanwhileIdsOf,
  billedMeanwhileText,
  billingPreviewKey,
  billingPreviewUrl,
  billingUrl,
  draftInvoicesKey,
  draftInvoicesUrl,
  emptyBillingForm,
  isAskable,
  mayWriteBilling,
  selectedEntryIds,
  selectionAfter,
  timeBillingKey,
  toBillingRequest,
  withoutEntries,
  withoutProjectSelection,
  type BillingForm,
} from '../lib/timeBilling'
import { timeEntriesKey, type TimesOf } from '../lib/timetracking'
import type {
  DocumentSummary,
  Page,
  TimeBillingGrouping,
  TimeBillingPreview,
  TimeBillingRequest,
  TimeBillingResult,
} from '../lib/types'

/** What the mask «Zeiten abrechnen» is opened with. */
export type TimeBillingOptions = {
  tenantId: number
  /** The project, or the customer with and without projects. */
  of: TimesOf
  /** The day the mask opens on, `yyyy-mm-dd`. */
  until: string
  /** The draft the mask opens with as target; `null` for a new invoice. */
  documentId: number | null
  /** True for a row «ohne Projekt»: only the entries without a project start ticked. */
  withoutProject: boolean
  /** Whether the target can be chosen; the dialog on a draft has its draft fixed. */
  choosesTarget: boolean
  /** Called with what writing the draft produced. */
  onBilled: (result: TimeBillingResult) => void
}

/** Everything the mask shows and does, for the page and the dialog alike. */
export type TimeBilling = ReturnType<typeof useTimeBilling>

/**
 * The state and the requests of the mask «Zeiten abrechnen».
 *
 * <p>The browser holds the day, the ticks, the grouping and the target; everything else is the
 * answer of the preview, asked anew on every change and never worked out here (backend ADR-0163,
 * frontend ADR-0085). Writing sends the same request again; the server works everything out
 * once more and believes no figure of the screen.
 *
 * <p>A 409 that names entries billed in the meantime takes them out of the ticks, reads the
 * preview anew and says which they were, in the words the list showed them with. A 409 that names
 * none — the draft was issued or saved at the same moment — reads the drafts anew as well.
 *
 * @param options what the mask is opened with
 * @returns the form, the preview, the drafts to choose from and the ways to change and write
 */
export function useTimeBilling({
  tenantId,
  of,
  until,
  documentId,
  withoutProject,
  choosesTarget,
  onBilled,
}: TimeBillingOptions) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<BillingForm>(() => emptyBillingForm(until, documentId))
  // What another billing took in the meantime, in the words of the list; until the next try.
  const [conflict, setConflict] = useState<string | null>(null)
  const request = toBillingRequest(of, form)

  const preview = useQuery({
    queryKey: billingPreviewKey(tenantId, request),
    queryFn: () => api.post<TimeBillingPreview>(billingPreviewUrl(tenantId), request),
    enabled: isAskable(form),
    // The list with the ticks stays while the next answer is on its way, so a click does not
    // make it jump; what may be written is only the answer to the question on screen.
    placeholderData: keepPreviousData,
  })
  const current = preview.isPlaceholderData ? undefined : preview.data

  // A row «ohne Projekt» ticks the entries without a project, once the first answer names them.
  // Where every entry is without one — the projects switched off — that stays «all».
  const [narrowed, setNarrowed] = useState(!withoutProject)
  if (!narrowed && current !== undefined) {
    setNarrowed(true)
    const ticked = new Set(withoutProjectSelection(current.candidates))
    setForm((now) =>
      now.selection === null
        ? { ...now, selection: selectionAfter(ticked, current.candidates) }
        : now,
    )
  }

  const partnerId = of.kind === 'CUSTOMER' ? of.partnerId : preview.data?.partnerId
  const drafts = useQuery({
    queryKey: draftInvoicesKey(tenantId, partnerId ?? 0),
    queryFn: () => api.get<Page<DocumentSummary>>(draftInvoicesUrl(tenantId, partnerId ?? 0)),
    // The invoice list needs INVOICE_READ; without it «Neue Rechnung» is the only target.
    enabled: choosesTarget && partnerId !== undefined && can(INVOICE_KIND.rights.read),
  })

  const refreshAround = () => {
    void queryClient.invalidateQueries({ queryKey: timeBillingKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: timeEntriesKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(INVOICE_KIND, tenantId) })
  }

  const bill = useMutation({
    mutationFn: (body: TimeBillingRequest) =>
      api.post<TimeBillingResult>(billingUrl(tenantId), body),
    onSuccess: (result) => {
      refreshAround()
      void queryClient.invalidateQueries({ queryKey: salesDocumentKey(INVOICE_KIND, tenantId) })
      onBilled(result)
    },
    onError: (error) => {
      const billedMeanwhile = billedMeanwhileIdsOf(error)
      if (billedMeanwhile === null) return
      if (billedMeanwhile.length > 0) {
        setConflict(billedMeanwhileText(billedMeanwhile, preview.data?.candidates ?? []))
        setForm((now) => ({ ...now, selection: withoutEntries(now.selection, billedMeanwhile) }))
      }
      refreshAround()
    },
  })

  const change = (patch: Partial<BillingForm>) => {
    bill.reset()
    setForm((now) => ({ ...now, ...patch }))
  }

  const mayWrite = mayWriteBilling(can)
  const canSubmit =
    mayWrite &&
    current !== undefined &&
    current.lines.length > 0 &&
    !preview.isFetching &&
    !bill.isPending

  const submit = () => {
    if (!canSubmit) return
    setConflict(null)
    bill.reset()
    bill.mutate(request)
  }

  const candidates = preview.data?.candidates ?? []
  const errors: FieldErrors = { ...fieldErrorsOf(preview.error), ...fieldErrorsOf(bill.error) }

  return {
    form,
    preview,
    /** The answer to the question on screen; `undefined` while another one is on its way. */
    current,
    /** The drafts of the customer to choose as target, the newest first. */
    drafts: drafts.data?.content ?? [],
    draftsError: drafts.error,
    selected: selectedEntryIds(form.selection, candidates),
    setUntil: (next: string) => {
      // Another day lists other entries: every open one is ticked again.
      if (withoutProject) setNarrowed(false)
      setConflict(null)
      change({ until: next, selection: null })
    },
    setGrouping: (grouping: TimeBillingGrouping) => change({ grouping }),
    setDocumentId: (next: number | null) => change({ documentId: next }),
    tick: (ticked: ReadonlySet<string | number>) =>
      change({ selection: selectionAfter(ticked, candidates) }),
    bill,
    submit,
    canSubmit,
    mayWrite,
    conflict,
    errors,
  }
}
