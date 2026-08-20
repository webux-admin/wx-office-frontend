import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { CheckboxField } from '../../components/CheckboxField'
import { Button } from '../../components/Button'
import type { LayoutBlock, PrintoutColumn, PrintoutField } from '../../lib/types'
import { BLOCK_LABELS, isPlaced } from '../../printlayout/layout'

/**
 * What the selected block says and where it sits.
 *
 * <p>Only what the renderer can honour is offered: the fields come from the server, and the
 * look is a size, a weight, an alignment and a colour. A form is a description, not a
 * stylesheet.
 */
export function BlockProperties({
  block,
  fields,
  columns,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: LayoutBlock
  fields: PrintoutField[]
  columns: PrintoutColumn[]
  onChange: (block: LayoutBlock) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const set = (change: Partial<LayoutBlock>) => onChange({ ...block, ...change })
  const setStyle = (change: Partial<LayoutBlock['style']>) =>
    onChange({ ...block, style: { ...block.style, ...change } })

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{BLOCK_LABELS[block.type]}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
        >
          Entfernen
        </button>
      </div>

      {block.type === 'TEXT' && (
        <TextField
          label="Text"
          value={block.text ?? ''}
          maxLength={200}
          onChange={(event) => set({ text: event.target.value })}
        />
      )}

      {block.type === 'FIELD' && (
        <>
          <SelectField
            label="Feld"
            value={block.field ?? ''}
            onChange={(event) => set({ field: event.target.value })}
          >
            {fields.map((field) => (
              <option key={field.path} value={field.path}>
                {field.group}: {field.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Beschriftung davor"
            value={block.text ?? ''}
            maxLength={60}
            onChange={(event) => set({ text: event.target.value })}
            hint="Bleibt leer, wenn nur der Wert stehen soll."
          />
        </>
      )}

      {block.type === 'ADDRESS' && (
        <SelectField
          label="Wessen Adresse"
          value={block.field ?? 'recipient'}
          onChange={(event) => set({ field: event.target.value })}
        >
          <option value="recipient">Empfänger</option>
          <option value="issuer">Absender</option>
        </SelectField>
      )}

      {block.type === 'DOCUMENT_TEXT' && (
        <SelectField
          label="Welcher Text"
          value={block.field ?? 'header'}
          onChange={(event) => set({ field: event.target.value })}
        >
          <option value="header">Kopftext</option>
          <option value="footer">Fusstext</option>
        </SelectField>
      )}

      {block.type === 'IMAGE' && (
        <ImageField value={block.image} onChange={(image) => set({ image })} />
      )}

      {block.type === 'POSITIONS' && (
        <ColumnPicker
          columns={columns}
          chosen={block.columns}
          onChange={(chosen) => set({ columns: chosen })}
        />
      )}

      {isPlaced(block.type) && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Links (mm)" value={block.x} onChange={(x) => set({ x })} />
          <NumberField label="Oben (mm)" value={block.y} onChange={(y) => set({ y })} />
          <NumberField
            label="Breite (mm)"
            value={block.width}
            onChange={(width) => set({ width })}
          />
          <NumberField
            label="Höhe (mm)"
            value={block.height}
            onChange={(height) => set({ height })}
          />
        </div>
      )}

      {block.type !== 'LINE' && block.type !== 'IMAGE' && (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Schriftgrösse (pt)"
              value={block.style.fontSize}
              onChange={(fontSize) => setStyle({ fontSize })}
            />
            <SelectField
              label="Ausrichtung"
              value={block.style.align ?? 'left'}
              onChange={(event) =>
                setStyle({ align: event.target.value as LayoutBlock['style']['align'] })
              }
            >
              <option value="left">Links</option>
              <option value="center">Zentriert</option>
              <option value="right">Rechts</option>
            </SelectField>
          </div>
          <CheckboxField
            label="Fett"
            checked={block.style.bold}
            onChange={(event) => setStyle({ bold: event.target.checked })}
          />
          <TextField
            label="Farbe"
            value={block.style.colour ?? ''}
            maxLength={7}
            onChange={(event) => setStyle({ colour: event.target.value || undefined })}
            hint="Sechs Hexziffern mit Raute, zum Beispiel #444444. Leer heisst schwarz."
          />
        </div>
      )}

      {(onMoveUp || onMoveDown) && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onMoveUp} disabled={!onMoveUp}>
            Nach oben
          </Button>
          <Button variant="secondary" onClick={onMoveDown} disabled={!onMoveDown}>
            Nach unten
          </Button>
        </div>
      )}
    </div>
  )
}

/** Which columns the positions table shows, in the order they are ticked. */
function ColumnPicker({
  columns,
  chosen,
  onChange,
}: {
  columns: PrintoutColumn[]
  chosen: string[]
  onChange: (chosen: string[]) => void
}) {
  const toggle = (code: string) =>
    onChange(chosen.includes(code) ? chosen.filter((one) => one !== code) : [...chosen, code])

  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium">Spalten</span>
      <p className="text-[12px] text-text-tertiary">
        Ohne Auswahl zeigt die Tabelle die übliche Aufteilung.
      </p>
      {columns.map((column) => (
        <CheckboxField
          key={column.code}
          label={column.label}
          checked={chosen.includes(column.code)}
          onChange={() => toggle(column.code)}
        />
      ))}
    </div>
  )
}

/** The logo, kept in the form itself as a data URL. */
function ImageField({
  value,
  onChange,
}: {
  value?: string
  onChange: (image: string | undefined) => void
}) {
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-medium">Bild</span>
      <input
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Bild wählen"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const reader = new FileReader()
          reader.onload = () => onChange(String(reader.result))
          reader.readAsDataURL(file)
        }}
        className="text-[12px] text-text-secondary"
      />
      {value && (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="max-h-12 max-w-[120px] border border-line-subtle" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
          >
            Bild entfernen
          </button>
        </div>
      )}
    </div>
  )
}

/** A millimetre or point value; empty means "as much as the content needs". */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <TextField
      label={label}
      value={value === undefined ? '' : String(value)}
      inputMode="decimal"
      numeric
      onChange={(event) => {
        const raw = event.target.value.replace(',', '.')
        if (raw === '') return onChange(undefined)
        const parsed = Number(raw)
        if (!Number.isNaN(parsed)) onChange(parsed)
      }}
    />
  )
}
