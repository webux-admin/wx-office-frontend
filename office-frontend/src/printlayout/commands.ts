import type {
  LayoutElement,
  LayoutSection,
  LayoutSectionType,
  PrintLayoutDefinition,
  PrintLayoutFields,
} from '../lib/types'
import { labelOfElement, labelOfObject, labelOfSection } from './catalogue'
import {
  addChild,
  addElement,
  containerOf,
  DEFAULT_SPACE_AFTER,
  DUPLICATE_OFFSET,
  duplicateObject,
  EMPTY_STYLE,
  elementAt,
  elementRectOf,
  estimatedHeightOf,
  FREE_HEIGHT_MAX,
  FREE_HEIGHT_MIN,
  insertSection,
  maxIndentOf,
  moveElement,
  moveSection,
  objectExists,
  refOf,
  removeObjects,
  repeatOf,
  sectionAt,
  sectionKey,
  sectionOffsetOf,
  updateSection,
  type ObjectKey,
} from './definition'
import { clampDelta, MIN_ELEMENT_SIZE } from './geometry'
import { contentWidthOf, paperSizeOf, type PageView } from './paper'
import { clamp, formatLengthShort, roundLength } from './units'

/** Said where somebody tries to get a second «Totale» by copying the first. */
const ONE_TOTALS = 'Totale gibt es nur einmal pro Vorlage.'

/** A form together with what is selected on it — the unit undo and redo work on. */
export type Snapshot = {
  definition: PrintLayoutDefinition
  selection: ObjectKey[]
}

/** What a command leaves behind: the new state and a sentence for the status line. */
export type Outcome = Snapshot & {
  /** Said through `aria-live` and shown in the status line. */
  announcement: string
}

/** Where something lands that is dropped on the sheet. */
export type DropTarget =
  /** Fixed on the paper, in millimetres from its top left corner. */
  | { kind: 'page'; x: number; y: number }
  /** Inside an existing free section, measured from its top left corner. */
  | { kind: 'free'; section: number; x: number; y: number }
  /** In a new free section created at this place of the flow; `x` from the left margin. */
  | { kind: 'flow'; index: number; x: number }

/** What the clipboard of the designer holds. */
export type ClipboardEntry =
  | {
      kind: 'element'
      /** The copy, at the position the next paste starts from. */
      element: LayoutElement
      /**
       * The element on the form this copy came from — the original, and after a paste the
       * last pasted one. `null` for a copy of a page element. A free section is found again
       * through it: the section that still holds this very object, wherever it stands now.
       */
      anchor: LayoutElement | null
    }
  | { kind: 'section'; section: LayoutSection }

/**
 * Says where something stands, for the status line and a screen reader.
 *
 * @param label what the thing is called
 * @param x millimetres from the left
 * @param y millimetres from the top
 * @returns for example `Belegnummer: 20 mm von links, 78 mm von oben`
 */
export function positionAnnouncement(label: string, x: number, y: number): string {
  return `${label}: ${formatLengthShort(x)} mm von links, ${formatLengthShort(y)} mm von oben`
}

/**
 * Drops the keys that no longer name anything, as happens after an undo.
 *
 * @param definition the form
 * @param selection the keys that were selected
 * @returns the keys that still name something
 */
export function pruneSelection(
  definition: PrintLayoutDefinition,
  selection: readonly ObjectKey[],
): ObjectKey[] {
  return selection.filter((key) => objectExists(definition, key))
}

/**
 * Finds the section of a kind that a document has only once.
 *
 * <p>Positions, totals, the payment terms, the discount stages and each of the two document
 * texts make sense once — and of the totals the server accepts only one. The palette uses this
 * to select the existing one instead of adding a second by accident. A VAT summary may stand
 * in several places, and a free section anyway.
 *
 * @param definition the form
 * @param type the kind of section
 * @param field for `DOCUMENT_TEXT`: which of the two texts
 * @returns the key of the existing section; `undefined` when there is none, and always for a
 *   free section and a VAT summary, of which there may be many
 */
export function existingSectionKey(
  definition: PrintLayoutDefinition,
  type: LayoutSectionType,
  field?: 'header' | 'footer',
): ObjectKey | undefined {
  if (type === 'FREE' || type === 'VAT_SUMMARY') return undefined
  const index = definition.flow.sections.findIndex(
    (section) =>
      section.type === type &&
      (section.type !== 'DOCUMENT_TEXT' || section.field === (field ?? 'header')),
  )
  return index === -1 ? undefined : sectionKey(index)
}

/**
 * Puts a new element where it was dropped and selects it.
 *
 * <p>Dropped into the flow it gets a free section of its own, just high enough to hold it —
 * that is the whole trick behind «below the positions».
 *
 * @param snapshot the current state
 * @param element the element to add
 * @param target where it was dropped
 * @param catalogue the catalogue, for the name in the announcement
 * @param view the page shown; an element dropped on a following page repeats on every page
 * @param height how high the element is drawn, where known
 * @returns the new state, or `null` when the target cannot take the element
 */
export function dropElement(
  snapshot: Snapshot,
  element: LayoutElement,
  target: DropTarget,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
  view: PageView = 'first',
  height?: number,
): Outcome | null {
  const { definition } = snapshot
  const name = labelOfElement(element, catalogue)
  if (target.kind === 'page') {
    const paper = paperSizeOf(definition.page)
    const placed = addElement(definition, {
      ...element,
      repeat: view === 'following' ? 'EVERY_PAGE' : repeatOf(element),
      x: roundLength(clamp(target.x, 0, paper.width - (element.width ?? MIN_ELEMENT_SIZE))),
      y: roundLength(clamp(target.y, 0, paper.height - (element.height ?? MIN_ELEMENT_SIZE))),
    })
    return {
      definition: placed.definition,
      selection: [placed.key],
      announcement: `${name} eingefügt und ausgewählt.`,
    }
  }
  if (element.type === 'PAGE_NUMBER') return null

  const contentWidth = contentWidthOf(definition.page)
  const tall = height ?? estimatedHeightOf(element)
  const x = roundLength(clamp(target.x, 0, contentWidth - (element.width ?? MIN_ELEMENT_SIZE)))
  if (target.kind === 'free') {
    const section = definition.flow.sections[target.section]
    if (section === undefined || section.type !== 'FREE') return null
    const y = roundLength(Math.max(target.y, 0))
    const grown = updateSection(definition, target.section, {
      height: clamp(Math.max(section.height, Math.ceil(y + tall)), FREE_HEIGHT_MIN, FREE_HEIGHT_MAX),
    })
    const placed = addChild(grown, target.section, { ...element, x, y })
    if (placed === null) return null
    return {
      definition: placed.definition,
      selection: [placed.key],
      announcement: `${name} in den freien Bereich gelegt. Bewegt sich mit dem Inhalt mit.`,
    }
  }
  const free: LayoutSection = {
    type: 'FREE',
    height: clamp(Math.ceil(tall), FREE_HEIGHT_MIN, FREE_HEIGHT_MAX),
    spaceAfter: DEFAULT_SPACE_AFTER,
    style: { ...EMPTY_STYLE },
    elements: [],
  }
  const inserted = insertSection(definition, free, target.index)
  const index = refOf(inserted.key)?.index ?? 0
  const placed = addChild(inserted.definition, index, { ...element, x, y: 0 })
  if (placed === null) return null
  return {
    definition: placed.definition,
    selection: [placed.key],
    announcement: `${name} in einen neuen freien Bereich gelegt. Bewegt sich mit dem Inhalt mit.`,
  }
}

/**
 * Moves an existing element to another container: from the page into the content, out of a
 * free section onto the page, or from one free section into another.
 *
 * @param snapshot the current state
 * @param key the element to move
 * @param target where it goes
 * @param catalogue the catalogue, for the name in the announcement
 * @param height how high the element is drawn, where known
 * @returns the new state, or `null` when the key names no element or the target cannot take it
 */
export function relocateElement(
  snapshot: Snapshot,
  key: ObjectKey,
  target: DropTarget,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
  height?: number,
): Outcome | null {
  const element = elementAt(snapshot.definition, key)
  if (element === undefined) return null
  if (target.kind !== 'page' && element.type === 'PAGE_NUMBER') return null
  // Taking the element out first leaves every section where it was: neither a page element
  // nor a child shifts the index of a section.
  const without = removeObjects(snapshot.definition, [key])
  const outcome = dropElement({ definition: without, selection: [] }, element, target, catalogue, 'first', height)
  if (outcome === null) return null
  const name = labelOfElement(element, catalogue)
  return {
    ...outcome,
    announcement:
      target.kind === 'page'
        ? `${name} steht jetzt fest auf dem Blatt.`
        : `${name} bewegt sich jetzt mit dem Inhalt mit.`,
  }
}

/**
 * Puts a section into the flow and selects it.
 *
 * @param snapshot the current state
 * @param section the section to add
 * @param index where it goes in the flow
 * @returns the new state
 */
export function dropSection(snapshot: Snapshot, section: LayoutSection, index: number): Outcome {
  const placed = insertSection(snapshot.definition, section, index)
  return {
    definition: placed.definition,
    selection: [placed.key],
    announcement: `${labelOfSection(section)} in den Inhalt eingefügt und ausgewählt.`,
  }
}

/**
 * Removes whatever is selected.
 *
 * @param snapshot the current state
 * @param catalogue the catalogue, for the name in the announcement
 * @returns the new state with nothing selected, or `null` when nothing was selected
 */
export function removeSelection(
  snapshot: Snapshot,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): Outcome | null {
  const selection = pruneSelection(snapshot.definition, snapshot.selection)
  if (selection.length === 0) return null
  const what =
    selection.length === 1
      ? labelOfObject(snapshot.definition, selection[0], catalogue)
      : `${selection.length} Elemente`
  return {
    definition: removeObjects(snapshot.definition, selection),
    selection: [],
    announcement: `${what} gelöscht. Rückgängig mit Strg+Z.`,
  }
}

/**
 * Copies whatever is selected next to itself and selects the copies.
 *
 * @param snapshot the current state
 * @param catalogue the catalogue, for the name in the announcement
 * @returns the new state, or `null` when nothing was selected
 */
export function duplicateSelection(
  snapshot: Snapshot,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): Outcome | null {
  const selection = pruneSelection(snapshot.definition, snapshot.selection)
  if (selection.length === 0) return null
  let definition = snapshot.definition
  const copies: ObjectKey[] = []
  // Sections from the bottom up: a copy inserted below its original would otherwise shift
  // the index of every selected section after it.
  const ordered = [...selection].sort((first, second) => {
    const a = refOf(first)
    const b = refOf(second)
    if (a?.kind === 'section' && b?.kind === 'section') return b.index - a.index
    return 0
  })
  for (const key of ordered) {
    // A form has its totals once; a copy would only be something to delete again.
    if (sectionAt(definition, key)?.type === 'TOTALS') continue
    const placed = duplicateObject(definition, key)
    if (placed === null) continue
    definition = placed.definition
    copies.push(placed.key)
  }
  if (copies.length === 0) {
    const onlyTotals = selection.every((key) => sectionAt(definition, key)?.type === 'TOTALS')
    if (!onlyTotals) return null
    return { definition, selection, announcement: ONE_TOTALS }
  }
  const what =
    selection.length === 1
      ? labelOfObject(snapshot.definition, selection[0], catalogue)
      : `${selection.length} Elemente`
  return { definition, selection: copies, announcement: `${what} dupliziert.` }
}

/**
 * Moves the selection by a small step, as the arrow keys do.
 *
 * <p>Elements move together and stop together at the edge of what holds them. A section has
 * no height of its own to move in: sideways changes its indent, up and down change its place
 * in the order.
 *
 * @param snapshot the current state
 * @param dx millimetres to the right
 * @param dy millimetres down
 * @param catalogue the catalogue, for the name in the announcement
 * @returns the new state, or `null` when nothing was selected or nothing could move
 */
export function nudgeSelection(
  snapshot: Snapshot,
  dx: number,
  dy: number,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): Outcome | null {
  const selection = pruneSelection(snapshot.definition, snapshot.selection)
  if (selection.length === 0) return null
  const { definition } = snapshot

  const section = selection.length === 1 ? sectionAt(definition, selection[0]) : undefined
  if (section !== undefined) return nudgeSection(snapshot, selection[0], section, dx, dy)

  const moving = selection
    .map((key) => ({ key, ref: refOf(key), element: elementAt(definition, key) }))
    .flatMap(({ key, ref, element }) => {
      if (ref === null || element === undefined) return []
      const container = containerOf(definition, ref)
      return [{ key, frame: container.frame, rect: elementRectOf(element, container) }]
    })
  if (moving.length === 0) return null
  const delta = clampDelta(moving, dx, dy)
  if (delta.dx === 0 && delta.dy === 0) return null

  let next = definition
  for (const { key, rect } of moving) {
    next = moveElement(next, key, { x: rect.x + delta.dx, y: rect.y + delta.dy })
  }
  const first = elementAt(next, moving[0].key)
  const announcement =
    moving.length === 1 && first !== undefined
      ? positionAnnouncement(labelOfElement(first, catalogue), first.x, first.y)
      : `${moving.length} Elemente verschoben.`
  return { definition: next, selection, announcement }
}

function nudgeSection(
  snapshot: Snapshot,
  key: ObjectKey,
  section: LayoutSection,
  dx: number,
  dy: number,
): Outcome | null {
  const { definition } = snapshot
  const index = refOf(key)?.index ?? 0
  const name = labelOfSection(section)
  if (dy !== 0) {
    const moved = moveSection(definition, index, index + (dy < 0 ? -1 : 1))
    if (moved.definition === definition) return null
    const place = (refOf(moved.key)?.index ?? 0) + 1
    return {
      definition: moved.definition,
      selection: [moved.key],
      announcement: `${name}: jetzt an Stelle ${place} von ${definition.flow.sections.length}.`,
    }
  }
  if (section.type === 'FREE' || dx === 0) return null
  const contentWidth = contentWidthOf(definition.page)
  const from = sectionOffsetOf(section, contentWidth)
  const x = roundLength(clamp(from + dx, 0, maxIndentOf(section, contentWidth)))
  if (x === from) return null
  return {
    definition: updateSection(definition, index, { x }),
    selection: [key],
    announcement: `${name}: Einzug ${formatLengthShort(x)} mm.`,
  }
}

/**
 * Takes a copy of the selection for pasting later.
 *
 * @param snapshot the current state
 * @returns the copied things; empty when nothing was selected
 */
export function copySelection(snapshot: Snapshot): ClipboardEntry[] {
  return pruneSelection(snapshot.definition, snapshot.selection).flatMap((key): ClipboardEntry[] => {
    const ref = refOf(key)
    const element = elementAt(snapshot.definition, key)
    if (element !== undefined && ref !== null) {
      return [
        {
          kind: 'element',
          element: structuredClone(element),
          anchor: ref.kind === 'child' ? element : null,
        },
      ]
    }
    const section = sectionAt(snapshot.definition, key)
    return section === undefined ? [] : [{ kind: 'section', section: structuredClone(section) }]
  })
}

/**
 * Pastes what was copied and selects it.
 *
 * <p>An element goes back into the container it came from, a little off the last copy so
 * every one of them can be seen. Its free section is looked up when the paste happens — by
 * the element it was copied from, not by a place in the order, which may have changed since;
 * where that section is gone the copy lands on the page. A section goes to the end of the flow.
 *
 * @param snapshot the current state
 * @param clipboard what {@link copySelection} took, or what the paste before returned
 * @returns the new state together with the clipboard for the next paste, which starts from
 *   where this one landed; `null` when the clipboard is empty
 */
export function pasteClipboard(
  snapshot: Snapshot,
  clipboard: readonly ClipboardEntry[],
): (Outcome & { clipboard: ClipboardEntry[] }) | null {
  if (clipboard.length === 0) return null
  let definition = snapshot.definition
  const pasted: ObjectKey[] = []
  const next: ClipboardEntry[] = []
  for (const entry of clipboard) {
    if (entry.kind === 'section') {
      const second =
        entry.section.type === 'TOTALS' &&
        definition.flow.sections.some((section) => section.type === 'TOTALS')
      next.push(entry)
      if (second) continue
      const placed = insertSection(definition, structuredClone(entry.section), definition.flow.sections.length)
      definition = placed.definition
      pasted.push(placed.key)
      continue
    }
    const copy: LayoutElement = {
      ...structuredClone(entry.element),
      x: entry.element.x + DUPLICATE_OFFSET,
      y: entry.element.y + DUPLICATE_OFFSET,
    }
    const anchor = entry.anchor
    const home =
      anchor === null
        ? -1
        : definition.flow.sections.findIndex(
            (section) => section.type === 'FREE' && section.elements.includes(anchor),
          )
    const free = definition.flow.sections[home]
    const paper = paperSizeOf(definition.page)
    const placed =
      free !== undefined && free.type === 'FREE'
        ? addChild(definition, home, fitted(copy, contentWidthOf(definition.page), free.height))
        : addElement(definition, fitted(copy, paper.width, paper.height))
    if (placed === null) {
      next.push(entry)
      continue
    }
    definition = placed.definition
    pasted.push(placed.key)
    // The next paste starts from this copy, and finds the free section through it.
    const landed = elementAt(definition, placed.key)
    next.push(
      landed === undefined
        ? entry
        : { kind: 'element', element: structuredClone(landed), anchor: anchor === null ? null : landed },
    )
  }
  if (pasted.length === 0) {
    const onlyTotals = clipboard.every(
      (entry) => entry.kind === 'section' && entry.section.type === 'TOTALS',
    )
    return onlyTotals ? { ...snapshot, announcement: ONE_TOTALS, clipboard: [...clipboard] } : null
  }
  return {
    definition,
    selection: pasted,
    announcement: pasted.length === 1 ? 'Eingefügt und ausgewählt.' : `${pasted.length} Elemente eingefügt.`,
    clipboard: next,
  }
}

function fitted(element: LayoutElement, width: number, height: number): LayoutElement {
  return {
    ...element,
    x: roundLength(clamp(element.x, 0, width - (element.width ?? MIN_ELEMENT_SIZE))),
    y: roundLength(clamp(element.y, 0, height - (element.height ?? MIN_ELEMENT_SIZE))),
  }
}
