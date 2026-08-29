import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { DunningBlockDialog } from '../dunning/DunningBlockDialog'
import {
  DUNNING_GROUPINGS,
  blockLabel,
  dunningBlocksKey,
  fetchDunningBlocks,
  DUNNING_GROUPING_HINTS,
  fetchPartnerDunning,
  partnerDunningKey,
  setPartnerDunning,
} from '../../lib/dunning'
import type { DunningGrouping } from '../../lib/types'

/** What the dropdown offers: the two groupings plus «follow the tenant». */
const FOLLOWS_TENANT = ''

/**
 * How this one customer is chased, where it differs from the rest.
 *
 * <p><b>Only a deviation is stored.</b> «Vorgabe des Mandanten» is not a third value that gets
 * written — it removes the row, so a later change to the tenant's default reaches this customer
 * too. Choosing the value that happens to equal the default today would freeze them on it
 * (backend ADR-0093).
 *
 * <p>The dunning stop sits in the same panel: «wie wird gemahnt» and «wird überhaupt
 * gemahnt» are the two questions somebody has about this customer, and they belong
 * together (backend ADR-0099).
 *
 * @param mayWrite  whether the user holds `DUNNING_CONFIGURE`
 * @param mayBlock  whether the user holds `DUNNING_WRITE`
 * @param partnerName the customer, for the heading of the stop dialog
 */
export function PartnerDunningPanel({
  tenantId,
  partnerId,
  partnerName,
  mayWrite,
  mayBlock,
}: {
  tenantId: number
  partnerId: number
  partnerName: string
  mayWrite: boolean
  mayBlock: boolean
}) {
  const queryClient = useQueryClient()
  const [blocking, setBlocking] = useState(false)

  const stops = useQuery({
    queryKey: dunningBlocksKey(tenantId, partnerId),
    queryFn: () => fetchDunningBlocks(tenantId, partnerId),
  })

  const grouping = useQuery({
    queryKey: partnerDunningKey(tenantId, partnerId),
    queryFn: () => fetchPartnerDunning(tenantId, partnerId),
  })

  const save = useMutation({
    mutationFn: (value: DunningGrouping | null) =>
      setPartnerDunning(tenantId, partnerId, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: partnerDunningKey(tenantId, partnerId) })
    },
  })

  const current = grouping.data
  const selected = current?.deviation === true ? current.grouping : FOLLOWS_TENANT
  const standing = (stops.data ?? []).filter((block) => block.holds)

  return (
    <Panel
      title="Mahnwesen"
      description="Wie dieser Kunde gemahnt wird, wenn er von der Vorgabe des Mandanten abweichen soll."
    >
      <div className="grid gap-4">
        {grouping.error !== null && <ErrorNotice error={grouping.error} />}
        {save.error !== null && <ErrorNotice error={save.error} />}

        {current !== undefined && (
          <>
            <SelectField
              label="Gruppierung"
              value={selected}
              onChange={(event) =>
                save.mutate(
                  event.target.value === FOLLOWS_TENANT
                    ? null
                    : (event.target.value as DunningGrouping),
                )
              }
              disabled={!mayWrite || save.isPending}
              hint={
                selected === FOLLOWS_TENANT
                  ? 'Folgt der Vorgabe des Mandanten — auch wenn diese später geändert wird.'
                  : DUNNING_GROUPING_HINTS[current.grouping]
              }
            >
              <option value={FOLLOWS_TENANT}>
                Vorgabe des Mandanten ({DUNNING_GROUPINGS[current.grouping]})
              </option>
              {(Object.keys(DUNNING_GROUPINGS) as DunningGrouping[]).map((code) => (
                <option key={code} value={code}>
                  {DUNNING_GROUPINGS[code]}
                </option>
              ))}
            </SelectField>

            <div className="grid gap-2 border-t border-line-subtle pt-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] font-medium">Mahnstopp</span>
                {mayBlock && standing.length === 0 && (
                  <Button variant="secondary" onClick={() => setBlocking(true)}>
                    Mahnstopp setzen
                  </Button>
                )}
              </div>
              {standing.length === 0 ? (
                <p className="text-[13px] text-text-secondary">
                  Kein Stopp. Dieser Kunde wird gemahnt.
                </p>
              ) : (
                standing.map((block) => (
                  <div key={block.id} className="text-[13px]">
                    <Badge tone="danger">{blockLabel(block)}</Badge>
                    {block.note !== undefined && (
                      <div className="text-[12px] text-text-tertiary">{block.note}</div>
                    )}
                  </div>
                ))
              )}
              {/* Aufgehoben wird auf dem eigenen Bildschirm: dort steht der Verlauf. */}
            </div>

            <div>
              {current.deviation ? (
                <Badge tone="accent">Eigene Einstellung</Badge>
              ) : (
                <Badge tone="neutral">Folgt dem Mandanten</Badge>
              )}
            </div>
          </>
        )}

        {!mayWrite && (
          <p className="text-[13px] text-text-secondary">
            Zum Ändern fehlt das Recht «Mahnwesen einrichten».
          </p>
        )}
      </div>
      {blocking && (
        <DunningBlockDialog
          tenantId={tenantId}
          partnerId={partnerId}
          subject={partnerName}
          onClose={() => setBlocking(false)}
        />
      )}
    </Panel>
  )
}
