import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_RIGHTS,
  dunningNoticesKey,
  fetchDunningNoticePdf,
  fetchDunningNotices,
  isWithdrawn,
} from '../lib/dunning'
import { showFile } from '../lib/files'
import { formatAmount, formatDate } from '../lib/format'
import type { DunningNotice } from '../lib/types'

/**
 * Every reminder this tenant has issued, newest first.
 *
 * <p>The register on the Rechnung answers «was diese eine Rechnung erlebt hat». This list
 * answers the other question — «was ist hinausgegangen» — and it is the one an audit asks:
 * the numbers have to be gapless, and a list that hides withdrawn letters would make a gap
 * look like a mistake.
 *
 * <p>Withdrawn reminders therefore stay, struck through. Nothing is ever deleted (backend
 * ADR-0094).
 */
export function DunningNoticePage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read}>
      {(tenantId) => <Notices tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Notices({ tenantId }: { tenantId: number }) {
  const notices = useQuery({
    queryKey: dunningNoticesKey(tenantId),
    queryFn: () => fetchDunningNotices(tenantId),
  })

  const open = useMutation({
    mutationFn: (notice: DunningNotice) => fetchDunningNoticePdf(tenantId, notice.id),
    onSuccess: showFile,
  })

  const rows = notices.data ?? []
  const standing = rows.filter((notice) => !isWithdrawn(notice)).length

  return (
    <>
      <PageHeader
        title="Mahnungen"
        subtitle={
          notices.isSuccess
            ? `${standing} von ${rows.length} Mahnungen stehen`
            : undefined
        }
      />

      <div className="grid gap-6 px-8 pb-12">
        {notices.error !== null && <ErrorNotice error={notices.error} />}
        {open.error !== null && <ErrorNotice error={open.error} />}

        <Panel
          title="Ausgestellt"
          description="Ein Brief, eine Nummer — auch die Sammelmahnung über mehrere Rechnungen. Zurückgezogene bleiben stehen."
          padded={false}
        >
          {notices.isPending && (
            <p className="px-4 py-3 text-[13px] text-text-secondary">Wird geladen ...</p>
          )}
          {notices.isSuccess && rows.length === 0 && (
            <EmptyState
              title="Noch keine Mahnung ausgestellt"
              description="Was zu mahnen wäre, steht im Mahnvorschlag."
            />
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-text-tertiary">
                    <th className="py-2 pl-4 font-medium">Nummer</th>
                    <th className="py-2 pr-4 font-medium">Kunde</th>
                    <th className="py-2 pr-4 font-medium">Stufe</th>
                    <th className="py-2 pr-4 font-medium">Ausgestellt</th>
                    <th className="py-2 pr-4 font-medium">Zahlbar bis</th>
                    <th className="py-2 pr-4 text-right font-medium">Rg.</th>
                    <th className="py-2 pr-4 text-right font-medium">Gemahnt</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {rows.map((notice) => (
                    <tr
                      key={notice.id}
                      className={isWithdrawn(notice) ? 'opacity-60' : undefined}
                    >
                      <td className="py-2 pl-4 font-mono text-[12px]">
                        <span className={isWithdrawn(notice) ? 'line-through' : undefined}>
                          {notice.noticeNumber}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{notice.recipientName}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={isWithdrawn(notice) ? 'muted' : 'accent'}>
                          {notice.levelName ?? `Stufe ${notice.levelNo}`}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">{formatDate(notice.issuedOn)}</td>
                      <td className="py-2 pr-4">{formatDate(notice.payableUntil)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {notice.lines.length}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums">
                        {formatAmount(notice.totalOpenAmount)}{' '}
                        <span className="text-text-tertiary">{notice.currency}</span>
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {isWithdrawn(notice) && (
                          <span className="mr-2 text-[12px] text-text-tertiary">
                            zurückgezogen
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => open.mutate(notice)}
                          disabled={open.isPending}
                        >
                          PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
