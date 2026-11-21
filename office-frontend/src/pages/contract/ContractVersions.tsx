import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { FactList } from '../../components/FactList'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import {
  CONTRACT_END_REASON_LABELS,
  CONTRACT_STATUS_LABELS,
  contractStatusChangesUrl,
  contractTerm,
  contractVersionsUrl,
  contractsKey,
  noticePeriodText,
  toPositionForm,
} from '../../lib/contract'
import { formatDate, formatDateTime } from '../../lib/format'
import type { Contract, ContractStatusChange, ContractVersion } from '../../lib/types'
import { ContractPositions } from './ContractPositions'

/** What a step is called in the trail. */
const STEP_LABELS: Record<string, string> = {
  'DRAFT>ACTIVE': 'Aktiviert',
  'ACTIVE>ENDED': 'Beendet',
}

/**
 * The versions of a contract and its trail of status steps, for reading.
 *
 * <p>Nothing here changes anything: a version is never changed, and the backend has no way to
 * do it (backend ADR-0145). The newest version is shown first; an older one is chosen from the
 * list above it.
 */
export function ContractVersions({ tenantId, contract }: { tenantId: number; contract: Contract }) {
  // Keyed by the lock as well, so a save or a step brings the new version along.
  const key = [...contractsKey(tenantId), 'versions', contract.id, contract.lockVersion]
  const versions = useQuery({
    queryKey: key,
    queryFn: () => api.get<ContractVersion[]>(contractVersionsUrl(tenantId, contract.id)),
  })
  const steps = useQuery({
    queryKey: [...key, 'steps'],
    queryFn: () => api.get<ContractStatusChange[]>(contractStatusChangesUrl(tenantId, contract.id)),
  })
  const [chosen, setChosen] = useState<number | null>(null)

  if (versions.isPending || steps.isPending) return <LoadingBlock label="Versionen werden geladen" />
  if (versions.error) return <ErrorNotice error={versions.error} />
  if (steps.error) return <ErrorNotice error={steps.error} />

  const shown = versions.data.find((version) => version.versionNo === chosen) ?? versions.data[0]

  return (
    <div className="grid gap-6">
      <Panel title="Verlauf">
        <ul className="grid gap-1.5 text-body">
          <li>
            Angelegt {formatDateTime(contract.createdAt)}
            {contract.createdBy ? ` von ${contract.createdBy}` : ''}
          </li>
          {steps.data.map((step) => (
            <li key={`${step.fromStatus}>${step.toStatus}`}>
              {STEP_LABELS[`${step.fromStatus}>${step.toStatus}`] ?? CONTRACT_STATUS_LABELS[step.toStatus]}{' '}
              {formatDateTime(step.changedAt)}
              {step.changedBy ? ` von ${step.changedBy}` : ''}
              {step.toStatus === 'ENDED' && contract.endedOn && (
                <span className="text-text-secondary">
                  {' '}
                  · letzter Vertragstag {formatDate(contract.endedOn)}
                  {contract.endReason ? `, ${CONTRACT_END_REASON_LABELS[contract.endReason]}` : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {shown === undefined ? (
        <p className="text-body text-text-secondary">
          Ein Entwurf hat noch keine Version. Version 1 entsteht beim Aktivieren.
        </p>
      ) : (
        <>
          <Panel title="Versionen" padded={false}>
            <ul aria-label="Versionen" className="divide-y divide-line-subtle">
              {versions.data.map((version) => (
                <li key={version.versionNo}>
                  <button
                    type="button"
                    aria-pressed={version.versionNo === shown.versionNo}
                    onClick={() => setChosen(version.versionNo)}
                    className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-left text-body transition-colors hover:bg-sunken ${
                      version.versionNo === shown.versionNo ? 'bg-sunken' : ''
                    }`}
                  >
                    <span className="font-medium">Version {version.versionNo}</span>
                    <span className="tabular-nums text-text-secondary">
                      gilt ab {formatDate(version.validFrom)}
                    </span>
                    {version.versionNo === contract.currentVersionNo && (
                      <Badge tone="accent">aktuell</Badge>
                    )}
                    <span className="ml-auto text-small text-text-tertiary">
                      erfasst {formatDateTime(version.createdAt)}
                      {version.createdBy ? ` von ${version.createdBy}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <section aria-label={`Version ${shown.versionNo}`} className="grid gap-4">
            <FactList
              facts={[
                { label: 'Version', value: String(shown.versionNo) },
                { label: 'Gilt ab', value: formatDate(shown.validFrom) },
                { label: 'Bezeichnung', value: shown.title },
                {
                  label: 'Kunde',
                  value: `${shown.customerName}${shown.customerTown ? `, ${shown.customerTown}` : ''}`,
                },
                { label: 'Laufzeit', value: contractTerm(shown.startDate, shown.endDate, formatDate) },
                {
                  label: 'Kündigungsfrist',
                  value: noticePeriodText(shown.noticePeriodAmount, shown.noticePeriodUnit),
                },
              ]}
            />
            <ContractPositions
              tenantId={tenantId}
              positions={shown.positions.map(toPositionForm)}
              totals={shown.totals}
              onChange={() => {}}
              editable={false}
              partnerId={String(shown.partnerId)}
              dateOfSupply={shown.validFrom}
              mayReadProducts={false}
            />
          </section>
        </>
      )}
    </div>
  )
}
