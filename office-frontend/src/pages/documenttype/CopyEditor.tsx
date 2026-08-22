import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import type { Printer } from '../../lib/types'
import { selectablePrinters, traysOf } from '../document/printoutForm'
import {
  MAX_COPIES,
  MAX_SHEETS,
  nextCopyRow,
  withMovedCopy,
  type CopyRow,
} from './documentTypeForm'

/**
 * How often a kind of document is printed, what each copy is called and where it is meant to
 * go.
 *
 * <p>The order of the rows is the order in the PDF, so the first row is the original. Moving a
 * row is the way to reorder the print, because the position follows from the row.
 *
 * <p>What is set here is the default a document of this kind starts with. A draft may change
 * it afterwards, and issuing the document freezes it — a later change here leaves documents
 * that already exist alone.
 *
 * @param tenantId the tenant, for the printers to choose from
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
  const mayReadPrinters = can('PRINTER_READ')

  const printers = useQuery({
    queryKey: ['printers', tenantId],
    queryFn: () => api.get<Printer[]>(`/api/tenants/${tenantId}/printers`),
    enabled: mayReadPrinters,
  })
  const devices = printers.data ?? []

  const replace = (index: number, patch: Partial<CopyRow>) =>
    onChange(copies.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  return (
    <Panel
      title="Ausfertigungen"
      description="Wie viele Exemplare beim Drucken herauskommen, wie sie beschriftet sind und auf welchem Drucker sie gedacht sind. Ohne Eintrag kommt ein Exemplar ohne Beschriftung. Das Archiv behält immer genau ein Original."
    >
      <div className="grid gap-3">
        {copies.length === 0 && (
          <p className="text-[13px] text-text-secondary">Ein Exemplar ohne Beschriftung.</p>
        )}

        {copies.map((row, index) => {
          const name = `${index + 1}. Ausfertigung`
          const trays = traysOf(devices, row.printerId === '' ? undefined : Number(row.printerId))
          return (
            <div key={index} className="rounded-[var(--radius-md)] border border-line-subtle p-3">
              <div className="flex items-center justify-between gap-3 pb-2.5">
                <span className="text-[12px] font-medium text-text-secondary">{name}</span>
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_90px_2fr_2fr]">
                <TextField
                  label="Beschriftung"
                  value={row.label}
                  maxLength={60}
                  disabled={disabled}
                  onChange={(event) => replace(index, { label: event.target.value })}
                />
                <TextField
                  label="Anzahl"
                  value={row.copies}
                  inputMode="numeric"
                  numeric
                  maxLength={2}
                  disabled={disabled}
                  onChange={(event) => replace(index, { copies: event.target.value })}
                />

                {mayReadPrinters ? (
                  <>
                    <SelectField
                      label="Drucker"
                      value={row.printerId}
                      disabled={disabled}
                      onChange={(event) =>
                        // A tray belongs to one printer and cannot survive a change of it.
                        replace(index, { printerId: event.target.value, trayId: '' })
                      }
                    >
                      <option value="">Kein Drucker</option>
                      {selectablePrinters(
                        devices,
                        row.printerId === '' ? undefined : Number(row.printerId),
                      ).map((printer) => (
                        <option key={printer.id} value={printer.id}>
                          {printer.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Schacht"
                      value={row.trayId}
                      disabled={disabled || trays.length === 0}
                      onChange={(event) => replace(index, { trayId: event.target.value })}
                      hint={
                        row.printerId === ''
                          ? 'Erst den Drucker wählen.'
                          : trays.length === 0
                            ? 'Dieser Drucker hat nur einen Schacht.'
                            : undefined
                      }
                    >
                      <option value="">Kein Schacht</option>
                      {trays.map((tray) => (
                        <option key={tray.id} value={tray.id}>
                          {tray.name}
                        </option>
                      ))}
                    </SelectField>
                  </>
                ) : (
                  <p className="text-[12px] text-text-tertiary sm:col-span-2">
                    Drucker und Schacht bleiben, wie sie hinterlegt sind. Zum Ändern fehlt das
                    Recht PRINTER_READ.
                  </p>
                )}
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

        <p className="text-[12px] text-text-tertiary">
          Höchstens {MAX_SHEETS} Exemplare je Ausfertigung. Gedruckt wird über den Druckdialog des
          Browsers: Drucker und Schacht werden dort angezeigt, gewählt werden sie von Hand.
        </p>
      </div>
    </Panel>
  )
}
