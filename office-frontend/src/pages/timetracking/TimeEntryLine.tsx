import type { Ref } from 'react'
import { Button } from '../../components/Button'
import { RichTextField } from '../../components/RichTextField'
import { TextField } from '../../components/TextField'
import { DURATION_FORMS } from '../../lib/duration'
import {
  TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
  type TimeEntryForm,
  type TimeEntryLineField,
} from '../../lib/timetracking'
import type { TimeBillableDefault } from '../../lib/types'
import { BillableField, ServiceField, TargetField } from '../../timetracking/AssignmentFields'
import { enterSubmits } from '../../timetracking/enterSubmits'

/**
 * The quick line: project or customer, service, duration, text and «verrechenbar» in one row,
 * in that order, and on a phone the same fields one under the other.
 *
 * <p>Enter saves from every field, except while a list is open on a marked hit — then Enter
 * takes the hit. The same form records a new entry at the top of the screen and changes a
 * stored one in its row of the list (frontend ADR-0082).
 *
 * <p>The line holds no state of its own: what stands in it belongs to the screen, which knows
 * whether an Escape throws something away.
 *
 * @param onChange receives an update of the line rather than the line, because the suggested
 *   service arrives after the click that asked for it, when the line may have moved on
 */
export function TimeEntryLine({
  tenantId,
  form,
  onChange,
  projectsOn,
  errors,
  busy,
  suggestServices,
  onSubmit,
  onCancel,
  label,
  durationRef,
  formRef,
  billableDefault,
}: {
  tenantId: number
  form: TimeEntryForm
  onChange: (update: (current: TimeEntryForm) => TimeEntryForm) => void
  /** Whether the tenant runs the projects; without them the first field searches customers. */
  projectsOn: boolean
  /** The default and lock of «verrechenbar» for the target, `undefined` while unknown. */
  billableDefault: TimeBillableDefault | undefined
  /** The message for each field, already drawn from the line's own checks and the backend. */
  errors: Partial<Record<TimeEntryLineField, string>>
  /** True while the line is being saved; a second Enter then does nothing. */
  busy: boolean
  /**
   * Asks the server for the service last taken on a picked target. Only for one's own times:
   * the suggestion is the signed in user's (backend ADR-0160).
   */
  suggestServices: boolean
  onSubmit: () => void
  /** Present for a stored entry; it adds «Abbrechen». */
  onCancel?: () => void
  /** What the form is announced as, for example «Neuer Eintrag». */
  label: string
  /** Lets the screen put the focus on the duration, where the next entry starts. */
  durationRef?: Ref<HTMLInputElement>
  /** Lets the screen tell which line holds the focus. */
  formRef?: Ref<HTMLFormElement>
}) {
  return (
    <form
      ref={formRef}
      aria-label={label}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSubmit()
      }}
      onKeyDown={enterSubmits(onSubmit, busy)}
      className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_7.5rem_minmax(0,2fr)_auto_auto] lg:items-start lg:gap-3"
    >
      <TargetField
        tenantId={tenantId}
        form={form}
        onChange={onChange}
        projectsOn={projectsOn}
        suggestServices={suggestServices}
        error={errors.target}
      />

      <ServiceField tenantId={tenantId} form={form} onChange={onChange} error={errors.service} />

      <TextField
        ref={durationRef}
        label="Dauer"
        value={form.duration}
        onChange={(event) => {
          const duration = event.target.value
          onChange((current) => ({ ...current, duration }))
        }}
        placeholder="1:30"
        autoComplete="off"
        required
        // No reading under the field while typing: the tooltip names the forms, and a duration
        // that is none is told at the field when saving, like every other field (frontend ADR-0087).
        error={errors.duration}
        tooltip={DURATION_FORMS}
      />

      <RichTextField
        label="Text"
        value={form.description}
        onChange={(description) => onChange((current) => ({ ...current, description }))}
        placeholder="Was wurde gemacht?"
        maxLength={TIME_ENTRY_DESCRIPTION_MAX_LENGTH}
        error={errors.description}
        rows={2}
        enterKey="form"
        tooltip="Fett, kursiv und Listen über die Leiste oben, mit Strg+B und Strg+I oder «- » am Zeilenanfang. Enter speichert, Umschalt+Enter beginnt eine neue Zeile."
      />

      {/* The two cells without a label start where the inputs do. */}
      <div className="flex h-control items-center lg:mt-6">
        <BillableField
          form={form}
          onChange={onChange}
          rule={billableDefault}
          projectsOn={projectsOn}
        />
      </div>

      <div className="flex items-center gap-2 lg:mt-6">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        )}
        <Button type="submit" busy={busy} shortcut>
          Speichern
        </Button>
      </div>
    </form>
  )
}
