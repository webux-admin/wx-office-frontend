import type { ReactNode } from 'react'

/**
 * One answer of a question that has exactly one, with the whole row as its click target.
 *
 * <p>The same control the chart template dialog uses, in a file of its own because the setup
 * wizard asks two such questions on its first step and one on its third. Not in
 * `src/components`: it is the look of these accounting questions and not a building block of the
 * application — the day another screen needs it, it moves.
 *
 * @param group the radio group; two questions on one screen need two names
 * @param checked whether this is the answer that stands
 * @param onChoose called when the row is clicked
 * @param title what the answer says
 * @param hint the line under it, left out where there is nothing to add
 */
export function StepChoice({
  group,
  checked,
  onChoose,
  title,
  hint,
}: {
  group: string
  checked: boolean
  onChoose: () => void
  title: string
  hint?: ReactNode
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors ${
        checked ? 'border-accent bg-sunken' : 'border-line hover:border-text-tertiary'
      }`}
    >
      <input
        type="radio"
        name={group}
        checked={checked}
        onChange={onChoose}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-text)]"
      />
      <span className="min-w-0">
        <span className="block text-[13px]">{title}</span>
        {hint !== undefined && <span className="block text-[12px] text-text-secondary">{hint}</span>}
      </span>
    </label>
  )
}
