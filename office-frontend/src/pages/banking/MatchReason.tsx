import { Badge } from '../../components/Badge'
import { CONFIDENCE_HINTS, CONFIDENCE_NAMES, CONFIDENCE_TONES, reasonChips } from '../../lib/matching'
import type { MatchProposal } from '../../lib/types'

/**
 * Why the cascade thinks a payment belongs to an invoice.
 *
 * <p><b>The sentence is the point, not the chips.</b> A proposal that cannot be read out in one
 * sentence is no accounting record for an audit under OR Art. 957a Abs. 2 — which is exactly
 * why the confidence is a named step and never a percentage (backend ADR-0108).
 *
 * <p>Its own component because the clearing basket shows the same thing in a split view: one
 * wording for one fact, in one place (ADR-0042).
 */
export function MatchReason({
  proposal,
  compact = false,
}: {
  proposal: MatchProposal
  /** Leaves the sentence out and shows only the chips, for a narrow list row. */
  compact?: boolean
}) {
  const chips = reasonChips(proposal)

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={CONFIDENCE_TONES[proposal.confidence]}>
          {CONFIDENCE_NAMES[proposal.confidence]}
        </Badge>
        {chips.map((chip) => (
          <Badge key={chip} tone="neutral">
            {chip}
          </Badge>
        ))}
      </div>
      {!compact && (
        <p className="text-[13px] text-text-secondary">{proposal.reason}</p>
      )}
    </div>
  )
}

/**
 * What a confidence step means, spelled out.
 *
 * <p>Shown where somebody chooses one — in the rule catalogue — rather than left to be
 * inferred from three adjectives.
 */
export function ConfidenceHint({ confidence }: { confidence: MatchProposal['confidence'] }) {
  return <span className="text-[12px] text-text-tertiary">{CONFIDENCE_HINTS[confidence]}</span>
}
