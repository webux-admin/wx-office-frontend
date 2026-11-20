import { X } from 'lucide-react'
import { CheckboxField } from '../../components/CheckboxField'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { usePrintLayouts } from '../../printlayout/usePrintLayouts'
import {
  MAX_COPIES,
  MAX_SHEETS,
  nextCopyRow,
  withMovedCopy,
  type CopyRow,
} from './documentTypeForm'

/**
 * How often a kind of document is printed, what each copy is called and which form it uses.
 *
 * <p>The order of the rows is the order in the PDF, so the first row is the original.
 *
 * <p>What is set here is the default a document of this kind starts with. A draft may change
 * it afterwards, and issuing the document freezes it — a later change here leaves documents
 * that already exist alone.
 *
 * @param tenantId the tenant, for the forms to choose from
 * @param copies the rows in printing order
 * @param onChange called with the new order or the new values
 * @param disabled true where the user may look but not write
 */
export function CopyEditor({
  tenantId,
  copies,
  onChange,
  disabled = false,
}: {
  tenantId: number
  copies: CopyRow[]
  onChange: (copies: CopyRow[]) => void
  disabled?: boolean
}) {
  const { can } = useAuth()
  // Asked only where the right is there: a user without PRINT_LAYOUT_READ keeps what is
  // stored, and asking anyway would be a 403.
  const mayReadLayouts = can('PRINT_LAYOUT_READ')
  const layouts = usePrintLayouts(mayReadLayouts ? tenantId : null)
  const forms = layouts.data ?? []

  const replace = (index: number, patch: Partial<CopyRow>) =>
    onChange(copies.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  return (
    <Panel
      title="Ausfertigungen"
      description="Was beim Drucken herauskommt, in dieser Reihenfolge. Die erste ist das Original. Ein Beleg kann jede Ausfertigung noch anpassen."
    >
      <div className="grid gap-3">
        {copies.length === 0 && (
          <p className="text-body text-text-secondary">
            Keine Ausfertigung: Belege dieser Art werden nicht gedruckt. Als PDF ansehen lassen
            sie sich trotzdem.
          </p>
        )}

        {copies.map((row, index) => {
          const name = `${index + 1}. Ausfertigung`
          return (
            <div key={index} className="rounded-[var(--radius-md)] border border-line-subtle p-3">
              <div className="flex items-center justify-between gap-3 pb-2.5">
                <span className="text-small font-medium text-text-secondary">
                  {index === 0 ? `${name} · Original` : name}
                </span>
                <span className="flex items-center gap-1">
                  <RowOrderButtons
                    name={name}
                    upDisabled={disabled || index === 0}
                    downDisabled={disabled || index === copies.length - 1}
                    onUp={() => onChange(withMovedCopy(copies, index, -1))}
                    onDown={() => onChange(withMovedCopy(copies, index, 1))}
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${name} entfernen`}
                    onClick={() => onChange(copies.filter((_, position) => position !== index))}
                    className="grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-danger disabled:opacity-40"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[2fr_90px] lg:grid-cols-[2fr_90px_2fr]">
                <TextField
                  label="Beschriftung"
                  value={row.label}
                  maxLength={60}
                  disabled={disabled}
                  onChange={(event) => replace(index, { label: event.target.value })}
                  tooltip="Steht auf dem Blatt, zum Beispiel Original, Kopie oder Buchhaltung."
                />
                <TextField
                  label="Anzahl"
                  value={row.copies}
                  inputMode="numeric"
                  numeric
                  maxLength={2}
                  disabled={disabled}
                  onChange={(event) => replace(index, { copies: event.target.value })}
                  tooltip={`Wie viele Blätter dieser Ausfertigung, 1 bis ${MAX_SHEETS}.`}
                />
                {mayReadLayouts ? (
                  <SelectField
                    label="Druckvorlage"
                    value={row.documentLayoutId}
                    disabled={disabled || layouts.isPending}
                    onChange={(event) =>
                      replace(index, { documentLayoutId: event.target.value })
                    }
                    className="sm:col-span-2 lg:col-span-1"
                    tooltip="Eine eigene Vorlage nur für diese Ausfertigung, zum Beispiel eine Lagerkopie ohne Preise. «Wie der Beleg» nimmt die Vorlage oben."
                  >
                    <option value="">Wie der Beleg</option>
                    {forms
                      .filter((form) => form.active || `${form.id}` === row.documentLayoutId)
                      .map((form) => (
                        <option key={form.id} value={form.id}>
                          {form.active ? form.name : `${form.name} (deaktiviert)`}
                        </option>
                      ))}
                  </SelectField>
                ) : (
                  <p className="text-small text-text-tertiary sm:col-span-2 lg:col-span-1">
                    Die Vorlage bleibt, wie sie ist. Zum Ändern brauchen Sie das Recht,
                    Druckvorlagen zu sehen.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <CheckboxField
                  label="Nur intern"
                  checked={row.internal}
                  disabled={disabled}
                  onChange={(event) => replace(index, { internal: event.target.checked })}
                  tooltip="Wird gedruckt, geht aber nie per Mail an den Kunden."
                />
              </div>
            </div>
          )
        })}

        <div className="flex items-center justify-between">
          {copies.length < MAX_COPIES ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([...copies, nextCopyRow(copies.length)])}
              className="text-small text-text-secondary transition-colors hover:text-accent-text disabled:opacity-40"
            >
              + Ausfertigung
            </button>
          ) : (
            <span className="text-small text-text-tertiary">
              Mehr als {MAX_COPIES} Ausfertigungen gehen nicht.
            </span>
          )}
          <span className="text-small text-text-tertiary">
            {copies.length} von {MAX_COPIES}
          </span>
        </div>
      </div>
    </Panel>
  )
}
