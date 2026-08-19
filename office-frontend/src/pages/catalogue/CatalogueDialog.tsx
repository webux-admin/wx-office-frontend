import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { LabelFields } from '../../masterdata/LabelFields'
import type { CatalogueEntry } from '../../lib/types'
import type { CatalogueForm } from './catalogueForm'

/**
 * Changes how one fixed value is presented: its wording, its short form, its translations and
 * whether it is still offered.
 *
 * <p>There is no field for the code and none for the position. The code is part of the
 * application and steers logic, so it can neither be changed nor added to; the position is
 * moved with the arrows in the table.
 */
export function CatalogueDialog({
  open,
  onClose,
  onSubmit,
  tenantId,
  entry,
  form,
  onChange,
  busy,
  error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  tenantId: number
  /** The value being changed; absent while the dialog animates away. */
  entry: CatalogueEntry | null
  form: CatalogueForm
  onChange: (form: CatalogueForm) => void
  busy: boolean
  error: unknown
}) {
  const set = <K extends keyof CatalogueForm>(field: K, value: CatalogueForm[K]) =>
    onChange({ ...form, [field]: value })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Wert anpassen"
      description="Der Wert selbst gehört zur Anwendung. Anpassen lässt sich, wie er heisst und ob er noch angeboten wird."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={onSubmit} busy={busy} disabled={form.name.trim() === ''}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField
          label="Bezeichnung"
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={60}
          required
          hint="Was in Tabellen, Auswahllisten und auf dem Beleg steht."
        />
        <TextField
          label="Kurzform"
          value={form.shortName}
          onChange={(event) => set('shortName', event.target.value)}
          maxLength={10}
          hint="Für Tabellen und Belegzeilen. Leer lassen, wenn keine gebraucht wird."
        />

        <LabelFields
          tenantId={tenantId}
          translations={form.translations}
          onChange={(translations) => set('translations', translations)}
          disabled={busy}
        />

        <CheckboxField
          label="In neuen Auswahllisten anbieten"
          hint="Ohne Haken verschwindet der Wert nur aus neuen Auswahllisten: wo er schon gespeichert ist, behält er diese Bezeichnung und bleibt druckbar."
          checked={form.visible}
          onChange={(event) => set('visible', event.target.checked)}
        />

        <div className="border-t border-line-subtle pt-4">
          <p className="text-[12px] font-medium text-text-secondary">Code</p>
          <p className="mt-0.5 font-mono text-[12px] text-text-primary">{entry?.code ?? '-'}</p>
          <p className="mt-1 text-[12px] text-text-tertiary">
            In der Anwendung festgelegt, weil Abläufe und Belege darauf zeigen. Er lässt sich
            nicht ändern, und es kommt keiner dazu.
          </p>
        </div>

        {error !== null && error !== undefined && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}
