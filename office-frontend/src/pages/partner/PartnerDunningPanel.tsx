import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import {
  DUNNING_GROUPINGS,
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
 * @param mayWrite whether the user holds `DUNNING_CONFIGURE`
 */
export function PartnerDunningPanel({
  tenantId,
  partnerId,
  mayWrite,
}: {
  tenantId: number
  partnerId: number
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()

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
    </Panel>
  )
}
