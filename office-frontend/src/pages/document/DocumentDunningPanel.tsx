import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import {
  dunningNoticesKey,
  fetchDunningNoticePdf,
  fetchDunningNotices,
  isWithdrawn,
  issueDunningForInvoice,
  withdrawDunningNotice,
} from '../../lib/dunning'
import { showFile } from '../../lib/files'
import { formatAmount, formatDate, formatDateTime } from '../../lib/format'
import type { DunningNotice } from '../../lib/types'

/**
 * Which reminders went out over one Rechnung.
 *
 * <p><b>Nothing here can be edited or deleted.</b> A reminder is with the customer; making it
 * disappear afterwards would be a forgery of business correspondence. What can be taken back
 * is its <b>effect</b>: a withdrawn reminder no longer counts towards the dunning level, but
 * it stays on the list, struck through, with its reason and its PDF (backend ADR-0094).
 *
 * <p>A collective reminder appears here as one row with several invoices — the letter this
 * Rechnung travelled in. The other invoices of that letter are named, because otherwise the
 * amount on the row would be unexplainable.
 *
 * @param mayIssue    whether the user holds `DUNNING_RUN`
 * @param mayWithdraw whether the user holds `DUNNING_WITHDRAW`
 */
export function DocumentDunningPanel({
  tenantId,
  documentId,
  documentNumber,
  mayIssue,
  mayWithdraw,
}: {
  tenantId: number
  documentId: number
  documentNumber?: string
  mayIssue: boolean
  mayWithdraw: boolean
}) {
  const queryClient = useQueryClient()
  const [withdrawing, setWithdrawing] = useState<DunningNotice | null>(null)
  const [reason, setReason] = useState('')

  const notices = useQuery({
    queryKey: dunningNoticesKey(tenantId, documentId),
    queryFn: () => fetchDunningNotices(tenantId, documentId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dunning-notices'] })
    void queryClient.invalidateQueries({ queryKey: ['dunning-worklist'] })
    void queryClient.invalidateQueries({ queryKey: ['dunning-states'] })
  }

  const issue = useMutation({
    mutationFn: () => issueDunningForInvoice(tenantId, documentId),
    onSuccess: refresh,
  })

  const withdraw = useMutation({
    mutationFn: (notice: DunningNotice) =>
      withdrawDunningNotice(tenantId, notice.id, reason.trim()),
    onSuccess: () => {
      setWithdrawing(null)
      setReason('')
      refresh()
    },
  })

  const open = useMutation({
    mutationFn: (notice: DunningNotice) => fetchDunningNoticePdf(tenantId, notice.id),
    onSuccess: showFile,
  })

  const rows = notices.data ?? []
  // What the run produced for exactly this Rechnung: a letter it did not send, or one that
  // failed, is stated rather than swallowed — otherwise the button looks broken.
  const attempt = issue.data
  const refused = attempt?.skipped.at(0)
  const failure = attempt?.failed.at(0)

  return (
    <>
      <Panel
        title="Mahnungen"
        description="Was über diese Rechnung hinausgegangen ist. Eine Mahnung wird zurückgezogen, nie gelöscht — sie liegt beim Kunden."
        padded={false}
        action={
          mayIssue ? (
            <Button
              variant="secondary"
              onClick={() => issue.mutate()}
              disabled={issue.isPending}
            >
              {issue.isPending ? 'Wird ausgestellt ...' : 'Jetzt mahnen'}
            </Button>
          ) : undefined
        }
      >
        {notices.error !== null && (
          <div className="px-4 py-3">
            <ErrorNotice error={notices.error} />
          </div>
        )}
        {issue.error !== null && (
          <div className="px-4 py-3">
            <ErrorNotice error={issue.error} />
          </div>
        )}
        {failure !== undefined && (
          <p className="px-4 py-3 text-[13px] text-text-secondary">{failure.message}</p>
        )}
        {failure === undefined && refused !== undefined && (
          <p className="px-4 py-3 text-[13px] text-text-secondary">
            Nicht gemahnt: {refused.note ?? 'die Regel lässt es heute nicht zu.'}
          </p>
        )}
        {open.error !== null && (
          <div className="px-4 py-3">
            <ErrorNotice error={open.error} />
          </div>
        )}

        {notices.isPending && (
          <p className="px-4 py-3 text-[13px] text-text-secondary">Wird geladen ...</p>
        )}
        {notices.isSuccess && rows.length === 0 && (
          <EmptyState
            title="Noch nicht gemahnt"
            description={
              documentNumber === undefined
                ? 'Über diese Rechnung ist keine Mahnung hinausgegangen.'
                : `Über ${documentNumber} ist keine Mahnung hinausgegangen.`
            }
          />
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-text-tertiary">
                  <th className="py-2 pl-4 font-medium">Nummer</th>
                  <th className="py-2 pr-4 font-medium">Stufe</th>
                  <th className="py-2 pr-4 font-medium">Ausgestellt</th>
                  <th className="py-2 pr-4 font-medium">Zahlbar bis</th>
                  <th className="py-2 pr-4 text-right font-medium">Gemahnt</th>
                  <th className="py-2 pr-4 font-medium">Brief</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {rows.map((notice) => (
                  <tr key={notice.id} className={isWithdrawn(notice) ? 'opacity-60' : undefined}>
                    <td className="py-2 pl-4 font-mono text-[12px]">
                      <span className={isWithdrawn(notice) ? 'line-through' : undefined}>
                        {notice.noticeNumber}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={isWithdrawn(notice) ? 'muted' : 'accent'}>
                        {notice.levelName ?? `Stufe ${notice.levelNo}`}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{formatDate(notice.issuedOn)}</td>
                    <td className="py-2 pr-4">{formatDate(notice.payableUntil)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatAmount(lineOf(notice, documentId)?.openAmount)}{' '}
                      <span className="text-text-tertiary">{notice.currency}</span>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {notice.lines.length === 1
                        ? 'Einzelmahnung'
                        : `Sammelmahnung über ${notice.lines.length} Rechnungen`}
                      {isWithdrawn(notice) && (
                        <div className="text-[12px] text-text-tertiary">
                          Zurückgezogen am {formatDateTime(notice.withdrawnAt)}
                          {notice.withdrawnReason !== undefined
                            && ` — ${notice.withdrawnReason}`}
                        </div>
                      )}
                      {notice.lines.length > 1 && (
                        <div className="text-[12px] text-text-tertiary">
                          {notice.lines
                            .map((line) => line.documentNumber ?? `Beleg ${line.documentId}`)
                            .join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        onClick={() => open.mutate(notice)}
                        disabled={open.isPending}
                      >
                        PDF
                      </Button>
                      {mayWithdraw && !isWithdrawn(notice) && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setWithdrawing(notice)
                            setReason('')
                          }}
                        >
                          Zurückziehen
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {withdrawing !== null && (
        <Dialog
          open
          onSubmit={() => withdraw.mutate(withdrawing)}
          title={`Mahnung ${withdrawing.noticeNumber} zurückziehen`}
          onClose={() => setWithdrawing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setWithdrawing(null)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => withdraw.mutate(withdrawing)}
                disabled={reason.trim().length === 0 || withdraw.isPending}
              >
                {withdraw.isPending ? 'Wird zurückgezogen ...' : 'Zurückziehen'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <p className="text-[13px] text-text-secondary">
              Der Brief bleibt bestehen, samt PDF — er liegt beim Kunden. Zurückgenommen wird
              die Wirkung: die Rechnung steht danach wieder eine Mahnstufe tiefer.
            </p>
            <TextField
              label="Grund"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Warum diese Mahnung nicht hätte hinausgehen dürfen"
              autoFocus
            />
            {withdraw.error !== null && <ErrorNotice error={withdraw.error} />}
          </div>
        </Dialog>
      )}
    </>
  )
}

/** The line of one reminder that belongs to the Rechnung being looked at. */
function lineOf(notice: DunningNotice, documentId: number) {
  return notice.lines.find((line) => line.documentId === documentId)
}
