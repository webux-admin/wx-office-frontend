import { CheckboxField } from '../../components/CheckboxField'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatDate } from '../../lib/format'
import type { FiscalYearFormState } from './fiscalYearForm'

/**
 * The fields themselves, without a box around them.
 *
 * <p>Deliberately no `Dialog`: the fiscal year screen renders them in one, the wizard renders
 * them plainly in a panel, and a component that carried the overlay could only ever be used in
 * the first of the two.
 *
 * @param state what {@link useFiscalYearForm} worked out
 * @param creating whether a year is being created; the following-year tick shows only then
 */
export function FiscalYearFields({
  state,
  creating,
}: {
  state: FiscalYearFormState
  creating: boolean
}) {
  const { form, set, label, numberYear, following, error, warning } = state
  return (
    <div className="grid gap-4">
      <TextField
        label="Bezeichnung"
        value={label}
        onChange={(event) => set('label', event.target.value)}
        maxLength={20}
        hint="Steht auf jeder Auswertung, zum Beispiel 2027 oder 2026/27."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Beginn"
          type="date"
          value={form.startDate}
          onChange={(event) => set('startDate', event.target.value)}
          invalid={error !== ''}
        />
        <TextField
          label="Ende"
          type="date"
          value={form.endDate}
          onChange={(event) => set('endDate', event.target.value)}
          invalid={error !== ''}
        />
      </div>

      <TextField
        label="Nummernserie"
        value={numberYear}
        onChange={(event) => set('numberYear', event.target.value)}
        inputMode="numeric"
        numeric
        hint={
          numberYear.trim() === ''
            ? 'Aus dieser Serie werden die Journalnummern gezogen.'
            : `Die Journalnummern dieses Jahres lauten ${numberYear.trim()}-000001, ${numberYear.trim()}-000002 …`
        }
      />

      {error !== '' && <ErrorNotice error={new Error(error)} />}
      {error === '' && warning !== '' && <WarningNotice>{warning}</WarningNotice>}

      {creating && following !== null && (
        <CheckboxField
          label={`Folgejahr ${following.label} gleich mit anlegen`}
          hint={`${formatDate(following.startDate)} – ${formatDate(following.endDate)}, Serie ${following.numberYear}`}
          checked={form.createFollowingYear}
          onChange={(event) => set('createFollowingYear', event.target.checked)}
        />
      )}
    </div>
  )
}
