import { Plus, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { TextField } from '../../components/TextField'
import type { Printer } from '../../lib/types'
import { MAX_TRAYS, nextTrayRow, withMovedTray, type PrinterForm, type TrayRow } from './printerForm'

/**
 * Adds a printer or changes one the tenant already has.
 *
 * <p>The trays are maintained here rather than on a screen of their own: a tray belongs to one
 * printer, and both are written in one request.
 *
 * <p>What the mask stores is a note, never a command. No web API lets a page choose the device
 * a sheet comes out of, so a printer here is a name a person recognises, not an address
 * (ADR-0009).
 *
 * @param open whether the box is on screen
 * @param onClose called when it is dismissed
 * @param onSubmit called when the mask is to be saved
 * @param form the mask as it stands
 * @param onChange called with the changed mask
 * @param busy whether the request is on its way
 * @param error what went wrong, `null` while nothing did
 * @param editing the printer being changed; absent while a new one is added
 */
export function PrinterDialog({
  open,
  onClose,
  onSubmit,
  form,
  onChange,
  busy,
  error,
  editing,
}: {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  form: PrinterForm
  onChange: (form: PrinterForm) => void
  busy: boolean
  error: unknown
  editing: Printer | null
}) {
  const set = <K extends keyof PrinterForm>(field: K, value: PrinterForm[K]) =>
    onChange({ ...form, [field]: value })

  const setTray = (index: number, patch: Partial<TrayRow>) =>
    set(
      'trays',
      form.trays.map((tray, position) => (position === index ? { ...tray, ...patch } : tray)),
    )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Drucker bearbeiten' : 'Neuer Drucker'}
      description="Bezeichnung und Standort helfen beim Wählen im Druckdialog. Gesteuert wird von hier aus nichts."
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Code"
            value={form.code}
            onChange={(event) => set('code', event.target.value)}
            disabled={editing !== null}
            maxLength={20}
            hint={
              editing
                ? 'Steht fest, seit der Drucker angelegt wurde.'
                : 'Kurzzeichen, wird in Grossbuchstaben gespeichert. Später nicht mehr änderbar.'
            }
          />
          <TextField
            label="Bezeichnung"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            maxLength={60}
            hint="Was in der Auswahl und neben dem Druckdialog steht."
          />
        </div>

        <TextField
          label="Standort"
          value={form.location}
          onChange={(event) => set('location', event.target.value)}
          maxLength={100}
          hint="Wo das Gerät steht, zum Beispiel «2. OG, neben der Teeküche»."
        />

        {editing !== null && (
          <CheckboxField
            label="Kann gewählt werden"
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
            hint="Abgewählt verschwindet der Drucker aus den Auswahllisten. Belege, die schon auf ihn zeigen, behalten ihn."
          />
        )}

        <fieldset className="border-t border-line-subtle pt-4">
          <legend className="text-[12px] font-medium text-text-secondary">Schächte</legend>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Nur nötig, wenn das Gerät mehrere hat. Ohne Eintrag steht bei einer Ausfertigung kein
            Schacht zur Wahl.
          </p>

          <div className="mt-3 grid gap-3">
            {form.trays.map((tray, index) => (
              <div key={index} className="flex items-end gap-3">
                <span className="pb-2.5">
                  <RowOrderButtons
                    name={tray.name.trim() === '' ? `${index + 1}. Schacht` : tray.name}
                    upDisabled={index === 0}
                    downDisabled={index === form.trays.length - 1}
                    onUp={() => set('trays', withMovedTray(form.trays, index, -1))}
                    onDown={() => set('trays', withMovedTray(form.trays, index, 1))}
                  />
                </span>
                <TextField
                  label="Code"
                  value={tray.code}
                  onChange={(event) => setTray(index, { code: event.target.value })}
                  maxLength={20}
                  className="w-[110px] shrink-0"
                />
                <TextField
                  label="Bezeichnung"
                  value={tray.name}
                  onChange={(event) => setTray(index, { name: event.target.value })}
                  maxLength={60}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'trays',
                      form.trays.filter((_, position) => position !== index),
                    )
                  }
                  aria-label={`${index + 1}. Schacht entfernen`}
                  className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-danger"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => set('trays', [...form.trays, nextTrayRow(form.trays.length)])}
              disabled={form.trays.length >= MAX_TRAYS}
            >
              <Plus size={15} aria-hidden />
              Schacht hinzufügen
            </Button>
          </div>

          {/* A dead control has to say why: a disabled button leaves the tab order, and
              without this sentence a reader would not learn that there is a limit at all. */}
          {form.trays.length >= MAX_TRAYS && (
            <p className="mt-2 text-[12px] text-text-tertiary" aria-live="polite">
              Mehr als {MAX_TRAYS} Schächte sind nicht möglich.
            </p>
          )}
        </fieldset>

        {error !== null && error !== undefined && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}
