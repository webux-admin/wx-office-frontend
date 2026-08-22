import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { TextField } from '../../components/TextField'
import {
  lockedDiscount,
  withDiscountAmount,
  withDiscountPercent,
  type DiscountFields,
} from './lineForm'

/**
 * The parts both position dialogs are built from.
 *
 * <p>They sit here rather than in `components/` because they know what a document line is:
 * that a discount is a percentage or an amount but never both, and that an empty date of
 * supply means the document date.
 */

/**
 * The pair of discount fields.
 *
 * <p>Filling one locks and empties the other. The rule is the backend's, but it has to be
 * visible in the mask: a refusal that arrives only after "Hinzufügen" leaves the user
 * guessing which of the two figures was too much.
 */
export function DiscountPair({
  fields,
  onChange,
  onTouch,
  disabled = false,
  disabledHint,
  percentProblem,
  amountProblem,
}: {
  fields: DiscountFields
  onChange: (fields: DiscountFields) => void
  /**
   * Says which of the two the user has typed into or left, for a dialog that keeps its
   * messages back until a field has been dealt with.
   */
  onTouch?: (field: 'percent' | 'amount') => void
  /** True where the product may not be discounted at all. */
  disabled?: boolean
  /** Why both fields are off, shown under the percentage. */
  disabledHint?: string
  /** What is wrong with the percentage, from `lineProblems`. */
  percentProblem?: string
  /** What is wrong with the amount, from `lineProblems`. */
  amountProblem?: string
}) {
  const locked = lockedDiscount(fields)
  const exclusive = 'Prozent und Betrag schliessen sich aus.'

  return (
    <>
      <TextField
        label="Rabatt in Prozent"
        value={fields.percent}
        onChange={(event) => {
          onTouch?.('percent')
          onChange(withDiscountPercent(fields, event.target.value))
        }}
        onBlur={() => onTouch?.('percent')}
        inputMode="decimal"
        numeric
        disabled={disabled || locked === 'percent'}
        invalid={percentProblem !== undefined}
        hint={
          percentProblem ??
          (disabled ? disabledHint : locked === 'percent' ? exclusive : undefined)
        }
      />
      <TextField
        label="Rabatt als Betrag"
        value={fields.amount}
        onChange={(event) => {
          onTouch?.('amount')
          onChange(withDiscountAmount(fields, event.target.value))
        }}
        onBlur={() => onTouch?.('amount')}
        inputMode="decimal"
        numeric
        disabled={disabled || locked === 'amount'}
        invalid={amountProblem !== undefined}
        hint={
          amountProblem ??
          (disabled ? undefined : locked === 'amount' ? exclusive : 'Gilt für die ganze Zeile.')
        }
      />
    </>
  )
}

/**
 * The secondary part of a position dialog, folded away until it is wanted.
 *
 * <p>What is inside is rarely filled in and would otherwise push the fields that always are
 * further down. Folded away, not removed: it stays reachable with the keyboard and the
 * button says whether it is open.
 *
 * <p>Folded only while it is empty. A line that already carries a date of supply shows it —
 * the day of supply decides the VAT rate, and a value nobody can see is a value nobody
 * corrects.
 */
export function MoreDetails({
  defaultOpen = false,
  summary,
  children,
}: {
  /** True where what is inside is already filled in, so it is not hidden from the user. */
  defaultOpen?: boolean
  /**
   * What is inside, in one line, shown next to the button whether it is open or not. Without
   * it the fold would swallow a discount somebody set and folded away again.
   */
  summary?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()

  return (
    <div className="mt-5 border-t border-line-subtle pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-[var(--radius-sm)] text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ChevronRight
            size={14}
            aria-hidden
            className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          Weitere Angaben
        </button>

        {summary && (
          <span className="rounded-[var(--radius-sm)] bg-sunken px-2 py-0.5 text-[11px] text-text-secondary">
            {summary}
          </span>
        )}
      </div>

      <div id={id} hidden={!open} className="mt-3">
        {children}
      </div>
    </div>
  )
}

/**
 * The period the service was rendered in.
 *
 * <p>Stays in the mask although it is almost always empty: the day of supply, not the
 * document date, decides which VAT rate applies (MWSTG), so a line delivered before a rate
 * change must be able to say so.
 */
export function ServiceDateFields({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
}) {
  return (
    <>
      <p className="mb-3 text-[12px] text-text-secondary">
        Bleibt das Leistungsdatum leer, gilt das Belegdatum. Es bestimmt den MwSt-Satz.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Leistung von"
          type="date"
          value={from}
          onChange={(event) => onFrom(event.target.value)}
        />
        <TextField
          label="Leistung bis"
          type="date"
          value={to}
          onChange={(event) => onTo(event.target.value)}
        />
      </div>
    </>
  )
}
