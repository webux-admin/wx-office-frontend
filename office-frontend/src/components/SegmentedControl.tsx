import { useId } from 'react'

/**
 * A choice between two to four options that are all visible at once.
 *
 * <p>For a choice that changes which fields follow — company or private person — where a
 * dropdown would hide the alternative behind a click. Built on radio buttons, so the arrow
 * keys move between the options and a screen reader announces a group.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  /** What is being chosen, read out for the group and shown above it. */
  label: string
  options: readonly { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
  disabled?: boolean
}) {
  const name = useId()

  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-small font-medium text-text-secondary">{label}</legend>
      <div className="inline-flex rounded-[var(--radius-md)] border border-line bg-sunken p-0.5">
        {options.map((option) => {
          const chosen = option.value === value
          return (
            <label
              key={option.value}
              className={`relative cursor-pointer rounded-[var(--radius-sm)] px-3.5 py-1.5 text-body transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[0.125rem] has-[:focus-visible]:outline-accent-text ${
                chosen
                  ? 'bg-surface font-medium text-text-primary shadow-card'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={chosen}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
