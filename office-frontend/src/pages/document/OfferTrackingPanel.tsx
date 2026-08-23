import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatAmount, formatDateTime, formatPercent, parseDecimal } from '../../lib/format'
import type { OfferTracking } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'

/**
 * The quick picks for the win probability, in percent.
 *
 * <p>Five coarse steps, because an estimate is coarse: whoever knows it to the percent types
 * it into the field next to them.
 */
const QUICK_PICKS = [10, 25, 50, 75, 90]

/**
 * The follow-up state of one offer: how likely it is to become an order, and how it went.
 *
 * <p>The weighted amount comes from the backend along with the probability; the browser
 * never multiplies the two itself. Once the outcome is decided, the panel says who decided
 * it and when, and the probability freezes on what the decision set.
 *
 * @param editable whether the probability may be changed: the outcome is open, the document
 *                 is not cancelled and the user holds the write right
 */
export function OfferTrackingPanel({
  tenantId,
  base,
  tracking,
  currency,
  editable,
  readOnlyNote,
  onChanged,
}: {
  tenantId: number
  /** Path of the offer, for example `/api/tenants/1/offers/42`. */
  base: string
  tracking: OfferTracking
  /** Currency of the offer, shown next to the weighted amount. */
  currency: string
  editable: boolean
  /** Why the panel is read only although the outcome is open, where a right is missing. */
  readOnlyNote?: string
  onChanged: () => void
}) {
  const outcomeLabel = useCatalogueLabel(tenantId, 'offer-outcome')
  const reasonLabel = useCatalogueLabel(tenantId, 'offer-decline-reason')
  const [probability, setProbability] = useState(
    tracking.winProbability === undefined ? '' : String(tracking.winProbability),
  )
  const [probabilityError, setProbabilityError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (winProbability: number | null) =>
      api.put<OfferTracking>(`${base}/tracking/probability`, { winProbability }),
    onSuccess: onChanged,
  })

  // Only the truly empty field takes the estimate away. A typo like «7o» must be an
  // error, not a silent removal — and the contract takes whole percents only.
  const submitProbability = () => {
    if (probability.trim() === '') {
      save.mutate(null)
      return
    }
    const parsed = parseDecimal(probability)
    if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      setProbabilityError('Ganze Zahl zwischen 0 und 100 — oder leer lassen.')
      return
    }
    save.mutate(parsed)
  }

  const decided = tracking.outcome !== 'OPEN'

  return (
    <Panel
      title="Verfolgung"
      description="Wie wahrscheinlich die Offerte zum Auftrag wird."
    >
      <div className="grid gap-4">
        {decided && (
          <div className="text-[13px]">
            <span className="block font-medium">{outcomeLabel(tracking.outcome)}</span>
            <span className="block text-text-secondary">
              {formatDateTime(tracking.outcomeAt)}
              {tracking.outcomeBy ? ` · ${tracking.outcomeBy}` : ''}
            </span>
            {tracking.outcome === 'DECLINED' && tracking.declinedReasonCode && (
              <span className="block text-text-secondary">
                Grund: {reasonLabel(tracking.declinedReasonCode)}
              </span>
            )}
            {tracking.outcome === 'DECLINED' && tracking.declinedNote && (
              <span className="block text-text-secondary">{tracking.declinedNote}</span>
            )}
          </div>
        )}

        {editable ? (
          <>
            <div className="flex flex-wrap items-center gap-1" role="group"
              aria-label="Schnellwahl der Gewinnwahrscheinlichkeit">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick}
                  type="button"
                  aria-pressed={tracking.winProbability === pick}
                  disabled={save.isPending}
                  onClick={() => save.mutate(pick)}
                  className={`h-8 rounded-[var(--radius-sm)] px-3 text-[13px] transition-colors ${
                    tracking.winProbability === pick
                      ? 'bg-sunken text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {pick} %
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <TextField
                label="Gewinnwahrscheinlichkeit in %"
                value={probability}
                onChange={(event) => {
                  setProbability(event.target.value)
                  setProbabilityError(null)
                }}
                inputMode="decimal"
                numeric
                className="flex-1"
                invalid={probabilityError !== null}
                hint={probabilityError ?? 'Leer lassen, um die Einschätzung zu entfernen.'}
              />
              <Button
                variant="secondary"
                onClick={submitProbability}
                busy={save.isPending}
              >
                Übernehmen
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[13px]">
            <span className="block text-text-secondary">Gewinnwahrscheinlichkeit</span>
            <span className="block font-medium">{formatPercent(tracking.winProbability)}</span>
          </p>
        )}

        {tracking.weightedGross !== undefined && (
          <p className="text-[13px]">
            <span className="block text-text-secondary">Gewichteter Betrag</span>
            <span className="block font-mono font-medium tabular-nums">
              {formatAmount(tracking.weightedGross)}{' '}
              <span className="font-sans font-normal text-text-tertiary">{currency}</span>
            </span>
          </p>
        )}

        {readOnlyNote !== undefined && !decided && (
          <p className="text-[13px] text-text-secondary">{readOnlyNote}</p>
        )}

        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Panel>
  )
}
