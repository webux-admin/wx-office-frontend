import { AlertTriangle, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '../../components/IconButton'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import type { PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import { labelOfElement, labelOfSection } from '../../printlayout/catalogue'
import {
  childKey,
  readingOrder,
  refOf,
  repeatOf,
  sectionKey,
  type ObjectKey,
} from '../../printlayout/definition'

type OutlineProps = {
  definition: PrintLayoutDefinition
  selection: readonly ObjectKey[]
  catalogue: PrintLayoutFields
  /** A sentence per object that will not print as it looks. */
  warnings: ReadonlyMap<ObjectKey, string>
  onSelect: (selection: ObjectKey[]) => void
  onMoveSection: (index: number, direction: -1 | 1) => void
  onRemove: (key: ObjectKey) => void
}

/**
 * Everything on the form as a list: what stands on the first page only, what repeats on every
 * page, and the content in its order.
 *
 * <p>This is where the order of the content can be read and changed without touching the
 * sheet, and the way to every object for somebody who uses the keyboard or a screen reader:
 * a click selects, the arrows move a section up or down, the bin removes.
 */
export function Outline({
  definition,
  selection,
  catalogue,
  warnings,
  onSelect,
  onMoveSection,
  onRemove,
}: OutlineProps) {
  const order = readingOrder(definition)
    .filter((key) => refOf(key)?.kind === 'element')
    .map((key) => ({ key, element: definition.elements[refOf(key)?.index ?? 0] }))
    .filter((entry) => entry.element !== undefined)
  const first = order.filter(({ element }) => repeatOf(element) === 'FIRST_PAGE')
  const every = order.filter(({ element }) => repeatOf(element) === 'EVERY_PAGE')
  const sections = definition.flow.sections

  const row = (key: ObjectKey, label: string, nested = false, controls?: ReactNode) => (
    <OutlineRow
      key={key}
      label={label}
      selected={selection.includes(key)}
      warning={warnings.get(key)}
      nested={nested}
      onSelect={() => onSelect([key])}
      onRemove={() => onRemove(key)}
      controls={controls}
    />
  )

  return (
    <div className="grid grid-cols-1 gap-5">
      <OutlineGroup title="Seite 1" hint="Steht nur auf der ersten Seite." empty={first.length === 0}>
        {first.map(({ key, element }) => row(key, labelOfElement(element, catalogue)))}
      </OutlineGroup>

      <OutlineGroup
        title="Jede Seite"
        hint="Wiederholt sich auf allen Seiten, zum Beispiel als Fusszeile."
        empty={every.length === 0}
      >
        {every.map(({ key, element }) => row(key, labelOfElement(element, catalogue)))}
      </OutlineGroup>

      <OutlineGroup
        title="Inhalt"
        hint="Von oben nach unten, in dieser Reihenfolge."
        empty={sections.length === 0}
      >
        {sections.flatMap((section, index) => {
          const name = labelOfSection(section)
          const own = row(
            sectionKey(index),
            name,
            false,
            <RowOrderButtons
              name={name}
              upDisabled={index === 0}
              downDisabled={index === sections.length - 1}
              onUp={() => onMoveSection(index, -1)}
              onDown={() => onMoveSection(index, 1)}
            />,
          )
          if (section.type !== 'FREE') return [own]
          return [
            own,
            ...section.elements.map((element, child) =>
              row(childKey(index, child), labelOfElement(element, catalogue), true),
            ),
          ]
        })}
      </OutlineGroup>
    </div>
  )
}

function OutlineGroup({
  title,
  hint,
  empty,
  children,
}: {
  title: string
  hint: string
  empty: boolean
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 px-2">
        <h3 className="text-overline text-text-tertiary">{title}</h3>
        <p className="mt-0.5 text-small text-text-secondary">{hint}</p>
      </div>
      {empty ? (
        <p className="px-2 text-small text-text-tertiary">Noch nichts.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-0.5">{children}</ul>
      )}
    </section>
  )
}

function OutlineRow({
  label,
  selected,
  warning,
  nested,
  onSelect,
  onRemove,
  controls,
}: {
  label: string
  selected: boolean
  warning: string | undefined
  /** An element inside a free section, set in under it. */
  nested: boolean
  onSelect: () => void
  onRemove: () => void
  controls?: ReactNode
}) {
  return (
    <li
      className={`flex items-center gap-1 rounded-[var(--radius-md)] border pr-1 transition-colors ${
        nested ? 'ml-4' : ''
      } ${selected ? 'border-accent/40 bg-accent/10' : 'border-transparent hover:bg-sunken'}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left text-body text-text-primary"
      >
        <span className="truncate">{label}</span>
        {warning !== undefined && (
          <span title={warning} className="shrink-0 text-warning">
            <AlertTriangle size={13} aria-hidden />
            <span className="sr-only">Hinweis: {warning}</span>
          </span>
        )}
      </button>
      {controls}
      <IconButton label={`${label} löschen`} tone="danger" onClick={onRemove}>
        <Trash2 size={14} aria-hidden />
      </IconButton>
    </li>
  )
}
