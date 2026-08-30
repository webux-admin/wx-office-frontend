import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_MODULE, DUNNING_RIGHTS,
  blockLabel,
  couldBeLifted,
  dunningBlocksKey,
  fetchDunningBlocks,
  liftDunningBlock,
} from '../lib/dunning'
import { formatDate, formatDateTime } from '../lib/format'
import type { DunningBlock } from '../lib/types'

/**
 * Every dunning stop of this tenant, standing and lifted.
 *
 * <p>The one screen that answers «welche Kunden mahnen wir gerade nicht, und warum». Lifted
 * stops stay in the list, struck through: a stop is a decision about a customer, and that it
 * once held belongs to the record (backend ADR-0099).
 *
 * <p>Setting a stop happens where the customer or the invoice is — this screen only shows and
 * lifts. A «neuer Mahnstopp» button here would ask for a customer first, which is the search
 * the customer list already is.
 */
export function DunningBlockPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read} module={DUNNING_MODULE}>
      {(tenantId) => <Blocks tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Blocks({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can(DUNNING_RIGHTS.write)

  const [lifting, setLifting] = useState<DunningBlock | null>(null)
  const [reason, setReason] = useState('')

  const blocks = useQuery({
    queryKey: dunningBlocksKey(tenantId),
    queryFn: () => fetchDunningBlocks(tenantId),
  })

  const lift = useMutation({
    mutationFn: (block: DunningBlock) =>
      liftDunningBlock(tenantId, block.id, reason.trim()),
    onSuccess: () => {
      setLifting(null)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['dunning-blocks'] })
      void queryClient.invalidateQueries({ queryKey: ['dunning-worklist'] })
    },
  })

  const rows = blocks.data ?? []
  const standing = rows.filter((block) => block.holds)
  const settled = standing.filter(couldBeLifted)

  return (
    <>
      <PageHeader
        title="Mahnstopps"
        subtitle={
          blocks.isSuccess
            ? `${standing.length} von ${rows.length} gelten`
            : undefined
        }
      />

      <div className="grid gap-6 px-8 pb-12">
        {blocks.error !== null && <ErrorNotice error={blocks.error} />}

        {/* Not lifted automatically: paying settles an invoice, and the stop was about the
            customer. But saying so is free, and it is the one thing somebody would want to
            know here (backend ADR-0099). */}
        {settled.length > 0 && (
          <Panel title="Nichts mehr offen">
            <p className="text-[13px]">
              {settled.length === 1
                ? 'Ein Mahnstopp gilt für jemanden, der nichts mehr schuldet.'
                : `${settled.length} Mahnstopps gelten für jemanden, der nichts mehr schuldet.`}{' '}
              Sie könnten aufgehoben werden — von selbst geschieht das nicht, denn ein Stopp
              gilt dem Kunden und nicht der einen ausgeglichenen Rechnung.
            </p>
          </Panel>
        )}

        <Panel
          title="Mahnstopps"
          description="Aufgehobene bleiben stehen: dass ein Stopp einmal galt und wer ihn aufgehoben hat, gehört zur Geschichte des Kunden."
          padded={false}
        >
          {blocks.isPending && (
            <p className="px-4 py-3 text-[13px] text-text-secondary">Wird geladen ...</p>
          )}
          {blocks.isSuccess && rows.length === 0 && (
            <EmptyState
              title="Kein Mahnstopp gesetzt"
              description="Gesetzt wird ein Stopp beim Kunden oder an der Rechnung."
            />
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-text-tertiary">
                    <th className="py-2 pl-4 font-medium">Gilt für</th>
                    <th className="py-2 pr-4 font-medium">Grund</th>
                    <th className="py-2 pr-4 font-medium">Bemerkung</th>
                    <th className="py-2 pr-4 font-medium">Gesetzt</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {rows.map((block) => (
                    <tr
                      key={block.id}
                      className={block.holds ? undefined : 'opacity-60'}
                    >
                      <td className="py-2 pl-4">
                        {block.partnerId !== undefined ? (
                          <Badge tone="accent">Kunde {block.partnerId}</Badge>
                        ) : (
                          <Badge tone="neutral">Beleg {block.documentId}</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={block.holds ? undefined : 'line-through'}>
                          {blockLabel(block)}
                        </span>
                        {couldBeLifted(block) && (
                          <div className="text-[12px] text-text-tertiary">
                            keine offenen Posten mehr
                          </div>
                        )}
                        {block.liftedAt !== undefined && (
                          <div className="text-[12px] text-text-tertiary">
                            Aufgehoben am {formatDateTime(block.liftedAt)}
                            {block.liftedReason !== undefined && ` — ${block.liftedReason}`}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-text-secondary">{block.note ?? '–'}</td>
                      <td className="py-2 pr-4 text-text-secondary">
                        {formatDate(block.createdAt)} · {block.createdBy}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {mayWrite && block.holds && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setLifting(block)
                              setReason('')
                            }}
                          >
                            Aufheben
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
      </div>

      {lifting !== null && (
        <Dialog
          open
          onClose={() => setLifting(null)}
          onSubmit={() => lift.mutate(lifting)}
          title="Mahnstopp aufheben"
          footer={
            <>
              <Button variant="secondary" onClick={() => setLifting(null)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => lift.mutate(lifting)}
                disabled={reason.trim().length === 0 || lift.isPending}
              >
                {lift.isPending ? 'Wird aufgehoben ...' : 'Aufheben'}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <p className="text-[13px] text-text-secondary">
              Der Stopp bleibt in der Liste stehen, durchgestrichen. Ab dem nächsten
              Mahnvorschlag werden die Rechnungen wieder gemahnt.
            </p>
            <TextField
              label="Grund"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reklamation erledigt"
              autoFocus
            />
            {lift.error !== null && <ErrorNotice error={lift.error} />}
          </div>
        </Dialog>
      )}
    </>
  )
}
