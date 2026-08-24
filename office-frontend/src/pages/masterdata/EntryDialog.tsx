import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import type { MasterDataEntry, MasterDataList } from '../../lib/types'
import { LabelFields } from '../../masterdata/LabelFields'
import { codeHintFor, type EntryForm } from './entryForm'

/**
 * Adds a value to a selection list, or renames one it already has.
 *
 * <p>The code is asked once and shown read-only afterwards: records point at the value by it,
 * and the backend refuses to change it for that reason.
 *
 * <p>The name is the text in the tenant's default language; the translations underneath are
 * what a document in another language prints.
 */
export function EntryDialog({
  tenantId,
  list,
  open,
  onClose,
  onSubmit,
  form,
  onChange,
  busy,
  error,
  editing,
}: {
  tenantId: number
  /** The list the value belongs to; it decides the code format and the language flag. */
  list: MasterDataList
  open: boolean
  onClose: () => void
  onSubmit: () => void
  form: EntryForm
  onChange: (form: EntryForm) => void
  busy: boolean
  error: unknown
  /** The value being changed; absent while a new one is added. */
  editing: MasterDataEntry | null
}) {
  const set = <K extends keyof EntryForm>(field: K, value: EntryForm[K]) =>
    onChange({ ...form, [field]: value })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Wert bearbeiten' : 'Neuer Wert'}
      onSubmit={busy || form.code.trim() === '' || form.name.trim() === '' ? undefined : onSubmit}
      description={
        editing?.system === true
          ? 'Ein ausgelieferter Wert lässt sich umbenennen, aber nicht löschen.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={onSubmit}
            busy={busy}
            disabled={form.code.trim() === '' || form.name.trim() === ''}
            shortcut
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField
          label="Code"
          value={form.code}
          onChange={(event) => set('code', event.target.value)}
          disabled={editing !== null}
          maxLength={30}
          hint={editing ? 'Steht fest, seit der Wert angelegt wurde.' : codeHintFor(list)}
        />
        <TextField
          label="Bezeichnung"
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={60}
          hint="Was in der Auswahlliste steht."
        />
        <TextField
          label="Kurzform"
          value={form.shortName}
          onChange={(event) => set('shortName', event.target.value)}
          maxLength={10}
          hint="Für Tabellen und Belegzeilen, zum Beispiel Stk."
        />
        <TextField
          label="Beschreibung"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          maxLength={200}
        />
        {/* Like the language flag below: the create endpoint does not take the rule, so the
            field appears only where a typed value actually reaches the record. */}
        {list === 'units' && editing !== null && (
          <TextField
            label="Nachkommastellen"
            value={form.decimalPlaces}
            onChange={(event) => set('decimalPlaces', event.target.value)}
            inputMode="numeric"
            maxLength={1}
            hint="Leer heisst: beliebig viele. 0 heisst: nur ganze Zahlen, zum Beispiel Stück."
          />
        )}
        {list === 'languages' && editing !== null && (
          <CheckboxField
            label="Belege in dieser Sprache"
            hint="Nur mit diesem Haken lassen sich Belege in der Sprache ausstellen."
            checked={form.documentLanguage}
            onChange={(event) => set('documentLanguage', event.target.checked)}
          />
        )}
        <LabelFields
          tenantId={tenantId}
          translations={form.translations}
          onChange={(translations) => set('translations', translations)}
        />

        {error !== null && error !== undefined && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}
