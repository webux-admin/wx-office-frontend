import { Copy, Trash2 } from 'lucide-react'
import { IconButton } from '../../components/IconButton'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SelectField } from '../../components/SelectField'
import type {
  LayoutPage,
  PaperFormat,
  PaymentPartPlacement,
} from '../../lib/types'
import {
  elementAt,
  refOf,
  sectionAt,
  setFlowTop,
  setPage,
  type ObjectKey,
} from '../../printlayout/definition'
import {
  allowsPaymentPartAtBottom,
  CUSTOM_SIDE_MAX,
  CUSTOM_SIDE_MIN,
  MIN_FLOW_HEIGHT,
  paperSizeOf,
} from '../../printlayout/paper'
import { formatLengthShort } from '../../printlayout/units'
import { firstMessageFor, type ProblemField } from '../../printlayout/validation'
import { ElementInspector } from './ElementInspector'
import { ChoiceList, Group, MeasureField } from './InspectorControls'
import { InspectorHeader, ProblemNotes, type InspectorContext } from './InspectorParts'
import { SectionInspector } from './SectionInspector'

type InspectorProps = InspectorContext & {
  selection: readonly ObjectKey[]
  onMoveSection: (index: number, direction: -1 | 1) => void
  /** Copies the selection; the designer puts the keyboard on the copy afterwards. */
  onDuplicate: () => void
  /** Removes the selection; the designer puts the keyboard back on the sheet afterwards. */
  onRemove: () => void
}

/**
 * The right pane: the settings of whatever is selected, and of the sheet while nothing is.
 *
 * <p>The main tool of the designer. Everything the pointer can do on the sheet can be typed
 * here as a number, which is both the precise way and the way that needs no dragging.
 */
export function Inspector({
  selection,
  onMoveSection,
  onDuplicate,
  onRemove,
  ...context
}: InspectorProps) {
  const { definition } = context

  if (selection.length === 0) return <PageInspector {...context} />

  const actions = (name: string) => (
    <>
      <IconButton label={`${name} duplizieren`} onClick={onDuplicate}>
        <Copy size={15} aria-hidden />
      </IconButton>
      <IconButton label={`${name} löschen`} tone="danger" onClick={onRemove}>
        <Trash2 size={15} aria-hidden />
      </IconButton>
    </>
  )

  if (selection.length > 1) {
    return (
      <InspectorHeader title={`${selection.length} Elemente`} actions={actions('Auswahl')}>
        Gemeinsam verschieben: ziehen oder mit den Pfeiltasten. Für die Einstellungen ein
        einzelnes Element wählen.
      </InspectorHeader>
    )
  }

  const key = selection[0]
  const ref = refOf(key)
  const element = elementAt(definition, key)
  if (element !== undefined && ref !== null && ref.kind !== 'section') {
    return (
      <ElementInspector
        // One inspector per object: a field that still holds something typed for another
        // element must not live on under this one.
        key={key}
        {...context}
        objectKey={key}
        target={ref}
        element={element}
        actions={actions}
      />
    )
  }
  const section = sectionAt(definition, key)
  if (section !== undefined && ref !== null && ref.kind === 'section') {
    return (
      <SectionInspector
        key={key}
        {...context}
        objectKey={key}
        index={ref.index}
        section={section}
        actions={actions}
        onMoveSection={onMoveSection}
      />
    )
  }
  return <PageInspector {...context} />
}

const PAGE_FIELDS: readonly ProblemField[] = [
  'customWidth',
  'customHeight',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'flowTop',
  'paymentPart',
]

function PageInspector({ definition, catalogue, problems, onChange }: InspectorContext) {
  const { page, flow } = definition
  const paper = paperSizeOf(page)
  const error = (field: ProblemField) => firstMessageFor(problems, 'page', field)
  const formats: PaperFormat[] = [...catalogue.formats.map((format) => format.code), 'CUSTOM']

  const changePage = (change: Partial<LayoutPage>, mergeKey?: string) => {
    const next = setPage(definition, change)
    const moved = definition.paymentPart === 'LAST_PAGE_BOTTOM' && next.paymentPart === 'OWN_PAGE'
    onChange(
      next,
      mergeKey,
      moved
        ? 'Auf diesem Papier steht der QR-Zahlteil auf einer eigenen Seite.'
        : undefined,
    )
  }

  const bottomAllowed = allowsPaymentPartAtBottom(page)

  return (
    <>
      <InspectorHeader title="Blatt">
        Papier, Ränder und wo der Inhalt beginnt. Für die Einstellungen eines Elements klicken
        Sie es auf dem Blatt an.
      </InspectorHeader>
      <ProblemNotes problems={problems} target="page" except={PAGE_FIELDS} />

      <Group title="Papier">
        <SelectField
          label="Papierformat"
          value={page.format}
          onChange={(event) => {
            const format = formats.find((code) => code === event.target.value)
            if (format !== undefined) changePage({ format })
          }}
        >
          {catalogue.formats.map((format) => (
            <option key={format.code} value={format.code}>
              {format.label} ({formatLengthShort(format.widthMm)} ×{' '}
              {formatLengthShort(format.heightMm)} mm)
            </option>
          ))}
          <option value="CUSTOM">Eigenes Format</option>
        </SelectField>

        {page.format === 'CUSTOM' ? (
          <div className="grid grid-cols-2 gap-3">
            <MeasureField
              label="Breite"
              value={paper.width}
              min={CUSTOM_SIDE_MIN}
              max={CUSTOM_SIDE_MAX}
              step={1}
              onCommit={(customWidth) => changePage({ customWidth }, 'page-width')}
              error={error('customWidth')}
            />
            <MeasureField
              label="Höhe"
              value={paper.height}
              min={CUSTOM_SIDE_MIN}
              max={CUSTOM_SIDE_MAX}
              step={1}
              onCommit={(customHeight) => changePage({ customHeight }, 'page-height')}
              error={error('customHeight')}
            />
          </div>
        ) : (
          <SegmentedControl
            label="Ausrichtung"
            value={page.orientation}
            onChange={(orientation) => changePage({ orientation })}
            options={[
              { value: 'PORTRAIT', label: 'Hochformat' },
              { value: 'LANDSCAPE', label: 'Querformat' },
            ]}
          />
        )}
      </Group>

      <Group title="Ränder in mm">
        <p className="-mt-1 text-small text-text-secondary">
          Begrenzen den Inhalt. Feste Elemente dürfen auch im Rand stehen — so entsteht eine
          Fusszeile.
        </p>
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="col-start-2">
            <MeasureField
              bare
              label="Oben"
              value={page.marginTop}
              min={0}
              max={paper.height}
              onCommit={(marginTop) => changePage({ marginTop }, 'margin-top')}
              error={error('marginTop')}
              tooltip="Hier beginnt der Inhalt auf den Folgeseiten."
            />
          </div>
          <div className="col-start-1 row-start-2">
            <MeasureField
              bare
              label="Links"
              value={page.marginLeft}
              min={0}
              max={paper.width}
              onCommit={(marginLeft) => changePage({ marginLeft }, 'margin-left')}
              error={error('marginLeft')}
            />
          </div>
          <MarginDiagram landscape={paper.width > paper.height} />
          <div className="col-start-3 row-start-2">
            <MeasureField
              bare
              label="Rechts"
              value={page.marginRight}
              min={0}
              max={paper.width}
              onCommit={(marginRight) => changePage({ marginRight }, 'margin-right')}
              error={error('marginRight')}
            />
          </div>
          <div className="col-start-2 row-start-3">
            <MeasureField
              bare
              label="Unten"
              value={page.marginBottom}
              min={0}
              max={paper.height}
              onCommit={(marginBottom) => changePage({ marginBottom }, 'margin-bottom')}
              error={error('marginBottom')}
              tooltip="Hier endet der Inhalt auf jeder Seite."
            />
          </div>
        </div>
      </Group>

      <Group title="Inhalt">
        <MeasureField
          label="Inhalt beginnt auf Seite 1 bei"
          value={flow.top}
          min={0}
          max={Math.max(paper.height - page.marginBottom - MIN_FLOW_HEIGHT, 0)}
          step={1}
          onCommit={(top) => onChange(setFlowTop(definition, top), 'flow-top')}
          error={error('flowTop')}
          tooltip="Gemessen vom oberen Blattrand. Darüber ist Platz für Logo, Adresse und Titel; auf dem Blatt ist es die Linie «Inhalt beginnt hier»."
        />
      </Group>

      <Group title="QR-Zahlteil">
        <ChoiceList<PaymentPartPlacement>
          label="Wo der Zahlteil steht, wenn der Beleg einen hat"
          value={definition.paymentPart}
          onChange={(paymentPart) => onChange({ ...definition, paymentPart })}
          error={error('paymentPart')}
          options={[
            {
              value: 'OWN_PAGE',
              label: 'Auf eigener Seite am Schluss',
              description: 'Der Beleg bekommt eine zusätzliche Seite nur für den Zahlteil.',
            },
            {
              value: 'LAST_PAGE_BOTTOM',
              label: 'Unten auf der letzten Seite',
              description: 'Die untersten 105 mm der letzten Seite gehören dem Zahlteil.',
              unavailable: bottomAllowed
                ? undefined
                : 'Nur auf A4 hoch möglich: der Zahlteil ist 210 mm breit und steht am unteren Rand.',
            },
          ]}
        />
      </Group>
    </>
  )
}

/** A little sheet between the four margin fields, so «links» and «oben» need no reading. */
function MarginDiagram({ landscape }: { landscape: boolean }) {
  return (
    <span
      aria-hidden
      className={`col-start-2 row-start-2 mx-auto grid place-items-center rounded-[var(--radius-xs)] border border-line bg-paper ${
        landscape ? 'h-12 w-16' : 'h-16 w-12'
      }`}
    >
      <span className="h-[70%] w-[70%] border border-dashed border-sheet-margin" />
    </span>
  )
}
