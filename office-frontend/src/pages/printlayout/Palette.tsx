import {
  AlignLeft,
  Calculator,
  ChevronRight,
  Coins,
  FileText,
  GripVertical,
  Hash,
  ImageIcon,
  LayoutList,
  MapPin,
  Minus,
  Percent,
  Search,
  SquareDashed,
  Table,
  Tags,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import type { PrintLayoutDefinition, PrintLayoutFields, PrintoutField } from '../../lib/types'
import { searchFields, usedFieldKeys } from '../../printlayout/catalogue'
import { existingSectionKey } from '../../printlayout/commands'
import type { ObjectKey } from '../../printlayout/definition'
import {
  ELEMENT_ITEMS,
  fieldItem,
  SECTION_ITEMS,
  type PaletteItem,
} from '../../printlayout/palette'
import type { PageView } from '../../printlayout/paper'
import { Outline } from './Outline'

/** Which of the three registers of the left pane is open. */
export type PaletteTab = 'elements' | 'fields' | 'outline'

/** How a palette entry is dragged; the designer owns the drag, the entries only report. */
export type PaletteDragController = {
  press: (item: PaletteItem, event: ReactPointerEvent<HTMLElement>) => void
  move: (event: ReactPointerEvent<HTMLElement>) => void
  release: (event: ReactPointerEvent<HTMLElement>) => void
  cancel: () => void
  /** True right after a drag, so the click that follows the release inserts nothing. */
  consumeClick: () => boolean
}

const ICONS: Record<string, LucideIcon> = {
  text: Type,
  image: ImageIcon,
  line: Minus,
  'address-recipient': MapPin,
  'address-issuer': MapPin,
  'page-number': Hash,
  positions: Table,
  totals: Calculator,
  'vat-summary': Percent,
  'payment-terms': Coins,
  'discount-stages': Tags,
  'text-header': AlignLeft,
  'text-footer': AlignLeft,
  free: SquareDashed,
}

type PaletteProps = {
  tab: PaletteTab
  onTabChange: (tab: PaletteTab) => void
  definition: PrintLayoutDefinition
  selection: readonly ObjectKey[]
  catalogue: PrintLayoutFields
  view: PageView
  warnings: ReadonlyMap<ObjectKey, string>
  drag: PaletteDragController
  /** Adds what the entry stands for at a sensible place and selects it. */
  onInsert: (item: PaletteItem) => void
  onSelect: (selection: ObjectKey[]) => void
  onMoveSection: (index: number, direction: -1 | 1) => void
  onRemove: (key: ObjectKey) => void
}

/**
 * The left pane: what can be put on the form, the fields of the document, and the outline of
 * what is on it already.
 *
 * <p>Every entry works three ways — drag it onto the sheet, click it, or press Enter on it —
 * because dragging is the shortcut and never the only way (WCAG 2.2 SC 2.5.7).
 */
export function Palette({
  tab,
  onTabChange,
  definition,
  selection,
  catalogue,
  view,
  warnings,
  drag,
  onInsert,
  onSelect,
  onMoveSection,
  onRemove,
}: PaletteProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pt-2">
        <Tabs
          label="Bausteine der Druckvorlage"
          active={tab}
          onChange={onTabChange}
          tabs={[
            { id: 'elements', label: 'Elemente' },
            { id: 'fields', label: 'Felder' },
            { id: 'outline', label: 'Aufbau' },
          ]}
        />
      </div>
      <div className="-mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tab === 'elements' && (
          <ElementsTab
            definition={definition}
            view={view}
            drag={drag}
            onInsert={onInsert}
            onSelect={onSelect}
            onOpenFields={() => onTabChange('fields')}
          />
        )}
        {tab === 'fields' && (
          <FieldsTab
            definition={definition}
            catalogue={catalogue}
            drag={drag}
            onInsert={onInsert}
            onSelect={onSelect}
          />
        )}
        {tab === 'outline' && (
          <Outline
            definition={definition}
            selection={selection}
            catalogue={catalogue}
            warnings={warnings}
            onSelect={onSelect}
            onMoveSection={onMoveSection}
            onRemove={onRemove}
          />
        )}
      </div>
    </div>
  )
}

function ElementsTab({
  definition,
  view,
  drag,
  onInsert,
  onSelect,
  onOpenFields,
}: {
  definition: PrintLayoutDefinition
  view: PageView
  drag: PaletteDragController
  onInsert: (item: PaletteItem) => void
  onSelect: (selection: ObjectKey[]) => void
  onOpenFields: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-5">
      <section>
        <PaletteHeading
          title="Frei platzieren"
          hint="Bleibt genau dort stehen, wo Sie es hinlegen — auch im Rand."
        />
        <ul className="grid grid-cols-1 gap-1">
          <li>
            <Entry item={ELEMENT_ITEMS[0]} drag={drag} onInsert={onInsert} />
          </li>
          <li>
            {/* Not an element by itself: which field is the real question, so this leads to
                the list that answers it instead of placing an empty box. */}
            <button
              type="button"
              onClick={onOpenFields}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent px-2 py-2 text-left transition-colors hover:border-line hover:bg-sunken"
            >
              <EntryIcon icon={FileText} />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-text-primary">Feld</span>
                <span className="block text-small text-text-secondary">
                  Ein Wert des Belegs: Nummer, Datum, Betrag …
                </span>
              </span>
              <ChevronRight size={15} aria-hidden className="shrink-0 text-text-tertiary" />
            </button>
          </li>
          {ELEMENT_ITEMS.slice(1).map((item) => (
            <li key={item.id}>
              <Entry item={item} drag={drag} onInsert={onInsert} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <PaletteHeading
          title="Inhalt"
          hint="Wächst mit dem Beleg und läuft auf Folgeseiten weiter. Die Reihenfolge zählt."
        />
        {view === 'following' && (
          <p className="mb-2 rounded-[var(--radius-md)] bg-sunken px-2.5 py-2 text-small text-text-secondary">
            Der Inhalt wird auf «Seite 1» angeordnet.
          </p>
        )}
        <ul className="grid grid-cols-1 gap-1">
          {SECTION_ITEMS.map((item) => {
            const existing =
              item.kind === 'section'
                ? existingSectionKey(definition, item.type, item.field)
                : undefined
            return (
              <li key={item.id}>
                <Entry
                  item={item}
                  drag={drag}
                  onInsert={onInsert}
                  badge={existing === undefined ? undefined : 'vorhanden'}
                  onBadge={existing === undefined ? undefined : () => onSelect([existing])}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function PaletteHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2 px-2">
      <h3 className="text-overline text-text-tertiary">{title}</h3>
      <p className="mt-0.5 text-small text-text-secondary">{hint}</p>
    </div>
  )
}

function EntryIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-sunken text-text-secondary"
    >
      <Icon size={16} />
    </span>
  )
}

/**
 * One entry of the palette: a real button that inserts on click, and that can be picked up.
 *
 * <p>With a mouse the whole entry drags. On a touch screen only the grip does — a list whose
 * every row swallows the finger could not be scrolled any more.
 *
 * @param badge a word at the right, for something the form already has
 * @param onBadge what a click on that word does: select the thing it speaks of
 */
function Entry({
  item,
  drag,
  onInsert,
  badge,
  onBadge,
  compact = false,
}: {
  item: PaletteItem
  drag: PaletteDragController
  onInsert: (item: PaletteItem) => void
  badge?: string
  onBadge?: () => void
  /** One line instead of two, for the long list of fields. */
  compact?: boolean
}) {
  const Icon = ICONS[item.id] ?? LayoutList
  const floatingBadge = !compact && badge !== undefined && onBadge !== undefined
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const onGrip = event.target instanceof Element && event.target.closest('[data-grip]') !== null
    if (event.pointerType === 'touch' && !onGrip) return
    drag.press(item, event)
  }
  return (
    <div className="group/entry relative flex items-stretch gap-1">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={drag.move}
        onPointerUp={drag.release}
        onPointerCancel={drag.cancel}
        onClick={() => {
          if (!drag.consumeClick()) onInsert(item)
        }}
        title={
          // A section the form already has is selected or moved, not added a second time. A
          // field may stand on the form more than once, so its entry always adds another.
          badge === undefined || item.kind === 'element'
            ? `${item.label} einfügen — klicken oder auf das Blatt ziehen`
            : `${item.label} ist schon im Inhalt — klicken wählt es aus, ziehen legt es an eine andere Stelle`
        }
        className="flex min-w-0 flex-1 cursor-grab items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent px-2 py-2 text-left transition-colors hover:border-line hover:bg-sunken active:cursor-grabbing"
      >
        {!compact && <EntryIcon icon={Icon} />}
        <span className="min-w-0 flex-1">
          {/* Room for the badge, which floats over the corner of a two-line entry: beside the
              entry it would take the width the description needs. */}
          <span
            className={`block truncate text-body font-medium text-text-primary ${
              floatingBadge ? 'pr-20' : ''
            }`}
          >
            {item.label}
          </span>
          {item.description !== '' && (
            <span
              className={`block text-small text-text-secondary ${compact ? 'truncate' : ''}`}
            >
              {item.description}
            </span>
          )}
        </span>
        <span
          data-grip
          aria-hidden
          className="grid shrink-0 touch-none place-items-center self-stretch px-0.5 text-text-tertiary opacity-0 transition-opacity group-hover/entry:opacity-100 pointer-coarse:opacity-100"
        >
          <GripVertical size={15} />
        </span>
      </button>
      {badge !== undefined && onBadge !== undefined && (
        <button
          type="button"
          onClick={onBadge}
          title={`${item.label} auf dem Blatt auswählen`}
          aria-label={`${item.label} ist ${badge}: auf dem Blatt auswählen`}
          className={`shrink-0 rounded-[var(--radius-full)] bg-accent/12 px-2 py-0.5 text-caption font-medium text-accent-text transition-colors hover:bg-accent/20 ${
            floatingBadge ? 'absolute right-2 top-2' : 'self-center'
          }`}
        >
          {badge}
        </button>
      )}
    </div>
  )
}

function FieldsTab({
  definition,
  catalogue,
  drag,
  onInsert,
  onSelect,
}: {
  definition: PrintLayoutDefinition
  catalogue: PrintLayoutFields
  drag: PaletteDragController
  onInsert: (item: PaletteItem) => void
  onSelect: (selection: ObjectKey[]) => void
}) {
  const [term, setTerm] = useState('')
  const used = usedFieldKeys(definition)
  const groups = searchFields(catalogue.fields, term)

  if (catalogue.fields.length === 0) {
    return (
      <PaletteEmpty
        title="Keine Felder verfügbar"
        text="Der Server bietet für diese Druckvorlage keine Felder an. Texte, Bilder und Linien lassen sich trotzdem platzieren."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <TextField
        label="Feld suchen"
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        icon={<Search size={15} />}
        placeholder="Name oder Beispielwert"
        tooltip="Sucht im Namen und im Beispielwert — etwa «Fällig» oder «RE-2026»."
      />
      {groups.length === 0 && (
        <PaletteEmpty
          title="Kein Feld gefunden"
          text={`Zu «${term.trim()}» passt kein Feld. Vielleicht heisst es anders — die Suche durchsucht auch die Beispielwerte.`}
        />
      )}
      {groups.map((group) => (
        <FieldGroup
          key={group.group}
          title={group.group}
          fields={group.fields}
          used={used}
          drag={drag}
          onInsert={onInsert}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function FieldGroup({
  title,
  fields,
  used,
  drag,
  onInsert,
  onSelect,
}: {
  title: string
  fields: readonly PrintoutField[]
  used: ReadonlyMap<string, ObjectKey>
  drag: PaletteDragController
  onInsert: (item: PaletteItem) => void
  onSelect: (selection: ObjectKey[]) => void
}) {
  return (
    <section>
      <h3 className="text-overline mb-1 px-2 text-text-tertiary">{title}</h3>
      <ul className="grid grid-cols-1 gap-0.5">
        {fields.map((field) => {
          const key = used.get(field.path)
          return (
            <li key={field.path}>
              <Entry
                compact
                item={fieldItem(field)}
                drag={drag}
                onInsert={onInsert}
                badge={key === undefined ? undefined : 'verwendet'}
                onBadge={key === undefined ? undefined : () => onSelect([key])}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PaletteEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-line px-3 py-6 text-center">
      <p className="text-body font-medium text-text-primary">{title}</p>
      <p className="mt-1 text-small text-text-secondary">{text}</p>
    </div>
  )
}
