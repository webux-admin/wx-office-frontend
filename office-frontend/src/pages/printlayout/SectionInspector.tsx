import type { ReactNode } from 'react'
import { CheckboxField } from '../../components/CheckboxField'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { FreeSection, LayoutSection } from '../../lib/types'
import { labelOfElement, labelOfSection } from '../../printlayout/catalogue'
import {
  childKey,
  FREE_HEIGHT_MAX,
  FREE_HEIGHT_MIN,
  maxIndentOf,
  MIN_SECTION_WIDTH,
  sectionOffsetOf,
  sectionWidthOf,
  SPACE_AFTER_MAX,
  totalsMinWidthOf,
  updateSection,
  type ObjectKey,
  type SectionChange,
} from '../../printlayout/definition'
import { contentWidthOf } from '../../printlayout/paper'
import { firstMessageFor } from '../../printlayout/validation'
import { ColumnConfigurator } from './ColumnConfigurator'
import { Group, MeasureField, StyleFields } from './InspectorControls'
import { InspectorHeader, ProblemNotes, type InspectorContext } from './InspectorParts'

type SectionInspectorProps = InspectorContext & {
  objectKey: ObjectKey
  index: number
  section: LayoutSection
  /** Builds the buttons at the right of the heading. */
  actions: (name: string) => ReactNode
  onMoveSection: (index: number, direction: -1 | 1) => void
}

/** What each kind of section is, in a sentence, for the head of the inspector. */
const DESCRIPTIONS: Record<LayoutSection['type'], string> = {
  DOCUMENT_TEXT: 'Der freie Text des Belegs. Was darin steht, wird am Beleg erfasst.',
  POSITIONS: 'Die Tabelle mit den Zeilen des Belegs. Sie wächst mit dem Beleg.',
  TOTALS: 'Netto, MwSt und Gesamtbetrag. Was darin steht, rechnet der Beleg.',
  VAT_SUMMARY: 'Die MwSt je Satz als eigener Block.',
  PAYMENT_TERMS: 'Zahlungsfrist und Leistungsdatum des Belegs.',
  DISCOUNT_STAGES: 'Die Skontostufen des Belegs mit Frist und Betrag.',
  FREE: 'Ein Kasten im Inhalt. Was darin liegt, bewegt sich mit dem Inhalt mit; leer ist er ein Abstand.',
}

/** Said at the totals and at the VAT summary while a form has both. */
const VAT_NOTE =
  'Die MwSt steht in der MwSt-Aufstellung und deshalb nicht noch einmal in den Totalen.'

/**
 * The settings of one section of the content: its place in the order, its indent and width,
 * and whatever this kind of section lets the tenant decide.
 */
export function SectionInspector({
  objectKey,
  index,
  section,
  actions,
  onMoveSection,
  definition,
  catalogue,
  problems,
  onChange,
  onSelect,
}: SectionInspectorProps) {
  const name = labelOfSection(section)
  const sections = definition.flow.sections
  const contentWidth = contentWidthOf(definition.page)
  const change = (patch: SectionChange, mergeKey?: string) =>
    onChange(
      updateSection(definition, index, patch),
      mergeKey === undefined ? undefined : `${mergeKey}:${objectKey}`,
    )

  const header = (
    <InspectorHeader
      title={name}
      actions={
        <>
          <RowOrderButtons
            name={name}
            upDisabled={index === 0}
            downDisabled={index === sections.length - 1}
            onUp={() => onMoveSection(index, -1)}
            onDown={() => onMoveSection(index, 1)}
          />
          {actions(name)}
        </>
      }
    >
      Abschnitt {index + 1} von {sections.length} im Inhalt. {DESCRIPTIONS[section.type]}
    </InspectorHeader>
  )

  if (section.type === 'FREE') {
    return (
      <>
        {header}
        <ProblemNotes problems={problems} target={objectKey} except={['height', 'spaceAfter']} />
        <Group title="Grösse">
          <div className="grid grid-cols-2 gap-3">
            <MeasureField
              label="Höhe"
              value={section.height}
              min={FREE_HEIGHT_MIN}
              max={FREE_HEIGHT_MAX}
              onCommit={(height) => change({ height }, 'height')}
              error={firstMessageFor(problems, objectKey, 'height')}
            />
            <MeasureField
              label="Abstand danach"
              value={section.spaceAfter}
              min={0}
              max={SPACE_AFTER_MAX}
              onCommit={(spaceAfter) => change({ spaceAfter }, 'space')}
              error={firstMessageFor(problems, objectKey, 'spaceAfter')}
            />
          </div>
        </Group>
        <Group title="Elemente darin">
          <FreeContents
            section={section}
            index={index}
            onSelect={onSelect}
            labelOf={(child) => labelOfElement(section.elements[child], catalogue)}
          />
        </Group>
      </>
    )
  }

  const width = sectionWidthOf(section, contentWidth)
  const indent = sectionOffsetOf(section, contentWidth)
  const narrow = section.type === 'TOTALS' || section.type === 'VAT_SUMMARY'
  const least = narrow ? totalsMinWidthOf(section.style.fontSize) : MIN_SECTION_WIDTH
  const hasBoth =
    sections.some((entry) => entry.type === 'TOTALS') &&
    sections.some((entry) => entry.type === 'VAT_SUMMARY')
  const textual =
    section.type === 'DOCUMENT_TEXT' ||
    section.type === 'PAYMENT_TERMS' ||
    section.type === 'DISCOUNT_STAGES'
  const atLeft = indent === 0
  const atRight = indent > 0 && Math.abs(indent + width - contentWidth) < 0.01

  return (
    <>
      {header}
      <ProblemNotes
        problems={problems}
        target={objectKey}
        except={['fontSize', 'spaceAfter', 'width', 'columns']}
      />

      {narrow && hasBoth && (
        <p className="mx-4 mb-4 rounded-[var(--radius-md)] bg-sunken px-3 py-2.5 text-small text-text-secondary">
          {VAT_NOTE}
        </p>
      )}

      {section.type === 'DOCUMENT_TEXT' && (
        <Group title="Inhalt">
          <SegmentedControl
            label="Welcher Text"
            value={section.field}
            onChange={(field) => change({ field })}
            options={[
              { value: 'header', label: 'Kopftext' },
              { value: 'footer', label: 'Fusstext' },
            ]}
          />
        </Group>
      )}

      {section.type === 'POSITIONS' && (
        <>
          <Group title="Spalten">
            <ColumnConfigurator
              section={section}
              width={width}
              contentWidth={contentWidth}
              catalogue={catalogue.columns}
              onColumns={(columns, mergeKey) => change({ columns }, mergeKey)}
            />
          </Group>
          <Group title="Darstellung">
            <CheckboxField
              label="Kopfzeile zeigen"
              checked={section.showHeader}
              onChange={(event) => change({ showHeader: event.target.checked })}
            />
            <CheckboxField
              label="Trennlinien zeigen"
              checked={section.rowLines}
              onChange={(event) => change({ rowLines: event.target.checked })}
              hint="Die feine Linie zwischen den Zeilen."
            />
          </Group>
        </>
      )}

      <Group title="Platz im Inhalt">
        {narrow && (
          <div role="group" aria-label="Ausrichtung" className="flex gap-1.5">
            <QuickButton pressed={atLeft} onClick={() => change({ x: 0 })}>
              Links
            </QuickButton>
            {/* No indent of its own: at the right margin, and it stays there when the paper
                or the margins change. */}
            <QuickButton pressed={atRight} onClick={() => change({ x: null })}>
              Rechts
            </QuickButton>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <MeasureField
            label="Einzug"
            value={indent}
            min={0}
            max={maxIndentOf(section, contentWidth)}
            onCommit={(x) => change({ x }, 'x')}
            tooltip="Abstand vom Rand links."
          />
          <MeasureField
            label="Breite"
            value={width}
            min={least}
            // A section without an indent of its own stands at the right margin and grows to
            // the left, so the whole content width is its to take.
            max={Math.max(section.x === null ? contentWidth : contentWidth - indent, least)}
            disabled={!narrow && section.width === null}
            onCommit={(next) => change({ width: next }, 'width')}
            error={firstMessageFor(problems, objectKey, 'width')}
          />
        </div>
        {!narrow && (
          <CheckboxField
            label="Breite bis zum rechten Rand"
            checked={section.width === null}
            onChange={(event) => change({ width: event.target.checked ? null : width })}
          />
        )}
        <MeasureField
          label="Abstand danach"
          value={section.spaceAfter}
          min={0}
          max={SPACE_AFTER_MAX}
          onCommit={(spaceAfter) => change({ spaceAfter }, 'space')}
          error={firstMessageFor(problems, objectKey, 'spaceAfter')}
          tooltip="Der freie Raum unter diesem Abschnitt, bevor der nächste beginnt."
        />
      </Group>

      <Group title="Schrift">
        <StyleFields
          style={section.style}
          align={textual ? 'left' : undefined}
          onChange={(style) => change({ style }, 'style')}
          error={firstMessageFor(problems, objectKey, 'fontSize')}
        />
      </Group>
    </>
  )
}

function QuickButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-button flex-1 rounded-[var(--radius-md)] border text-body transition-colors ${
        pressed
          ? 'border-accent bg-accent/10 font-medium text-accent-text'
          : 'border-line text-text-secondary hover:border-text-tertiary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}

function FreeContents({
  section,
  index,
  onSelect,
  labelOf,
}: {
  section: FreeSection
  index: number
  onSelect: (selection: ObjectKey[]) => void
  labelOf: (child: number) => string
}) {
  if (section.elements.length === 0) {
    return (
      <p className="text-small text-text-secondary">
        Noch leer. Ziehen Sie ein Element von links in diesen Bereich — oder lassen Sie ihn als
        Abstand stehen.
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-0.5">
      {section.elements.map((_, child) => (
        <li key={child}>
          <button
            type="button"
            onClick={() => onSelect([childKey(index, child)])}
            className="w-full truncate rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-body text-text-primary transition-colors hover:bg-sunken"
          >
            {labelOf(child)}
          </button>
        </li>
      ))}
    </ul>
  )
}
