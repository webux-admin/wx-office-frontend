import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Italic } from 'lucide-react'
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { TextField } from '../../components/TextField'
import type { LayoutAlign, LayoutStyle } from '../../lib/types'
import { PRINT_COLOURS } from '../../printlayout/catalogue'
import {
  COLOUR_PATTERN,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_COLOUR,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
} from '../../printlayout/definition'
import { DraftContext, type DraftFlush } from './drafts'
import {
  clamp,
  formatLength,
  formatLengthShort,
  parseLength,
  roundLength,
  roundToStep,
} from '../../printlayout/units'

/**
 * One titled group of the inspector.
 *
 * <p>The inspector shows a few groups with plain headings rather than one long form: someone
 * who opens this screen twice a year finds «Schrift» faster than the fifth field from the top.
 */
export function Group({
  title,
  action,
  children,
}: {
  title: string
  /** A control at the right of the heading. */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-line-subtle px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-overline text-text-tertiary">{title}</h3>
        {action}
      </div>
      <div className="grid grid-cols-1 gap-3">{children}</div>
    </section>
  )
}

type MeasureFieldProps = {
  label: string
  /** The stored number. */
  value: number
  /** Called with a checked number when the field is left, Enter is pressed or a key steps. */
  onCommit: (value: number) => void
  unit?: 'mm' | 'pt'
  min: number
  max: number
  /** What one press of an arrow key adds; ten times that with Shift. */
  step?: number
  disabled?: boolean
  /** A problem with the stored value, from the check of the whole form. */
  error?: string
  tooltip?: ReactNode
  /** Leaves the unit out of the field, where the heading above already names it. */
  bare?: boolean
}

/**
 * A field for a length in millimetres or points.
 *
 * <p>What is typed stays exactly as typed until the field is left: no reformatting under the
 * cursor, no jumping to a clamped value halfway through «12.5». On leaving, the number is
 * checked; a number outside the range is not silently bent into it but refused with a
 * sentence, and the form keeps the value it had. The arrow keys step by the grid.
 */
export function MeasureField({
  label,
  value,
  onCommit,
  unit = 'mm',
  min,
  max,
  step = 0.5,
  disabled = false,
  error,
  tooltip,
  bare = false,
}: MeasureFieldProps) {
  /** What is being typed; `null` while the field just shows the stored value. */
  const [draft, setDraft] = useState<string | null>(null)
  const [complaint, setComplaint] = useState<string | undefined>(undefined)
  const input = useRef<HTMLInputElement>(null)

  /** @returns false when what was typed cannot be taken, which the field then says */
  const settle = (): boolean => {
    if (draft === null) return true
    const parsed = parseLength(draft)
    if (parsed === null) {
      setComplaint('Bitte eine Zahl eingeben, zum Beispiel 12.5.')
      return false
    }
    if (parsed < min || parsed > max) {
      setComplaint(
        `Erlaubt sind ${formatLengthShort(min)} bis ${formatLengthShort(max)} ${unit}.`,
      )
      return false
    }
    setDraft(null)
    setComplaint(undefined)
    if (roundLength(parsed) !== value) onCommit(roundLength(parsed))
    return true
  }

  // The designer asks for the draft before it changes the selection, saves or previews: a
  // click on another element reaches the sheet before this field hears of losing the focus,
  // and without this the number typed for one element would be committed to the next.
  const drafts = useContext(DraftContext)
  const handIn = useRef<DraftFlush>(() => true)
  useEffect(() => {
    handIn.current = (target) => {
      // A press inside the field itself — to place the caret — is no reason to commit.
      if (target instanceof Node && input.current?.contains(target) === true) return true
      return settle()
    }
  })
  useEffect(() => drafts?.register((target) => handIn.current(target)), [drafts])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      settle()
      return
    }
    if (event.key === 'Escape' && draft !== null) {
      // Gives up what was typed, and only that: the designer and the mask stay as they are.
      event.preventDefault()
      event.stopPropagation()
      setDraft(null)
      setComplaint(undefined)
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const from = (draft === null ? null : parseLength(draft)) ?? value
    const by = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1)
    const next = clamp(roundToStep(from + by, step), min, max)
    setDraft(null)
    setComplaint(undefined)
    if (next !== value) onCommit(next)
  }

  return (
    <TextField
      ref={input}
      label={label}
      numeric
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      value={draft ?? formatLength(value)}
      onChange={(event) => {
        setDraft(event.target.value)
        setComplaint(undefined)
      }}
      onBlur={settle}
      onKeyDown={onKeyDown}
      error={complaint ?? error}
      tooltip={tooltip}
      action={
        bare ? undefined : <span className="pr-1.5 text-small text-text-tertiary">{unit}</span>
      }
    />
  )
}

/** A small square switch with an icon, for bold, italic and the like. */
function ToggleButton({
  label,
  pressed,
  onChange,
  children,
}: {
  label: string
  pressed: boolean
  onChange: (pressed: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`grid size-control place-items-center rounded-[var(--radius-md)] border transition-colors ${
        pressed
          ? 'border-accent bg-accent/10 text-accent-text'
          : 'border-line text-text-secondary hover:border-text-tertiary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

const ALIGN_OPTIONS: readonly { value: LayoutAlign; label: string; icon: ReactNode }[] = [
  { value: 'left', label: 'Linksbündig', icon: <AlignLeft size={16} aria-hidden /> },
  { value: 'center', label: 'Zentriert', icon: <AlignCenter size={16} aria-hidden /> },
  { value: 'right', label: 'Rechtsbündig', icon: <AlignRight size={16} aria-hidden /> },
]

/**
 * The three ways text can be aligned, as one group of switches.
 *
 * @param value the alignment in force — the stored one, or the default it falls back to
 */
export function AlignButtons({
  label = 'Ausrichtung',
  value,
  onChange,
}: {
  label?: string
  value: LayoutAlign
  onChange: (align: LayoutAlign) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {ALIGN_OPTIONS.map((option) => (
        <ToggleButton
          key={option.value}
          label={option.label}
          pressed={value === option.value}
          onChange={() => onChange(option.value)}
        >
          {option.icon}
        </ToggleButton>
      ))}
    </div>
  )
}

/**
 * The colour of text or of a line: a short row of print colours, and a picker for any other.
 *
 * <p>Swatches first, because seven sober colours cover what a business document needs and
 * nobody has to know what a hex value is. The swatch shows the colour itself: it is ink on
 * paper, a value of the form, and so the one place where a colour is not a token.
 */
export function ColourField({
  label = 'Farbe',
  value,
  fallback = DEFAULT_TEXT_COLOUR,
  onChange,
}: {
  label?: string
  /** The stored colour, `null` or undefined for the default of the renderer. */
  value: string | null | undefined
  /** The colour the renderer uses where none is stored. */
  fallback?: string
  onChange: (colour: string) => void
}) {
  const pickerId = useId()
  const current = (value ?? fallback).toLowerCase()
  const listed = PRINT_COLOURS.some((colour) => colour.value === current)
  return (
    <div>
      <span className="mb-1.5 block text-small font-medium text-text-secondary">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRINT_COLOURS.map((colour) => {
          const chosen = colour.value === current
          return (
            <button
              key={colour.value}
              type="button"
              aria-label={colour.label}
              title={colour.label}
              aria-pressed={chosen}
              onClick={() => onChange(colour.value)}
              className={`grid size-7 place-items-center rounded-[var(--radius-full)] border transition-shadow ${
                chosen ? 'border-text-primary ring-2 ring-accent-text/40' : 'border-line'
              }`}
              style={{ backgroundColor: colour.value }}
            >
              {chosen && <Check size={13} aria-hidden className="text-on-accent" />}
            </button>
          )
        })}
        <label
          htmlFor={pickerId}
          title="Eigene Farbe"
          className={`relative grid h-7 cursor-pointer place-items-center rounded-[var(--radius-full)] border px-2.5 text-small text-text-secondary transition-colors hover:text-text-primary ${
            listed ? 'border-line' : 'border-text-primary ring-2 ring-accent-text/40'
          }`}
        >
          Eigene
          <input
            id={pickerId}
            type="color"
            aria-label={`${label}: eigene Farbe`}
            value={COLOUR_PATTERN.test(current) ? current : fallback}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  )
}

/**
 * Font size, weight, slant, alignment and colour of an element or a section.
 *
 * @param style the stored style
 * @param onChange called with the properties to replace
 * @param align the alignment in force when the style names none; left out, alignment is not
 *   offered — a table aligns its columns, not itself
 * @param error a problem with the stored font size
 */
export function StyleFields({
  style,
  onChange,
  align,
  error,
}: {
  style: LayoutStyle
  onChange: (change: Partial<LayoutStyle>) => void
  align?: LayoutAlign
  error?: string
}) {
  return (
    <>
      <div className="flex items-end gap-1.5">
        <div className="min-w-0 flex-1">
          <MeasureField
            label="Grösse"
            unit="pt"
            value={style.fontSize ?? DEFAULT_FONT_SIZE}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={0.5}
            onCommit={(fontSize) => onChange({ fontSize })}
            error={error}
          />
        </div>
        <ToggleButton
          label="Fett"
          pressed={style.bold === true}
          onChange={(bold) => onChange({ bold })}
        >
          <Bold size={16} aria-hidden />
        </ToggleButton>
        <ToggleButton
          label="Kursiv"
          pressed={style.italic === true}
          onChange={(italic) => onChange({ italic })}
        >
          <Italic size={16} aria-hidden />
        </ToggleButton>
      </div>
      {align !== undefined && (
        <AlignButtons
          value={style.align ?? align}
          onChange={(next) => onChange({ align: next })}
        />
      )}
      <ColourField value={style.colour} onChange={(colour) => onChange({ colour })} />
    </>
  )
}

/** One option of a {@link ChoiceList}. */
export type Choice<Value extends string> = {
  value: Value
  label: string
  /** A line under the label saying what choosing it means. */
  description?: string
  /** Why the option cannot be chosen right now; with it the option is disabled. */
  unavailable?: string
}

/**
 * A choice between a few options that need a sentence each.
 *
 * <p>Radio buttons under one legend, so the arrow keys move between the options. An option
 * that cannot be chosen stays in the list with the reason next to it: hidden, nobody would
 * know it exists; merely greyed, nobody would know why.
 */
export function ChoiceList<Value extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string
  options: readonly Choice<Value>[]
  value: Value
  onChange: (value: Value) => void
  error?: string
}) {
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-1.5 text-small font-medium text-text-secondary">{label}</legend>
      <div className="grid grid-cols-1 gap-1.5">
        {options.map((option) => {
          const disabled = option.unavailable !== undefined
          const chosen = option.value === value
          const noteId = `${name}-${option.value}`
          return (
            <label
              key={option.value}
              className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[0.125rem] has-[:focus-visible]:outline-accent-text ${
                chosen ? 'border-accent bg-accent/8' : 'border-line'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:border-text-tertiary'}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={chosen}
                disabled={disabled}
                aria-describedby={noteId}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0">
                <span className={`block text-body ${disabled ? 'text-text-tertiary' : 'text-text-primary'}`}>
                  {option.label}
                </span>
                <span id={noteId} className="mt-0.5 block text-small text-text-secondary">
                  {option.unavailable ?? option.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {error !== undefined && (
        <p aria-live="polite" className="mt-1.5 text-small text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}
