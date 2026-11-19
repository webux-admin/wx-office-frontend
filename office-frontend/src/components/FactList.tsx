import type { ReactNode } from 'react'

/** One fact of a record: what it is and its value. */
export type Fact = {
  label: string
  value: ReactNode
}

/**
 * A line of facts about a record, read at a glance.
 *
 * <p>For the details somebody looks up a record for — an address, a phone number, a balance —
 * so the common look-up needs no click into a register. Facts without a value are left out
 * rather than drawn with a dash: the line stays short.
 */
export function FactList({ facts }: { facts: readonly Fact[] }) {
  const shown = facts.filter(
    (fact) => fact.value !== null && fact.value !== undefined && fact.value !== '',
  )
  if (shown.length === 0) return null

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-[var(--radius-lg)] border border-line-subtle bg-surface px-5 py-3.5">
      {shown.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-overline text-text-tertiary">{fact.label}</dt>
          <dd className="mt-0.5 text-body text-text-primary">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
