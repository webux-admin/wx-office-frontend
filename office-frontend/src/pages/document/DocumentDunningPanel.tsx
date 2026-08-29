import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { DunningBlockDialog } from '../dunning/DunningBlockDialog'
import { TextField } from '../../components/TextField'
import {
  blockLabel,
  dunningBlocksKey,
  dunningDispatchKey,
  dunningNoticesKey,
  fetchDunningNoticePdf,
  fetchDunningNotices,
  fetchDunningBlocks,
  fetchDunningDispatch,
  isWithdrawn,
  issueDunningForInvoice,
  liftDunningBlock,
  noticeDispatchLabel,
  withdrawDunningNotice,
} from '../../lib/dunning'
import { showFile } from '../../lib/files'
import { OUTBOX_PATH } from '../../lib/outbox'
import { formatAmount, formatDate, formatDateTime } from '../../lib/format'
import type { DunningBlock, DunningNotice, OutboxSummary } from '../../lib/types'

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
 * <p>The dunning stop lives here too: «warum wird hier nicht gemahnt» is asked at the
 * invoice, and it is the same register that answers «was ist hinausgegangen».
 *
 * @param mayIssue    whether the user holds `DUNNING_RUN`
 * @param mayWithdraw whether the user holds `DUNNING_WITHDRAW`
 * @param mayBlock    whether the user holds `DUNNING_WRITE`
 */
export function DocumentDunningPanel({
  tenantId,
  documentId,
  documentNumber,
  partnerId,
  partnerName,
  mayIssue,
  mayWithdraw,
  mayBlock,
}: {
  tenantId: number
  documentId: number
  documentNumber?: string
  mayIssue: boolean
  mayWithdraw: boolean
  mayBlock: boolean
  /** The customer of the Rechnung, so a stop can be set on them from here. */
  partnerId: number
  partnerName: string
}) {
  const queryClient = useQueryClient()
  const [withdrawing, setWithdrawing] = useState<DunningNotice | null>(null)
  const [reason, setReason] = useState('')
  const [blocking, setBlocking] = useState<'partner' | 'document' | null>(null)
  const [lifting, setLifting] = useState<DunningBlock | null>(null)
  const [liftReason, setLiftReason] = useState('')

  const notices = useQuery({
    queryKey: dunningNoticesKey(tenantId, documentId),
    queryFn: () => fetchDunningNotices(tenantId, documentId),
  })

  // Both kinds together: a stop on the customer holds this Rechnung back as surely as one
  // set on the Rechnung itself, and the reader does not care which of the two somebody set.
  const stops = useQuery({
    queryKey: dunningBlocksKey(tenantId, partnerId, documentId),
    queryFn: () => fetchDunningBlocks(tenantId, partnerId, documentId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dunning-notices'] })
    void queryClient.invalidateQueries({ queryKey: ['dunning-worklist'] })
    void queryClient.invalidateQueries({ queryKey: ['dunning-states'] })
    void queryClient.invalidateQueries({ queryKey: ['dunning-blocks'] })
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

  const liftStop = useMutation({
    mutationFn: (block: DunningBlock) =>
      liftDunningBlock(tenantId, block.id, liftReason.trim()),
    onSuccess: () => {
      setLifting(null)
      setLiftReason('')
      refresh()
    },
  })

  const open = useMutation({
    mutationFn: (notice: DunningNotice) => fetchDunningNoticePdf(tenantId, notice.id),
    onSuccess: showFile,
  })

  const rows = notices.data ?? []

  // One query per reminder rather than a column on it: the outbox already answers «ist das
  // hinausgegangen», and a second truth on the reminder would drift apart the first time it
  // records a failure (backend ADR-0095).
  const dispatches = useQueries({
    queries: rows
      .filter((notice) => notice.channel === 'MAIL')
      .map((notice) => ({
        queryKey: dunningDispatchKey(tenantId, notice.id),
        queryFn: () => fetchDunningDispatch(tenantId, notice.id),
      })),
  })
  const messagesOf = (notice: DunningNotice): OutboxSummary[] => {
    const index = rows
      .filter((one) => one.channel === 'MAIL')
      .findIndex((one) => one.id === notice.id)
    return index < 0 ? [] : (dispatches[index]?.data ?? [])
  }
  // What the run produced for exactly this Rechnung: a letter it did not send, or one that
  // failed, is stated rather than swallowed — otherwise the button looks broken.
  const attempt = issue.data
  const refused = attempt?.skipped.at(0)
  const failure = attempt?.failed.at(0)

  const blocks = stops.data ?? []
  const standing = blocks.filter((block) => block.holds)

  return (
    <>
      <Panel
        title="Mahnstopp"
        description="Solange ein Stopp gilt, wird nicht gemahnt. Aufgehoben wird er von Hand, nie durch eine Zahlung."
        className="mb-6"
        action={
          mayBlock ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setBlocking('document')}>
                Diese Rechnung
              </Button>
              <Button variant="secondary" onClick={() => setBlocking('partner')}>
                Ganzer Kunde
              </Button>
            </div>
          ) : undefined
        }
      >
        {stops.error !== null && <ErrorNotice error={stops.error} />}
        {liftStop.error !== null && <ErrorNotice error={liftStop.error} />}
        {standing.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Kein Mahnstopp. Diese Rechnung wird gemahnt, sobald sie an der Reihe ist.
          </p>
        ) : (
          <div className="grid gap-2">
            {standing.map((block) => (
              <div key={block.id} className="flex items-start justify-between gap-4">
                <div className="text-[13px]">
                  <Badge tone="danger">{blockLabel(block)}</Badge>{' '}
                  <span className="text-text-secondary">
                    {block.partnerId !== undefined
                      ? 'gilt für den ganzen Kunden'
                      : 'gilt für diese Rechnung'}
                  </span>
                  {block.note !== undefined && (
                    <div className="text-[12px] text-text-tertiary">{block.note}</div>
                  )}
                </div>
                {mayBlock && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setLifting(block)
                      setLiftReason('')
                    }}
                  >
                    Aufheben
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

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
                  <th className="py-2 pr-4 font-medium">Weg</th>
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
                      {noticeDispatchLabel(notice.channel, messagesOf(notice))}
                      {notice.channel === 'MAIL' && (
                        <div className="text-[12px] text-text-tertiary">
                          <Link className="hover:underline" to={OUTBOX_PATH}>
                            Im Postausgang ansehen
                          </Link>
                        </div>
                      )}
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

      {blocking !== null && (
        <DunningBlockDialog
          tenantId={tenantId}
          partnerId={blocking === 'partner' ? partnerId : undefined}
          documentId={blocking === 'document' ? documentId : undefined}
          subject={blocking === 'partner' ? partnerName : (documentNumber ?? 'diese Rechnung')}
          onClose={() => setBlocking(null)}
        />
      )}

      {lifting !== null && (
        <Dialog
          open
          onClose={() => setLifting(null)}
          onSubmit={() => liftStop.mutate(lifting)}
          title="Mahnstopp aufheben"
          footer={
            <>
              <Button variant="secondary" onClick={() => setLifting(null)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => liftStop.mutate(lifting)}
                disabled={liftReason.trim().length === 0 || liftStop.isPending}
              >
                {liftStop.isPending ? 'Wird aufgehoben ...' : 'Aufheben'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <p className="text-[13px] text-text-secondary">
              Der Stopp bleibt auf der Liste stehen, durchgestrichen. Ab dem nächsten
              Mahnvorschlag wird wieder gemahnt.
            </p>
            <TextField
              label="Grund"
              value={liftReason}
              onChange={(event) => setLiftReason(event.target.value)}
              placeholder="Reklamation erledigt"
              autoFocus
            />
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
