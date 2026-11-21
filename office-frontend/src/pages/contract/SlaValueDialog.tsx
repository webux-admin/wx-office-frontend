import { useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { SelectField } from '../../components/SelectField'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { useFieldErrors } from '../../components/useFieldErrors'
import {
  SLA_DESCRIPTION_MAX_LENGTH,
  SLA_METRIC_LABELS,
  SLA_METRIC_UNITS,
  SLA_UNIT_LABELS,
  emptySlaValueForm,
  isSlaMetric,
  isSlaUnit,
  slaValueComplaints,
  withSlaMetric,
  type SlaValueForm,
} from '../../lib/contract'

/**
 * Adds a service level value to a contract, or changes one it already has.
 *
 * <p>Nothing is sent from here: the value goes into the form of the contract and is saved with
 * it. The metric comes from the fixed catalogue, and the unit select offers only the units that
 * metric allows (backend ADR-0146).
 */
export function SlaValueDialog({
  open,
  onClose,
  onSubmit,
  value,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (value: SlaValueForm) => void
  /** The value being changed; absent while a new one is added. */
  value?: SlaValueForm
}) {
  const [form, setForm] = useState(() => value ?? emptySlaValueForm())
  const [wasOpen, setWasOpen] = useState(open)
  const { errors, check, reset } = useFieldErrors(() => slaValueComplaints(form), null)

  // It stays mounted, so it has to forget what was typed the last time it was open.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(value ?? emptySlaValueForm())
      reset()
    }
  }

  const submit = () => {
    if (check()) onSubmit(form)
  }
  const units = form.metric === '' ? [] : SLA_METRIC_UNITS[form.metric]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={value ? 'Service-Level bearbeiten' : 'Service-Level hinzufügen'}
      onSubmit={submit}
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} shortcut>
            {value ? 'Übernehmen' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectField
          label="Kennzahl"
          value={form.metric}
          onChange={(event) => {
            const metric = event.target.value
            if (isSlaMetric(metric)) setForm((current) => withSlaMetric(current, metric))
          }}
          required
          error={errors.metric}
        >
          {Object.entries(SLA_METRIC_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Zielwert"
            value={form.targetValue}
            onChange={(event) => {
              const targetValue = event.target.value
              setForm((current) => ({ ...current, targetValue }))
            }}
            inputMode="decimal"
            numeric
            required
            error={errors.targetValue}
            tooltip="Was vereinbart ist, nicht was gemessen wird. Höchstens drei Nachkommastellen."
          />
          <SelectField
            label="Einheit"
            value={form.unit}
            onChange={(event) => {
              const unit = event.target.value
              setForm((current) => ({ ...current, unit: isSlaUnit(unit) ? unit : '' }))
            }}
            required
            error={errors.unit}
          >
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {SLA_UNIT_LABELS[unit]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField
          label="Text"
          value={form.description}
          onChange={(event) => {
            const description = event.target.value
            setForm((current) => ({ ...current, description }))
          }}
          maxLength={SLA_DESCRIPTION_MAX_LENGTH}
          rows={3}
          error={errors.description}
          tooltip="Was sonst dazu vereinbart ist: «Mo–Fr 08:00–17:00», «Priorität 1», «pro Kalendermonat»."
        />
      </div>
    </Dialog>
  )
}
