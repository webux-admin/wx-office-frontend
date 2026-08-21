import { X } from 'lucide-react'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { TextField } from '../../components/TextField'
import { MAX_COPIES, nextCopyLabel, withMovedCopy } from './documentTypeForm'

/**
 * How often a kind of document is printed and what each copy is called.
 *
 * <p>The order of the rows is the order in the PDF, so the first row is the original. Only
 * the labels are edited; the position follows from the row, which is why moving a row is the
 * way to reorder the print.
 *
 * @param copies the labels in printing order
 * @param onChange called with the new order or the new labels
 * @param disabled true where the user may look but not write
 */
export function CopyEditor({
  copies,
  onChange,
  disabled = false,
}: {
  copies: string[]
  onChange: (copies: string[]) => void
  disabled?: boolean
}) {
  const replace = (index: number, label: string) =>
    onChange(copies.map((current, position) => (position === index ? label : current)))

  return (
    <Panel
      title="Ausfertigungen"
      description="Wie viele Exemplare beim Drucken herauskommen und wie sie beschriftet sind. Ohne Eintrag kommt ein Exemplar ohne Beschriftung. Das Archiv behält immer genau ein Original."
    >
      <div className="grid gap-3">
        {copies.length === 0 && (
          <p className="text-[13px] text-text-secondary">
            Ein Exemplar ohne Beschriftung.
          </p>
        )}

        {copies.map((label, index) => (
          <div key={index} className="flex items-end gap-3">
            <span className="pb-2.5">
              <RowOrderButtons
                name={`${index + 1}. Ausfertigung`}
                upDisabled={disabled || index === 0}
                downDisabled={disabled || index === copies.length - 1}
                onUp={() => onChange(withMovedCopy(copies, index, -1))}
                onDown={() => onChange(withMovedCopy(copies, index, 1))}
              />
            </span>
            <TextField
              label={`${index + 1}. Ausfertigung`}
              value={label}
              maxLength={60}
              disabled={disabled}
              onChange={(event) => replace(index, event.target.value)}
              className="flex-1"
            />
            <button
              type="button"
              disabled={disabled}
              aria-label={`${index + 1}. Ausfertigung entfernen`}
              onClick={() => onChange(copies.filter((_, position) => position !== index))}
              className="mb-1 grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-danger disabled:opacity-40"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between">
          {copies.length < MAX_COPIES ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([...copies, nextCopyLabel(copies.length)])}
              className="text-[12px] text-text-secondary transition-colors hover:text-accent-text disabled:opacity-40"
            >
              + Ausfertigung
            </button>
          ) : (
            <span className="text-[12px] text-text-tertiary">
              Mehr als {MAX_COPIES} Ausfertigungen sind nicht möglich.
            </span>
          )}
          <span className="text-[12px] text-text-tertiary">
            {copies.length} von {MAX_COPIES}
          </span>
        </div>
      </div>
    </Panel>
  )
}
