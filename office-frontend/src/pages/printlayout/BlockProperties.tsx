import { useState } from 'react'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { CheckboxField } from '../../components/CheckboxField'
import { Button } from '../../components/Button'
import type { LayoutBlock, LayoutColumn, PrintoutColumn, PrintoutField } from '../../lib/types'
import { BLOCK_LABELS, isPlaced } from '../../printlayout/layout'

/** Largest picture a form may hold, the same limit the backend refuses above. */
const MAX_IMAGE_BYTES = 512 * 1024

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

/**
 * Which columns the positions table shows, in which order, how wide and under which heading.
 *
 * <p>The order of the rows is the order on the paper. A width of nothing keeps the proposal
 * from the server; a width of zero lets the column take whatever the others leave over —
 * which exactly one column should do, usually the description.
 */
function ColumnPicker({
  columns,
  chosen,
  onChange,
}: {
  columns: PrintoutColumn[]
  chosen: LayoutColumn[]
  onChange: (chosen: LayoutColumn[]) => void
}) {
  const missing = columns.filter(
    (column) => !chosen.some((picked) => picked.code === column.code),
  )
  const proposalOf = (code: string) => columns.find((column) => column.code === code)

  const replace = (index: number, change: Partial<LayoutColumn>) =>
    onChange(
      chosen.map((column, position) =>
        position === index ? { ...column, ...change } : column,
      ),
    )

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= chosen.length) return
    const next = [...chosen]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <div className="grid gap-3">
      <span className="text-[13px] font-medium">Spalten</span>
      <p className="text-[12px] text-text-tertiary">
        Ohne Spalte zeigt die Tabelle die übliche Aufteilung. Breite leer heisst „wie
        vorgeschlagen", 0 heisst „nimmt den Rest".
      </p>

      {chosen.map((column, index) => (
        <div key={column.code} className="grid gap-2 border-t border-line-subtle pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">
              {index + 1}. {proposalOf(column.code)?.label ?? column.code}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                aria-label={`${column.code} nach oben`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="text-[12px] text-text-tertiary transition-colors hover:text-accent-text disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${column.code} nach unten`}
                disabled={index === chosen.length - 1}
                onClick={() => move(index, 1)}
                className="text-[12px] text-text-tertiary transition-colors hover:text-accent-text disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => onChange(chosen.filter((_, position) => position !== index))}
                className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
              >
                Entfernen
              </button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Breite (mm)"
              numeric
              inputMode="decimal"
              value={column.widthMm === undefined ? '' : String(column.widthMm)}
              onChange={(event) => {
                const raw = event.target.value.replace(',', '.')
                if (raw === '') return replace(index, { widthMm: undefined })
                const parsed = Number(raw)
                if (!Number.isNaN(parsed)) replace(index, { widthMm: parsed })
              }}
            />
            <TextField
              label="Überschrift"
              value={column.label ?? ''}
              maxLength={40}
              placeholder={proposalOf(column.code)?.label}
              onChange={(event) => replace(index, { label: event.target.value || undefined })}
            />
          </div>
        </div>
      ))}

      {missing.length > 0 && (
        <SelectField
          label="Spalte hinzufügen"
          value=""
          onChange={(event) => {
            if (event.target.value === '') return
            onChange([...chosen, { code: event.target.value }])
          }}
        >
          <option value="">Wählen ...</option>
          {missing.map((column) => (
            <option key={column.code} value={column.code}>
              {column.label}
            </option>
          ))}
        </SelectField>
      )}
    </div>
  )
}

/**
 * The logo, kept in the form itself as a data URL.
 *
 * <p>The picture travels with the form on every render, so it is kept small — and it is the
 * picture itself, never an address the server would have to fetch (ADR-0031).
 */
function ImageField({
  value,
  onChange,
}: {
  value?: string
  onChange: (image: string | undefined) => void
}) {
  const [tooLarge, setTooLarge] = useState(false)

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
          if (file.size > MAX_IMAGE_BYTES) {
            setTooLarge(true)
            event.target.value = ''
            return
          }
          setTooLarge(false)
          const reader = new FileReader()
          reader.onload = () => onChange(String(reader.result))
          reader.readAsDataURL(file)
        }}
        className="text-[12px] text-text-secondary"
      />
      {tooLarge && (
        <p role="alert" className="text-[12px] text-danger">
          Das Bild ist grösser als {MAX_IMAGE_BYTES / 1024} KB. Ein Logo braucht das nicht, und
          es reist mit jedem Ausdruck mit.
        </p>
      )}
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
