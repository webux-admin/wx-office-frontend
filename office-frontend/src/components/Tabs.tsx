/** One register of a mask. */
export type TabItem<Id extends string> = {
  id: Id
  label: string
  /** How many entries the register holds, drawn beside the label. Left out where unknown. */
  count?: number
}

/**
 * The register strip above a mask.
 *
 * <p>Which register is open is state of the screen, not of the address: a mask is reached by
 * its record, and the register it was left on is not worth a second URL for the same thing.
 */
export function Tabs<Id extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabItem<Id>[]
  active: Id
  onChange: (id: Id) => void
  /** What the strip switches between, for a screen reader that lands on it out of context. */
  label: string
}) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-line-subtle" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-body transition-colors ${
            active === tab.id
              ? 'border-accent text-text-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-[var(--radius-full)] bg-sunken px-1.5 font-mono text-caption tabular-nums text-text-secondary">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
