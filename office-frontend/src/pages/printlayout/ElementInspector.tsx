import { AlertTriangle, ChevronDown, Search } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { CheckboxField } from '../../components/CheckboxField'
import { FileDropField } from '../../components/FileDropField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import type { LayoutElement, LayoutRepeat, LayoutStyle, PrintLayoutFields } from '../../lib/types'
import {
  ELEMENT_LABELS,
  fieldByPath,
  labelOfElement,
  searchFields,
  UNKNOWN_FIELD_LABEL,
} from '../../printlayout/catalogue'
import { relocateElement } from '../../printlayout/commands'
import {
  containerOf,
  DEFAULT_LINE_COLOUR,
  DEFAULT_LINE_WIDTH,
  elementAt,
  elementRectOf,
  IMAGE_TYPES,
  isVerticalLine,
  lineBoxFor,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  MAX_IMAGE_BYTES,
  MAX_TEXT_LENGTH,
  repeatOf,
  updateElement,
  type ObjectKey,
  type ObjectRef,
} from '../../printlayout/definition'
import { MIN_ELEMENT_SIZE } from '../../printlayout/geometry'
import { firstMessageFor } from '../../printlayout/validation'
import { InspectorHeader, ProblemNotes, type InspectorContext } from './InspectorParts'
import { ColourField, Group, MeasureField, StyleFields } from './InspectorControls'

type ElementInspectorProps = InspectorContext & {
  objectKey: ObjectKey
  target: Exclude<ObjectRef, { kind: 'section' }>
  element: LayoutElement
  /** Builds the buttons at the right of the heading. */
  actions: (name: string) => ReactNode
}

/** What each kind of element is, in a sentence, for the head of the inspector. */
const DESCRIPTIONS: Record<LayoutElement['type'], string> = {
  TEXT: 'Ein fester Text, auf jedem Beleg gleich.',
  FIELD: 'Druckt einen Wert des Belegs. Auf dem Blatt steht der Wert des Beispielbelegs.',
  IMAGE: 'Ihr Logo oder ein anderes Bild.',
  LINE: 'Eine Trennlinie.',
  ADDRESS: 'Die Anschrift als Block, Zeile für Zeile.',
  PAGE_NUMBER: 'Druckt «Seite 1 von 3» — immer auf jeder Seite.',
}

/**
 * The settings of one placed element: what it shows, where it sits to the millimetre, how its
 * text looks, and whether it is fixed on the paper or moves with the content.
 */
export function ElementInspector({
  objectKey,
  target,
  element,
  actions,
  definition,
  catalogue,
  problems,
  sheet,
  onChange,
  onRun,
}: ElementInspectorProps) {
  const name = labelOfElement(element, catalogue)
  const container = containerOf(definition, target)
  const rect = elementRectOf(element, container)
  const frame = container.frame
  const onPage = target.kind === 'element'
  const isLine = element.type === 'LINE'
  const vertical = isLine && isVerticalLine(element)
  const hasText = element.type !== 'IMAGE' && !isLine

  const change = (
    patch: Partial<Omit<LayoutElement, 'style'>> & { style?: Partial<LayoutStyle> },
    mergeKey?: string,
  ) =>
    onChange(
      updateElement(definition, target, patch),
      mergeKey === undefined ? undefined : `${mergeKey}:${objectKey}`,
    )

  // Reading a file takes a moment, and the form may have changed in it. The picture is put
  // on the form as it is then, not on the one this inspector was drawn from — and only if
  // the element it was chosen for is still an image at this place.
  const setImage = (image: string | null) =>
    onRun((snapshot) => {
      const now = elementAt(snapshot.definition, objectKey)
      if (now === undefined || now.type !== 'IMAGE') {
        return {
          ...snapshot,
          announcement: 'Das Bild wurde nicht übernommen: das Element gibt es nicht mehr.',
        }
      }
      return {
        definition: updateElement(snapshot.definition, objectKey, { image }),
        selection: snapshot.selection,
        announcement: image === null ? 'Bild entfernt.' : 'Bild übernommen.',
      }
    })

  const toContent = () =>
    onRun((snapshot) =>
      relocateElement(
        snapshot,
        objectKey,
        {
          kind: 'flow',
          index: snapshot.definition.flow.sections.length,
          x: element.x - snapshot.definition.page.marginLeft,
        },
        catalogue,
        sheet.current?.heightOf(objectKey),
      ),
    )
  const toPage = () =>
    onRun((snapshot) => {
      if (target.kind !== 'child') return null
      const top = sheet.current?.sectionTop(target.section) ?? snapshot.definition.flow.top
      return relocateElement(
        snapshot,
        objectKey,
        { kind: 'page', x: snapshot.definition.page.marginLeft + element.x, y: top + element.y },
        catalogue,
      )
    })

  return (
    <>
      <InspectorHeader title={name} actions={actions(name)}>
        {element.type === 'FIELD' ? `${ELEMENT_LABELS.FIELD}. ` : ''}
        {DESCRIPTIONS[element.type]}
      </InspectorHeader>
      <ProblemNotes
        problems={problems}
        target={objectKey}
        except={['fontSize', 'lineWidth', 'colour']}
      />

      {element.type !== 'LINE' && element.type !== 'PAGE_NUMBER' && (
        <Group title="Inhalt">
          <ContentFields
            element={element}
            catalogue={catalogue}
            onChange={change}
            onImage={setImage}
          />
        </Group>
      )}

      <Group title="Position und Grösse">
        <div className="grid grid-cols-2 gap-3">
          <MeasureField
            label={onPage ? 'X — von links' : 'X — vom linken Rand'}
            value={element.x}
            min={0}
            max={frame.width}
            onCommit={(x) => change({ x }, 'x')}
          />
          <MeasureField
            label={onPage ? 'Y — von oben' : 'Y — im Bereich'}
            value={element.y}
            min={0}
            max={frame.height}
            onCommit={(y) => change({ y }, 'y')}
          />
          {isLine ? (
            <MeasureField
              label="Länge"
              value={vertical ? rect.height : rect.width}
              min={MIN_ELEMENT_SIZE}
              max={vertical ? frame.height : frame.width}
              disabled={!vertical && element.width === null}
              onCommit={(length) => change(lineBoxFor(vertical, length), 'length')}
            />
          ) : (
            <>
              <MeasureField
                label="Breite"
                value={rect.width}
                min={1}
                max={frame.width}
                disabled={element.width === null}
                onCommit={(width) => change({ width }, 'width')}
              />
              <MeasureField
                label="Höhe"
                value={rect.height}
                min={1}
                max={frame.height}
                disabled={element.height === null}
                onCommit={(height) => change({ height }, 'height')}
              />
            </>
          )}
        </div>

        {isLine && (
          <SegmentedControl
            label="Richtung"
            value={vertical ? 'vertical' : 'horizontal'}
            onChange={(direction) =>
              change(
                lineBoxFor(
                  direction === 'vertical',
                  direction === 'vertical' ? Math.min(rect.width, 50) : rect.height,
                ),
              )
            }
            options={[
              { value: 'horizontal', label: 'Waagrecht' },
              { value: 'vertical', label: 'Senkrecht' },
            ]}
          />
        )}
        {!vertical && (
          <CheckboxField
            label={isLine ? 'Bis zum rechten Rand' : 'Breite bis zum rechten Rand'}
            checked={element.width === null}
            onChange={(event) => change({ width: event.target.checked ? null : rect.width })}
            tooltip="Reicht immer bis zum Rand rechts — auch wenn Sie später das Papier oder den Rand ändern."
          />
        )}
        {!isLine && (
          <CheckboxField
            label="Höhe nach Inhalt"
            checked={element.height === null}
            onChange={(event) =>
              change({
                height: event.target.checked
                  ? null
                  : (sheet.current?.heightOf(objectKey) ?? rect.height),
              })
            }
            tooltip="So hoch wie das, was gedruckt wird. Eine längere Adresse braucht dann einfach mehr Platz."
          />
        )}
      </Group>

      {hasText && (
        <Group title="Schrift">
          <StyleFields
            style={element.style}
            align="left"
            onChange={(style) => change({ style }, 'style')}
            error={firstMessageFor(problems, objectKey, 'fontSize')}
          />
        </Group>
      )}

      {isLine && (
        <Group title="Linie">
          <MeasureField
            label="Stärke"
            unit="pt"
            value={element.style.lineWidth ?? DEFAULT_LINE_WIDTH}
            min={LINE_WIDTH_MIN}
            max={LINE_WIDTH_MAX}
            step={0.1}
            onCommit={(lineWidth) => change({ style: { lineWidth } }, 'line-width')}
            error={firstMessageFor(problems, objectKey, 'lineWidth')}
          />
          <ColourField
            value={element.style.colour}
            fallback={DEFAULT_LINE_COLOUR}
            onChange={(colour) => change({ style: { colour } }, 'colour')}
          />
        </Group>
      )}

      {element.type !== 'PAGE_NUMBER' && (
        <Group title="Platzierung">
          <SegmentedControl
            label="Verhalten"
            value={onPage ? 'fixed' : 'content'}
            onChange={(placement) => (placement === 'content' ? toContent() : toPage())}
            options={[
              { value: 'fixed', label: 'Fest auf dem Blatt' },
              { value: 'content', label: 'Im Inhalt' },
            ]}
          />
          <p className="text-small text-text-secondary">
            {onPage
              ? 'Steht immer an derselben Stelle der Seite, egal wie lang der Beleg wird.'
              : 'Liegt in einem freien Bereich und rutscht mit dem Inhalt nach unten, wenn der Beleg länger wird.'}
          </p>
          {onPage && (
            <SegmentedControl<LayoutRepeat>
              label="Erscheint auf"
              value={repeatOf(element)}
              onChange={(repeat) => change({ repeat })}
              options={[
                { value: 'FIRST_PAGE', label: 'Nur Seite 1' },
                { value: 'EVERY_PAGE', label: 'Jeder Seite' },
              ]}
            />
          )}
        </Group>
      )}
    </>
  )
}

function ContentFields({
  element,
  catalogue,
  onChange,
  onImage,
}: {
  element: LayoutElement
  catalogue: PrintLayoutFields
  onChange: (patch: Partial<Omit<LayoutElement, 'style'>>, mergeKey?: string) => void
  onImage: (image: string | null) => void
}) {
  if (element.type === 'TEXT') {
    return (
      <TextAreaField
        label="Text"
        rows={3}
        maxLength={MAX_TEXT_LENGTH}
        value={element.text ?? ''}
        onChange={(event) => onChange({ text: event.target.value }, 'text')}
      />
    )
  }
  if (element.type === 'FIELD') {
    return (
      <>
        <FieldPicker
          catalogue={catalogue}
          value={element.field}
          onPick={(field) => onChange({ field })}
        />
        <TextField
          label="Beschriftung davor"
          value={element.text ?? ''}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="zum Beispiel «Kundennummer:»"
          onChange={(event) =>
            onChange({ text: event.target.value === '' ? null : event.target.value }, 'label')
          }
          tooltip="Steht vor dem Wert auf derselben Zeile. Leer lassen, wenn nur der Wert gedruckt werden soll."
        />
      </>
    )
  }
  if (element.type === 'ADDRESS') {
    return (
      <SegmentedControl
        label="Wessen Adresse"
        value={element.field === 'issuer' ? 'issuer' : 'recipient'}
        onChange={(field) => onChange({ field })}
        options={[
          { value: 'recipient', label: 'Empfänger' },
          { value: 'issuer', label: 'Absender' },
        ]}
      />
    )
  }
  return <ImageContent image={element.image} onImage={onImage} />
}

function ImageContent({
  image,
  onImage,
}: {
  image: string | null
  onImage: (image: string | null) => void
}) {
  const [complaint, setComplaint] = useState<string | undefined>(undefined)

  const take = (file: File | null) => {
    if (file === null) return
    if (!IMAGE_TYPES.includes(file.type)) {
      setComplaint('Bitte ein Bild als PNG, JPEG, GIF oder WebP wählen.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setComplaint('Das Bild ist grösser als 500 KB. Bitte kleiner speichern und nochmals wählen.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setComplaint(undefined)
      onImage(reader.result)
    }
    reader.onerror = () => setComplaint('Die Datei konnte nicht gelesen werden.')
    reader.readAsDataURL(file)
  }

  return (
    <>
      {image !== null && (
        <div className="flex items-center gap-3">
          <span className="grid h-16 w-24 shrink-0 place-items-center rounded-[var(--radius-md)] border border-line bg-paper p-1">
            <img src={image} alt="Aktuelles Bild" className="max-h-full max-w-full" />
          </span>
          <button
            type="button"
            onClick={() => onImage(null)}
            className="text-small text-text-secondary underline underline-offset-2 transition-colors hover:text-danger"
          >
            Bild entfernen
          </button>
        </div>
      )}
      <FileDropField
        label={image === null ? 'Bild wählen oder hierher ziehen' : 'Anderes Bild wählen'}
        accept={IMAGE_TYPES.join(',')}
        hint="PNG, JPEG, GIF oder WebP, höchstens 500 KB"
        onSelect={take}
        error={complaint}
      />
    </>
  )
}

/**
 * Chooses the field an element is bound to.
 *
 * <p>The button shows what is chosen with its sample value; opened, it is the same searchable
 * list as the «Felder» register, so a field is found by its name or by what it prints.
 */
function FieldPicker({
  catalogue,
  value,
  onPick,
}: {
  catalogue: PrintLayoutFields
  value: string | null
  onPick: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const panelId = useId()
  const current = fieldByPath(catalogue, value)
  const groups = searchFields(catalogue.fields, term)

  return (
    <div>
      <span className="mb-1.5 block text-small font-medium text-text-secondary">Feld</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className={`flex min-h-control w-full items-center gap-2 rounded-[var(--radius-md)] border bg-surface px-3 py-1.5 text-left transition-colors ${
          current === undefined ? 'border-warning' : 'border-line hover:border-text-tertiary'
        }`}
      >
        <span className="min-w-0 flex-1">
          {current === undefined ? (
            <span className="flex items-center gap-1.5 text-control text-warning">
              <AlertTriangle size={14} aria-hidden />
              {UNKNOWN_FIELD_LABEL}
              {value !== null && (
                <span className="truncate font-mono text-small text-text-tertiary">{value}</span>
              )}
            </span>
          ) : (
            <>
              <span className="block truncate text-control text-text-primary">{current.label}</span>
              <span className="block truncate text-small text-text-secondary">
                {current.group} · {current.sample === '' ? 'ohne Beispielwert' : current.sample}
              </span>
            </>
          )}
        </span>
        <ChevronDown size={15} aria-hidden className="shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 grid grid-cols-1 gap-2 rounded-[var(--radius-md)] border border-line bg-sunken/50 p-2"
        >
          <TextField
            label="Feld suchen"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            icon={<Search size={15} />}
            placeholder="Name oder Beispielwert"
          />
          <div className="max-h-64 overflow-y-auto">
            {groups.length === 0 && (
              <p className="px-2 py-3 text-center text-small text-text-secondary">
                Kein Feld gefunden.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.group} className="mb-2">
                <p className="text-overline px-2 py-1 text-text-tertiary">{group.group}</p>
                <ul>
                  {group.fields.map((field) => (
                    <li key={field.path}>
                      <button
                        type="button"
                        aria-current={field.path === value ? 'true' : undefined}
                        onClick={() => {
                          onPick(field.path)
                          setOpen(false)
                          setTerm('')
                        }}
                        className={`flex w-full items-baseline gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-surface ${
                          field.path === value ? 'bg-accent/10' : ''
                        }`}
                      >
                        <span className="shrink-0 text-body text-text-primary">{field.label}</span>
                        <span className="min-w-0 truncate text-small text-text-secondary">
                          {field.sample}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
