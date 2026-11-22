import type {
  FreeSection,
  LayoutAlign,
  LayoutColumn,
  LayoutElement,
  LayoutElementType,
  LayoutPage,
  LayoutRepeat,
  LayoutSection,
  LayoutSectionType,
  LayoutStyle,
  PaperFormat,
  PrintLayoutDefinition,
} from '../lib/types'
import { MIN_ELEMENT_SIZE, type Point, type Rect } from './geometry'
import {
  allowsPaymentPartAtBottom,
  contentWidthOf,
  MIN_FLOW_HEIGHT,
  paperSizeOf,
  type PageView,
} from './paper'
import { clamp, ptToMm, roundLength } from './units'

// --- limits and defaults, the same numbers the backend checks --------------------------

/** What the renderer uses where a style names no font size, in points. */
export const DEFAULT_FONT_SIZE = 9
export const FONT_SIZE_MIN = 5
export const FONT_SIZE_MAX = 72

/** Thickness of a line where its style names none, in points. */
export const DEFAULT_LINE_WIDTH = 0.4
export const LINE_WIDTH_MIN = 0.1
export const LINE_WIDTH_MAX = 5

/** The print colours of the renderer where a style names none. Data, not theme. */
export const DEFAULT_TEXT_COLOUR = '#000000'
export const DEFAULT_LINE_COLOUR = '#999999'

/** Gap below a section where it names none, and the most it may be. */
export const DEFAULT_SPACE_AFTER = 4
export const SPACE_AFTER_MAX = 50

/** Width of the totals and of the VAT summary where the section names none. */
export const TOTALS_WIDTH = 78

/** The narrowest the totals and the VAT summary may be at 9 pt: below it their rows no longer fit. */
const TOTALS_WIDTH_MIN = 60

/**
 * The narrowest a totals or VAT summary section may be at its font size.
 *
 * <p>The server's rule: 60 mm at the usual 9 pt, growing with the font, because a bigger font
 * makes «MwSt 8.1% auf …» and the amount beside it wider.
 *
 * @param fontSize font size of the section in points, none for the usual one
 * @returns the least width in millimetres
 */
export function totalsMinWidthOf(fontSize: number | null | undefined): number {
  return roundLength((TOTALS_WIDTH_MIN * (fontSize ?? DEFAULT_FONT_SIZE)) / DEFAULT_FONT_SIZE)
}

/** How much a form may hold — the caps the server enforces on save. */
export const MAX_PAGE_ELEMENTS = 200
export const MAX_SECTIONS = 50
export const MAX_FREE_ELEMENTS = 50
export const MAX_IMAGES = 10

/** The longest a text or a label in front of a value may be, in characters. */
export const MAX_TEXT_LENGTH = 2000

/** The longest a column heading may be, in characters. */
export const MAX_HEADING_LENGTH = 60

/** The fields that print the UID of the issuer, which a Swiss invoice has to show. */
export const ISSUER_UID_FIELDS: readonly string[] = ['issuer.uid', 'issuer.senderLine']

/** How high a free section may be. */
export const FREE_HEIGHT_MIN = 2
export const FREE_HEIGHT_MAX = 250
export const DEFAULT_FREE_HEIGHT = 20

/** Where the content starts on the first page of a form nobody has touched. */
export const DEFAULT_FLOW_TOP = 103

/** How far a copy is set off from its original, so both stay visible. */
export const DUPLICATE_OFFSET = 5

/** What a colour has to look like to reach the stylesheet of the renderer. */
export const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/

/** A style that names nothing: the renderer's defaults apply. */
export const EMPTY_STYLE: LayoutStyle = {
  fontSize: null,
  bold: false,
  italic: false,
  align: null,
  colour: null,
  lineWidth: null,
}

/** What a page starts with: A4 portrait with the margins of the standard form. */
export const DEFAULT_PAGE: LayoutPage = {
  format: 'A4',
  orientation: 'PORTRAIT',
  customWidth: null,
  customHeight: null,
  marginTop: 18,
  marginRight: 20,
  marginBottom: 22,
  marginLeft: 20,
}

const ELEMENT_TYPES: readonly LayoutElementType[] = [
  'TEXT',
  'FIELD',
  'IMAGE',
  'LINE',
  'ADDRESS',
  'PAGE_NUMBER',
]

const SECTION_TYPES: readonly LayoutSectionType[] = [
  'DOCUMENT_TEXT',
  'POSITIONS',
  'TOTALS',
  'VAT_SUMMARY',
  'PAYMENT_TERMS',
  'DISCOUNT_STAGES',
  'FREE',
]

const PAPER_FORMATS: readonly PaperFormat[] = ['A4', 'A5', 'A3', 'LETTER', 'LEGAL', 'CUSTOM']

const ALIGNMENTS: readonly LayoutAlign[] = ['left', 'right', 'center']

// --- addresses of the things on a form -------------------------------------------------

/**
 * Names one thing on a form: an element on the page, a section of the content, or an element
 * inside a free section.
 */
export type ObjectRef =
  | { kind: 'element'; index: number }
  | { kind: 'section'; index: number }
  | { kind: 'child'; section: number; index: number }

/**
 * An {@link ObjectRef} as one string — `e:3`, `s:1`, `c:1:0` — so a selection is a plain list
 * that compares and serialises without help.
 */
export type ObjectKey = string

/** @returns the key of a page element */
export function elementKey(index: number): ObjectKey {
  return `e:${index}`
}

/** @returns the key of a section */
export function sectionKey(index: number): ObjectKey {
  return `s:${index}`
}

/** @returns the key of an element inside a free section */
export function childKey(section: number, index: number): ObjectKey {
  return `c:${section}:${index}`
}

/**
 * @param ref the address
 * @returns its key
 */
export function keyOf(ref: ObjectRef): ObjectKey {
  if (ref.kind === 'element') return elementKey(ref.index)
  if (ref.kind === 'section') return sectionKey(ref.index)
  return childKey(ref.section, ref.index)
}

/**
 * Reads a key back into an address.
 *
 * @param key the key
 * @returns the address, or `null` when the text is not a key
 */
export function refOf(key: ObjectKey): ObjectRef | null {
  const parts = key.split(':')
  const numbers = parts.slice(1).map(Number)
  if (numbers.some((value) => !Number.isInteger(value) || value < 0)) return null
  if (parts[0] === 'e' && numbers.length === 1) return { kind: 'element', index: numbers[0] }
  if (parts[0] === 's' && numbers.length === 1) return { kind: 'section', index: numbers[0] }
  if (parts[0] === 'c' && numbers.length === 2) {
    return { kind: 'child', section: numbers[0], index: numbers[1] }
  }
  return null
}

/**
 * @param definition the form
 * @param index the place of the section in the flow
 * @returns the section if it is a free one, otherwise `undefined`
 */
export function freeSectionAt(
  definition: PrintLayoutDefinition,
  index: number,
): FreeSection | undefined {
  const section = definition.flow.sections[index]
  return section !== undefined && section.type === 'FREE' ? section : undefined
}

/**
 * Finds the element an address or a key names.
 *
 * @param definition the form
 * @param target the address or key of a page element or of an element in a free section
 * @returns the element, or `undefined` when the address names a section or nothing
 */
export function elementAt(
  definition: PrintLayoutDefinition,
  target: ObjectRef | ObjectKey,
): LayoutElement | undefined {
  const ref = typeof target === 'string' ? refOf(target) : target
  if (ref === null || ref.kind === 'section') return undefined
  if (ref.kind === 'element') return definition.elements[ref.index]
  return freeSectionAt(definition, ref.section)?.elements[ref.index]
}

/**
 * Finds the section a key names.
 *
 * @param definition the form
 * @param key the key of a section
 * @returns the section, or `undefined` when the key names an element or nothing
 */
export function sectionAt(
  definition: PrintLayoutDefinition,
  key: ObjectKey,
): LayoutSection | undefined {
  const ref = refOf(key)
  return ref?.kind === 'section' ? definition.flow.sections[ref.index] : undefined
}

/**
 * Whether a key still names something on the form.
 *
 * @param definition the form
 * @param key the key
 * @returns true when an element or a section stands at that address
 */
export function objectExists(definition: PrintLayoutDefinition, key: ObjectKey): boolean {
  return elementAt(definition, key) !== undefined || sectionAt(definition, key) !== undefined
}

/**
 * Lists every object in the order a person reads the page: what stands above the content,
 * the content with what its free sections hold, then what stands below.
 *
 * <p>This is the order the keyboard walks through. It is deliberately not the stored order,
 * which only says what is drawn over what.
 *
 * @param definition the form
 * @param view the page shown; on a following page only what repeats is listed
 * @returns the keys from top to bottom, left to right
 */
export function readingOrder(
  definition: PrintLayoutDefinition,
  view: PageView = 'first',
): ObjectKey[] {
  const byPosition = (
    first: { element: LayoutElement },
    second: { element: LayoutElement },
  ) => first.element.y - second.element.y || first.element.x - second.element.x

  const placed = definition.elements
    .map((element, index) => ({ element, key: elementKey(index) }))
    .filter(({ element }) => view === 'first' || repeatOf(element) === 'EVERY_PAGE')
    .sort(byPosition)
  if (view === 'following') return placed.map(({ key }) => key)

  const above = placed.filter(({ element }) => element.y < definition.flow.top)
  const below = placed.filter(({ element }) => element.y >= definition.flow.top)
  const flow = definition.flow.sections.flatMap((section, index) => {
    if (section.type !== 'FREE') return [sectionKey(index)]
    const children = section.elements
      .map((element, child) => ({ element, key: childKey(index, child) }))
      .sort(byPosition)
    return [sectionKey(index), ...children.map(({ key }) => key)]
  })
  return [...above.map(({ key }) => key), ...flow, ...below.map(({ key }) => key)]
}

// --- reading a stored form -------------------------------------------------------------

/**
 * A form with nothing on it, on the default page.
 *
 * @returns a fresh form; every call returns its own objects
 */
export function emptyDefinition(): PrintLayoutDefinition {
  return {
    version: 2,
    page: { ...DEFAULT_PAGE },
    paymentPart: 'OWN_PAGE',
    elements: [],
    flow: { top: DEFAULT_FLOW_TOP, sections: [] },
  }
}

/**
 * Brings whatever the server sent into the one shape the designer works on.
 *
 * <p>Every property is present afterwards, with `null` or its default where the form named
 * nothing, so two forms that mean the same also compare the same — which is what «ungespeicherte
 * Änderungen» relies on. Anything the designer does not know is dropped rather than carried
 * along: an element type from a newer backend, a page number inside a free section.
 *
 * @param raw the `definition` of a stored form, in whatever state it arrived
 * @returns a complete version 2 form; an empty one when there was nothing to read
 */
export function normalizeDefinition(raw: unknown): PrintLayoutDefinition {
  if (!isRecord(raw)) return emptyDefinition()
  const page = normalizePage(raw.page)
  const flow = isRecord(raw.flow) ? raw.flow : {}
  return {
    version: 2,
    page,
    paymentPart: raw.paymentPart === 'LAST_PAGE_BOTTOM' ? 'LAST_PAGE_BOTTOM' : 'OWN_PAGE',
    elements: listOf(raw.elements)
      .map((entry) => normalizeElement(entry, true))
      .filter((element) => element !== null),
    flow: {
      top: Math.max(numberOf(flow.top, DEFAULT_FLOW_TOP), 0),
      sections: listOf(flow.sections)
        .map(normalizeSection)
        .filter((section) => section !== null),
    },
  }
}

function normalizePage(raw: unknown): LayoutPage {
  if (!isRecord(raw)) return { ...DEFAULT_PAGE }
  const format = PAPER_FORMATS.find((entry) => entry === raw.format) ?? 'A4'
  return {
    format,
    orientation: raw.orientation === 'LANDSCAPE' ? 'LANDSCAPE' : 'PORTRAIT',
    customWidth: format === 'CUSTOM' ? positiveOrNull(raw.customWidth) : null,
    customHeight: format === 'CUSTOM' ? positiveOrNull(raw.customHeight) : null,
    marginTop: numberOf(raw.marginTop, DEFAULT_PAGE.marginTop),
    marginRight: numberOf(raw.marginRight, DEFAULT_PAGE.marginRight),
    marginBottom: numberOf(raw.marginBottom, DEFAULT_PAGE.marginBottom),
    marginLeft: numberOf(raw.marginLeft, DEFAULT_PAGE.marginLeft),
  }
}

function normalizeStyle(raw: unknown): LayoutStyle {
  if (!isRecord(raw)) return { ...EMPTY_STYLE }
  return {
    fontSize: positiveOrNull(raw.fontSize),
    bold: raw.bold === true,
    italic: raw.italic === true,
    align: ALIGNMENTS.find((entry) => entry === raw.align) ?? null,
    colour: typeof raw.colour === 'string' && raw.colour !== '' ? raw.colour : null,
    lineWidth: positiveOrNull(raw.lineWidth),
  }
}

function normalizeElement(raw: unknown, onPage: boolean): LayoutElement | null {
  if (!isRecord(raw)) return null
  const type = ELEMENT_TYPES.find((entry) => entry === raw.type)
  if (type === undefined) return null
  // A page number counts pages; inside the content it would have nothing to count.
  if (!onPage && type === 'PAGE_NUMBER') return null
  const element: LayoutElement = {
    type,
    field: textOrNull(raw.field),
    text: typeof raw.text === 'string' ? raw.text : null,
    image: textOrNull(raw.image),
    x: roundLength(numberOf(raw.x, 0)),
    y: roundLength(numberOf(raw.y, 0)),
    // Zero is a size, not «none»: a standing line is stored with a width of 0.
    width: notNegativeOrNull(raw.width),
    height: notNegativeOrNull(raw.height),
    style: normalizeStyle(raw.style),
  }
  // An address shows one of two parties; anything else is read as the recipient, which is
  // what the sheet would draw anyway and what the server accepts.
  if (type === 'ADDRESS') element.field = raw.field === 'issuer' ? 'issuer' : 'recipient'
  if (!onPage) return element
  const everyPage = type === 'PAGE_NUMBER' || raw.repeat === 'EVERY_PAGE'
  return { ...element, repeat: everyPage ? 'EVERY_PAGE' : 'FIRST_PAGE' }
}

function normalizeColumn(raw: unknown): LayoutColumn | null {
  if (!isRecord(raw) || typeof raw.code !== 'string' || raw.code === '') return null
  const width = raw.widthMm
  return {
    code: raw.code,
    widthMm: typeof width === 'number' && Number.isFinite(width) && width >= 0 ? width : null,
    label: textOrNull(raw.label),
    align: ALIGNMENTS.find((entry) => entry === raw.align) ?? null,
  }
}

function normalizeSection(raw: unknown): LayoutSection | null {
  if (!isRecord(raw)) return null
  const type = SECTION_TYPES.find((entry) => entry === raw.type)
  if (type === undefined) return null
  if (type === 'FREE') {
    return {
      type,
      height: numberOf(raw.height, DEFAULT_FREE_HEIGHT),
      spaceAfter: numberOf(raw.spaceAfter, DEFAULT_SPACE_AFTER),
      // The renderer writes it onto the box, and elements without a size of their own
      // inherit it. Kept, so a form does not lose it by being opened and saved.
      style: normalizeStyle(raw.style),
      elements: listOf(raw.elements)
        .map((entry) => normalizeElement(entry, false))
        .filter((element) => element !== null),
    }
  }
  const box = {
    // Left out, the section stands at the margin — or at the right one, for totals.
    x: typeof raw.x === 'number' && Number.isFinite(raw.x) ? roundLength(raw.x) : null,
    width: positiveOrNull(raw.width),
    spaceAfter: numberOf(raw.spaceAfter, DEFAULT_SPACE_AFTER),
    style: normalizeStyle(raw.style),
  }
  if (type === 'DOCUMENT_TEXT') {
    return { type, field: raw.field === 'footer' ? 'footer' : 'header', ...box }
  }
  if (type === 'POSITIONS') {
    return {
      type,
      ...box,
      columns: listOf(raw.columns)
        .map(normalizeColumn)
        .filter((column) => column !== null),
      showHeader: raw.showHeader !== false,
      rowLines: raw.rowLines !== false,
    }
  }
  return { type, ...box }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function notNegativeOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

// --- how big things are ----------------------------------------------------------------

/** The frame an element lives in and the line a width of `null` runs up to. */
export type ElementContainer = {
  /** The sheet for a page element, the box of the free section for a child. */
  frame: Rect
  /** The x a width of `null` ends at: the right margin. */
  rightLimit: number
}

/**
 * The frame that holds an element.
 *
 * @param definition the form
 * @param ref the address of the element
 * @returns the whole sheet for a page element, the free section for a child
 */
export function containerOf(definition: PrintLayoutDefinition, ref: ObjectRef): ElementContainer {
  const paper = paperSizeOf(definition.page)
  if (ref.kind === 'child') {
    const width = contentWidthOf(definition.page)
    const height = freeSectionAt(definition, ref.section)?.height ?? DEFAULT_FREE_HEIGHT
    return { frame: { x: 0, y: 0, width, height }, rightLimit: width }
  }
  return {
    frame: { x: 0, y: 0, width: paper.width, height: paper.height },
    rightLimit: paper.width - definition.page.marginRight,
  }
}

/**
 * Whether a line is drawn from top to bottom.
 *
 * <p>Mirrors `LayoutElement.liesFlat()` of the backend to the letter: a line lies when it has
 * no height, or when it has a width that is at least its height. Everything else stands — and
 * that includes a line with a height and <b>no</b> width: «up to the margin» is not a number
 * the renderer compares, so such a line runs down, not across.
 *
 * @param element a `LINE` element
 * @returns true for a standing line
 */
export function isVerticalLine(element: LayoutElement): boolean {
  const liesFlat =
    element.height === null || (element.width !== null && element.width >= element.height)
  return !liesFlat
}

/**
 * Guesses how high an element prints when it names no height.
 *
 * <p>Only a stand-in for where the browser cannot be asked: the real height is whatever the
 * content needs. Text counts its lines at 1.2 times the font size.
 *
 * @param element the element
 * @param lines how many lines its content has, where the caller knows
 * @returns a height in millimetres, never below what can still be grabbed
 */
export function estimatedHeightOf(element: LayoutElement, lines?: number): number {
  if (element.height !== null) return element.height
  if (element.type === 'LINE') return ptToMm(element.style.lineWidth ?? DEFAULT_LINE_WIDTH)
  if (element.type === 'IMAGE') return 20
  const count =
    lines ??
    (element.type === 'ADDRESS' ? 4 : Math.max((element.text ?? '').split('\n').length, 1))
  const lineHeight = ptToMm((element.style.fontSize ?? DEFAULT_FONT_SIZE) * 1.2)
  return roundLength(Math.max(count * lineHeight, MIN_ELEMENT_SIZE))
}

/**
 * The box an element takes up inside its container.
 *
 * @param element the element
 * @param container the frame it lives in
 * @param measuredHeight the height the browser drew it at, where known
 * @returns x, y, width and height in millimetres, with `null` sizes resolved
 */
export function elementRectOf(
  element: LayoutElement,
  container: ElementContainer,
  measuredHeight?: number,
): Rect {
  const toMargin = container.rightLimit - element.x
  const toEdge = container.frame.x + container.frame.width - element.x
  // An element standing in the right margin has no margin left to run up to; the edge of the
  // frame is the next best limit.
  const open = toMargin >= MIN_ELEMENT_SIZE ? toMargin : Math.max(toEdge, MIN_ELEMENT_SIZE)
  const measured = measuredHeight !== undefined && measuredHeight > 0 ? measuredHeight : undefined
  // A standing line is drawn as a box without width, whatever width the form stored for it.
  const standing = element.type === 'LINE' && isVerticalLine(element)
  return {
    x: element.x,
    y: element.y,
    width: standing ? 0 : (element.width ?? roundLength(open)),
    height: element.height ?? measured ?? estimatedHeightOf(element),
  }
}

/** Whether a section takes its place from the right while the form names none. */
function sitsRight(section: Exclude<LayoutSection, FreeSection>): boolean {
  return section.type === 'TOTALS' || section.type === 'VAT_SUMMARY'
}

/**
 * How wide a section is drawn — the rule of the renderer.
 *
 * @param section a section that is not a free one
 * @param contentWidth the width between the side margins
 * @returns its width in millimetres: its own, 78 mm for totals without one (less on paper
 *   narrower than that), or the rest of the content width from its indent
 */
export function sectionWidthOf(
  section: Exclude<LayoutSection, FreeSection>,
  contentWidth: number,
): number {
  if (section.width !== null) return section.width
  if (sitsRight(section)) {
    return section.x === null ? Math.min(TOTALS_WIDTH, contentWidth) : TOTALS_WIDTH
  }
  return Math.max(contentWidth - (section.x ?? 0), 0)
}

/**
 * Where a section starts, measured from the left margin — the rule of the renderer.
 *
 * @param section a section that is not a free one
 * @param contentWidth the width between the side margins
 * @returns its own indent; without one the margin, or for totals and the VAT summary the
 *   spot that puts their right edge on the right margin
 */
export function sectionOffsetOf(
  section: Exclude<LayoutSection, FreeSection>,
  contentWidth: number,
): number {
  if (section.x !== null) return section.x
  if (!sitsRight(section)) return 0
  return roundLength(Math.max(contentWidth - sectionWidthOf(section, contentWidth), 0))
}

/** The narrowest a section that runs up to the right margin may be squeezed by its indent. */
export const MIN_SECTION_WIDTH = 20

/**
 * How far a section may be indented.
 *
 * <p>A section with a width of its own may move until its right edge meets the margin. One
 * that runs up to the margin anyway only gets narrower, and stops at a width still worth
 * printing.
 *
 * @param section a section that is not a free one
 * @param contentWidth the width between the side margins
 * @returns the largest indent in millimetres, never negative
 */
export function maxIndentOf(
  section: Exclude<LayoutSection, FreeSection>,
  contentWidth: number,
): number {
  const open = section.width === null && !sitsRight(section)
  // The width a section would have at an indent of its own, not the one it has while it
  // stands at the right margin by default.
  const width = open ? MIN_SECTION_WIDTH : (section.width ?? TOTALS_WIDTH)
  return roundLength(Math.max(contentWidth - width, 0))
}

// --- new things ------------------------------------------------------------------------

/** @returns whether the element repeats on every page; a page number always does */
export function repeatOf(element: LayoutElement): LayoutRepeat {
  if (element.type === 'PAGE_NUMBER') return 'EVERY_PAGE'
  return element.repeat ?? 'FIRST_PAGE'
}

/**
 * Builds an element as the palette hands it out, at the origin of whatever will hold it.
 *
 * @param type what it draws
 * @param field the field it is bound to: a path for `FIELD`, `recipient` or `issuer` for
 *   `ADDRESS`; ignored for the other types
 * @returns a complete page element for the first page (every page for a page number)
 */
export function newElement(type: LayoutElementType, field?: string): LayoutElement {
  const base: LayoutElement = {
    type,
    repeat: type === 'PAGE_NUMBER' ? 'EVERY_PAGE' : 'FIRST_PAGE',
    field: null,
    text: null,
    image: null,
    x: 0,
    y: 0,
    width: 60,
    height: null,
    style: { ...EMPTY_STYLE },
  }
  switch (type) {
    case 'TEXT':
      return { ...base, text: 'Text' }
    case 'FIELD':
      return { ...base, field: field ?? null }
    case 'IMAGE':
      return { ...base, width: 40, height: 20 }
    case 'LINE':
      return { ...base, width: null }
    case 'ADDRESS':
      return { ...base, field: field === 'issuer' ? 'issuer' : 'recipient', width: 85, height: 35 }
    case 'PAGE_NUMBER':
      return {
        ...base,
        width: 40,
        style: { ...EMPTY_STYLE, fontSize: 7.5, align: 'right', colour: '#666666' },
      }
  }
}

/**
 * Builds a section as the palette hands it out.
 *
 * <p>Totals and the VAT summary start 78 mm wide and right aligned, which is where a Swiss
 * invoice has them; everything else spans the content width.
 *
 * @param type what it draws
 * @param field for `DOCUMENT_TEXT`: `header` or `footer`
 * @returns a complete section
 */
export function newSection(type: LayoutSectionType, field?: 'header' | 'footer'): LayoutSection {
  const box = { x: 0, width: null, spaceAfter: DEFAULT_SPACE_AFTER, style: { ...EMPTY_STYLE } }
  switch (type) {
    case 'FREE':
      return {
        type,
        height: DEFAULT_FREE_HEIGHT,
        spaceAfter: DEFAULT_SPACE_AFTER,
        style: { ...EMPTY_STYLE },
        elements: [],
      }
    case 'DOCUMENT_TEXT':
      return { type, field: field ?? 'header', ...box }
    case 'POSITIONS':
      return { type, ...box, columns: [], showHeader: true, rowLines: true }
    case 'TOTALS':
    case 'VAT_SUMMARY':
      // No indent and no width of their own: 78 mm at the right margin, and they stay there
      // when the paper or the margins change.
      return { type, ...box, x: null }
    default:
      return { type, ...box }
  }
}

/**
 * Where an element goes when it is added with a click instead of a drag.
 *
 * <p>At the top left corner of the margins, stepping down and right while that spot is taken,
 * so three clicks give three visible elements and not a pile. A page number goes where a page
 * number belongs: bottom right, inside the bottom margin.
 *
 * @param definition the form
 * @param element the element about to be added
 * @returns its position in millimetres from the top left corner of the paper
 */
export function defaultElementPosition(
  definition: PrintLayoutDefinition,
  element: LayoutElement,
): Point {
  const paper = paperSizeOf(definition.page)
  const { page } = definition
  if (element.type === 'PAGE_NUMBER') {
    const width = element.width ?? 40
    return {
      x: roundLength(Math.max(paper.width - page.marginRight - width, 0)),
      y: roundLength(Math.max(paper.height - page.marginBottom + 6, 0)),
    }
  }
  const taken = (point: Point) =>
    definition.elements.some(
      (other) => Math.abs(other.x - point.x) < 1 && Math.abs(other.y - point.y) < 1,
    )
  let point = { x: page.marginLeft, y: page.marginTop }
  for (let step = 0; step < 40 && taken(point); step++) {
    point = { x: point.x + DUPLICATE_OFFSET, y: point.y + DUPLICATE_OFFSET }
  }
  return {
    x: roundLength(clamp(point.x, 0, paper.width - (element.width ?? MIN_ELEMENT_SIZE))),
    y: roundLength(clamp(point.y, 0, paper.height - (element.height ?? MIN_ELEMENT_SIZE))),
  }
}

/** The order a Swiss document has its content in, used to place a section added by a click. */
const SECTION_RANK: Record<LayoutSectionType, number> = {
  DOCUMENT_TEXT: 0,
  POSITIONS: 1,
  TOTALS: 2,
  VAT_SUMMARY: 3,
  PAYMENT_TERMS: 4,
  DISCOUNT_STAGES: 5,
  FREE: 7,
}

function rankOf(section: LayoutSection): number {
  // The closing text of a document comes after everything else, the opening one before.
  if (section.type === 'DOCUMENT_TEXT' && section.field === 'footer') return 6
  return SECTION_RANK[section.type]
}

/**
 * Where a section goes when it is added with a click instead of a drag.
 *
 * <p>After the last section that usually precedes it — totals after the positions, the closing
 * text at the end. A free section goes below the selected section when there is one, because
 * «put something under this» is what it is for.
 *
 * @param definition the form
 * @param section the section about to be added
 * @param selected the index of the selected section, where one is selected
 * @returns the index to insert at
 */
export function defaultSectionIndex(
  definition: PrintLayoutDefinition,
  section: LayoutSection,
  selected?: number,
): number {
  const sections = definition.flow.sections
  if (section.type === 'FREE') {
    return selected !== undefined && selected < sections.length ? selected + 1 : sections.length
  }
  const rank = rankOf(section)
  let index = 0
  sections.forEach((existing, position) => {
    if (existing.type !== 'FREE' && rankOf(existing) <= rank) index = position + 1
  })
  return index
}

// --- changing a form: every operation returns a new one --------------------------------

/** A changed form together with the new address of what the change was about. */
export type Placed = { definition: PrintLayoutDefinition; key: ObjectKey }

function withSections(
  definition: PrintLayoutDefinition,
  sections: LayoutSection[],
): PrintLayoutDefinition {
  return { ...definition, flow: { ...definition.flow, sections } }
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((current, position) => (position === index ? value : current))
}

/**
 * Puts an element on the page, on top of what is already there.
 *
 * @param definition the form
 * @param element the element with its position on the paper
 * @returns the new form and the key of the element
 */
export function addElement(definition: PrintLayoutDefinition, element: LayoutElement): Placed {
  const placed: LayoutElement = { ...element, repeat: repeatOf(element) }
  return {
    definition: { ...definition, elements: [...definition.elements, placed] },
    key: elementKey(definition.elements.length),
  }
}

/**
 * Puts an element into a free section.
 *
 * <p>The element loses its `repeat`: inside the content it prints where the content is.
 *
 * @param definition the form
 * @param section the index of the free section
 * @param element the element with its position inside the section
 * @returns the new form and the key of the element, or `null` when there is no free section
 *   at that index or the element is a page number, which cannot live in the content
 */
export function addChild(
  definition: PrintLayoutDefinition,
  section: number,
  element: LayoutElement,
): Placed | null {
  const free = freeSectionAt(definition, section)
  if (free === undefined || element.type === 'PAGE_NUMBER') return null
  const child = withoutRepeat(element)
  return {
    definition: withSections(
      definition,
      replaceAt(definition.flow.sections, section, {
        ...free,
        elements: [...free.elements, child],
      }),
    ),
    key: childKey(section, free.elements.length),
  }
}

/** The same element without `repeat`, which only a page element carries. */
function withoutRepeat(element: LayoutElement): LayoutElement {
  return {
    type: element.type,
    field: element.field,
    text: element.text,
    image: element.image,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    style: element.style,
  }
}

/**
 * Changes properties of one element.
 *
 * @param definition the form
 * @param target the address or key of the element
 * @param change the properties to replace; `style` is merged, not replaced
 * @returns the new form, or the same one when the address names no element
 */
export function updateElement(
  definition: PrintLayoutDefinition,
  target: ObjectRef | ObjectKey,
  change: Partial<Omit<LayoutElement, 'style'>> & { style?: Partial<LayoutStyle> },
): PrintLayoutDefinition {
  const ref = typeof target === 'string' ? refOf(target) : target
  const current = ref === null ? undefined : elementAt(definition, ref)
  if (ref === null || ref.kind === 'section' || current === undefined) return definition
  const { style, ...rest } = change
  const next: LayoutElement = {
    ...current,
    ...rest,
    style: style === undefined ? current.style : { ...current.style, ...style },
  }
  if (ref.kind === 'element') {
    return { ...definition, elements: replaceAt(definition.elements, ref.index, next) }
  }
  const free = freeSectionAt(definition, ref.section)
  if (free === undefined) return definition
  return withSections(
    definition,
    replaceAt(definition.flow.sections, ref.section, {
      ...free,
      elements: replaceAt(free.elements, ref.index, next),
    }),
  )
}

/**
 * Moves an element to a spot inside its container.
 *
 * @param definition the form
 * @param target the address or key of the element
 * @param position the new top left corner, in the coordinates of its container
 * @returns the new form
 */
export function moveElement(
  definition: PrintLayoutDefinition,
  target: ObjectRef | ObjectKey,
  position: Point,
): PrintLayoutDefinition {
  return updateElement(definition, target, {
    x: roundLength(position.x),
    y: roundLength(position.y),
  })
}

/**
 * Gives an element a new box.
 *
 * <p>A side the element left open — a width up to the margin, a height after its content —
 * stays open unless `fix` names it: dragging the right grip fixes the width, not the height.
 *
 * @param definition the form
 * @param target the address or key of the element
 * @param rect the new box in the coordinates of its container
 * @param fix which sides become explicit numbers even if they were open
 * @returns the new form
 */
export function resizeElement(
  definition: PrintLayoutDefinition,
  target: ObjectRef | ObjectKey,
  rect: Rect,
  fix: { width: boolean; height: boolean } = { width: true, height: true },
): PrintLayoutDefinition {
  const current = elementAt(definition, target)
  if (current === undefined) return definition
  return updateElement(definition, target, {
    x: roundLength(rect.x),
    y: roundLength(rect.y),
    width: current.width === null && !fix.width ? null : roundLength(rect.width),
    height: current.height === null && !fix.height ? null : roundLength(rect.height),
  })
}

/**
 * Removes elements and sections.
 *
 * <p>A section takes the elements inside it along. Keys that name nothing are ignored.
 *
 * @param definition the form
 * @param keys what to remove
 * @returns the new form
 */
export function removeObjects(
  definition: PrintLayoutDefinition,
  keys: readonly ObjectKey[],
): PrintLayoutDefinition {
  const refs = keys.map(refOf).filter((ref) => ref !== null)
  if (refs.length === 0) return definition
  const elements = new Set(refs.filter((ref) => ref.kind === 'element').map((ref) => ref.index))
  const sections = new Set(refs.filter((ref) => ref.kind === 'section').map((ref) => ref.index))
  const children = new Set(
    refs.filter((ref) => ref.kind === 'child').map((ref) => childKey(ref.section, ref.index)),
  )
  return {
    ...definition,
    elements: definition.elements.filter((_, index) => !elements.has(index)),
    flow: {
      ...definition.flow,
      sections: definition.flow.sections
        .map((section, index) =>
          section.type !== 'FREE'
            ? section
            : section.elements.some((_, child) => children.has(childKey(index, child)))
              ? {
                  ...section,
                  elements: section.elements.filter(
                    (_, child) => !children.has(childKey(index, child)),
                  ),
                }
              : section,
        )
        .filter((_, index) => !sections.has(index)),
    },
  }
}

/**
 * Copies an element or a section next to itself.
 *
 * <p>An element lands a few millimetres down and to the right, kept inside its container; a
 * section lands directly below the original.
 *
 * @param definition the form
 * @param key what to copy
 * @returns the new form and the key of the copy, or `null` when the key names nothing
 */
export function duplicateObject(definition: PrintLayoutDefinition, key: ObjectKey): Placed | null {
  const ref = refOf(key)
  if (ref === null) return null
  if (ref.kind === 'section') {
    const section = definition.flow.sections[ref.index]
    if (section === undefined) return null
    return insertSection(definition, structuredClone(section), ref.index + 1)
  }
  const element = elementAt(definition, ref)
  if (element === undefined) return null
  const { frame } = containerOf(definition, ref)
  const copy: LayoutElement = {
    ...structuredClone(element),
    x: roundLength(
      clamp(element.x + DUPLICATE_OFFSET, frame.x, frame.width - (element.width ?? MIN_ELEMENT_SIZE)),
    ),
    y: roundLength(
      clamp(element.y + DUPLICATE_OFFSET, frame.y, frame.height - (element.height ?? MIN_ELEMENT_SIZE)),
    ),
  }
  return ref.kind === 'element' ? addElement(definition, copy) : addChild(definition, ref.section, copy)
}

/**
 * Takes an element out of a free section and fixes it on the page.
 *
 * @param definition the form
 * @param section the index of the free section
 * @param child the index of the element inside it
 * @param position where it goes, from the top left corner of the paper
 * @param repeat whether it prints on the first page or on every page
 * @returns the new form and the key of the element, or `null` when the address names nothing
 */
export function moveChildToPage(
  definition: PrintLayoutDefinition,
  section: number,
  child: number,
  position: Point,
  repeat: LayoutRepeat = 'FIRST_PAGE',
): Placed | null {
  const free = freeSectionAt(definition, section)
  const moved = free?.elements[child]
  if (free === undefined || moved === undefined) return null
  const paper = paperSizeOf(definition.page)
  const without = withSections(
    definition,
    replaceAt(definition.flow.sections, section, {
      ...free,
      elements: free.elements.filter((_, index) => index !== child),
    }),
  )
  return addElement(without, {
    ...moved,
    repeat,
    x: roundLength(clamp(position.x, 0, paper.width - (moved.width ?? MIN_ELEMENT_SIZE))),
    y: roundLength(clamp(position.y, 0, paper.height - (moved.height ?? MIN_ELEMENT_SIZE))),
  })
}

/**
 * Puts a section into the flow.
 *
 * @param definition the form
 * @param section the section
 * @param index where it goes; anything outside the list means the nearest end
 * @returns the new form and the key of the section
 */
export function insertSection(
  definition: PrintLayoutDefinition,
  section: LayoutSection,
  index: number,
): Placed {
  const sections = [...definition.flow.sections]
  const at = clamp(Math.round(index), 0, sections.length)
  sections.splice(at, 0, section)
  return { definition: withSections(definition, sections), key: sectionKey(at) }
}

/**
 * Moves a section to another place in the flow.
 *
 * @param definition the form
 * @param from the index of the section
 * @param to the index it should have afterwards
 * @returns the new form and the new key of the section; the same form when nothing moves
 */
export function moveSection(definition: PrintLayoutDefinition, from: number, to: number): Placed {
  const sections = [...definition.flow.sections]
  if (from < 0 || from >= sections.length) return { definition, key: sectionKey(from) }
  const target = clamp(Math.round(to), 0, sections.length - 1)
  if (target === from) return { definition, key: sectionKey(from) }
  const [moved] = sections.splice(from, 1)
  sections.splice(target, 0, moved)
  return { definition: withSections(definition, sections), key: sectionKey(target) }
}

/**
 * Changes properties of one section.
 *
 * <p>The type of a section never changes this way: a patch that names another type is applied
 * without it.
 *
 * @param definition the form
 * @param index the index of the section
 * @param change the properties to replace; `style` is merged, not replaced
 * @returns the new form, or the same one when there is no section at that index
 */
export function updateSection(
  definition: PrintLayoutDefinition,
  index: number,
  change: SectionChange,
): PrintLayoutDefinition {
  const current = definition.flow.sections[index]
  if (current === undefined) return definition
  const { style, ...rest } = change
  // The union keeps each kind of section to its own properties; a patch is checked by the
  // caller's types, and here it only has to be laid over the section it was built for.
  const merged = style !== undefined ? { style: { ...current.style, ...style } } : {}
  const next = { ...current, ...rest, ...merged, type: current.type } as LayoutSection
  return withSections(definition, replaceAt(definition.flow.sections, index, next))
}

/** What {@link updateSection} may change: any property a section can have, except its type. */
export type SectionChange = {
  x?: number | null
  width?: number | null
  spaceAfter?: number
  height?: number
  field?: 'header' | 'footer'
  columns?: LayoutColumn[]
  showHeader?: boolean
  rowLines?: boolean
  style?: Partial<LayoutStyle>
}

/**
 * Moves the line where the content starts on the first page.
 *
 * @param definition the form
 * @param top the new start in millimetres from the top of the paper
 * @returns the new form, with the start kept on the paper and above the least room the
 *   content needs
 */
export function setFlowTop(definition: PrintLayoutDefinition, top: number): PrintLayoutDefinition {
  const paper = paperSizeOf(definition.page)
  const lowest = Math.max(paper.height - definition.page.marginBottom - MIN_FLOW_HEIGHT, 0)
  return { ...definition, flow: { ...definition.flow, top: roundLength(clamp(top, 0, lowest)) } }
}

/**
 * Changes paper, orientation or margins, and fits everything else to the new sheet.
 *
 * <p>What would end up outside comes back in: elements are moved onto the paper, sections are
 * narrowed to the content width, and totals that stood at the right margin stay there. A QR
 * payment part at the bottom falls back to its own page on paper where SIX does not allow it.
 *
 * @param definition the form
 * @param change the page properties to replace
 * @returns the new form
 */
export function setPage(
  definition: PrintLayoutDefinition,
  change: Partial<LayoutPage>,
): PrintLayoutDefinition {
  const before = paperSizeOf(definition.page)
  const oldContentWidth = contentWidthOf(definition.page)
  let page: LayoutPage = { ...definition.page, ...change }
  if (page.format === 'CUSTOM') {
    // A custom format starts as the sheet it was switched from, so nothing jumps.
    page = {
      ...page,
      customWidth: page.customWidth ?? before.width,
      customHeight: page.customHeight ?? before.height,
    }
  } else {
    page = { ...page, customWidth: null, customHeight: null }
  }

  const paper = paperSizeOf(page)
  const contentWidth = contentWidthOf(page)
  const onSheet = (element: LayoutElement, width: number, height: number): LayoutElement => {
    const x = roundLength(clamp(element.x, 0, width - (element.width ?? MIN_ELEMENT_SIZE)))
    const y = roundLength(clamp(element.y, 0, height - (element.height ?? MIN_ELEMENT_SIZE)))
    return x === element.x && y === element.y ? element : { ...element, x, y }
  }

  const sections = definition.flow.sections.map((section): LayoutSection => {
    if (section.type === 'FREE') {
      const elements = section.elements.map((element) => onSheet(element, contentWidth, section.height))
      return elements.every((element, index) => element === section.elements[index])
        ? section
        : { ...section, elements }
    }
    const width = section.width === null ? null : Math.min(section.width, contentWidth)
    // Without an indent of its own the section finds its place by itself.
    if (section.x === null) return width === section.width ? section : { ...section, width }
    const oldWidth = sectionWidthOf(section, oldContentWidth)
    const atRightMargin = section.x > 0 && Math.abs(section.x + oldWidth - oldContentWidth) < 0.01
    const resized = { ...section, width }
    // The furthest the section may stand in: for one with a width of its own, until its right
    // edge meets the margin; for one that runs up to the margin, until 20 mm are left of it.
    // Without that limit an indent of 120 mm on A4 becomes a section without any width on A5.
    const furthest = maxIndentOf(resized, contentWidth)
    // Only a section with a width of its own can «stand at the right margin»; one that runs
    // up to it does so wherever it starts.
    const open = width === null && !sitsRight(section)
    const x = roundLength(
      atRightMargin && !open
        ? Math.max(contentWidth - sectionWidthOf(resized, contentWidth), 0)
        : clamp(section.x, 0, furthest),
    )
    return x === section.x && width === section.width ? section : { ...section, x, width }
  })

  // The start of the content is left where it is. Where the new margins leave it too little
  // room, the check of the form says so at the field — a line that moved by itself would be
  // the «where did it go» this designer is built to avoid.
  const fitted: PrintLayoutDefinition = {
    ...definition,
    page,
    paymentPart:
      definition.paymentPart === 'LAST_PAGE_BOTTOM' && !allowsPaymentPartAtBottom(page)
        ? 'OWN_PAGE'
        : definition.paymentPart,
    elements: definition.elements.map((element) => onSheet(element, paper.width, paper.height)),
    flow: { ...definition.flow, sections },
  }
  return fitted
}

/**
 * How far the lowest element of a free section reaches.
 *
 * @param section the free section
 * @returns the least height that still holds everything inside, never below the minimum
 */
export function freeContentHeightOf(section: FreeSection): number {
  const lowest = section.elements.map((element) => element.y + estimatedHeightOf(element))
  return roundLength(Math.max(FREE_HEIGHT_MIN, ...lowest))
}

/**
 * Which page of the sheet shows an element.
 *
 * @param element a page element
 * @param view the page shown
 * @returns true when the element prints on that page
 */
export function printsOn(element: LayoutElement, view: PageView): boolean {
  return view === 'first' || repeatOf(element) === 'EVERY_PAGE'
}

/** Largest picture a form may hold, in bytes — the same limit the backend refuses above. */
export const MAX_IMAGE_BYTES = 512 * 1024

/** The kinds of picture a form may hold. */
export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/**
 * The box a line needs to be drawn in a direction.
 *
 * <p>The renderer decides the direction from the box: along the width unless the box is
 * higher than wide. So a lying line has no height at all, and a standing one no width — it
 * runs down the left edge of its box.
 *
 * @param vertical whether the line runs from top to bottom
 * @param length how long it is in millimetres; `null` for a horizontal line that runs up to
 *   the right margin
 * @returns the width and height to store
 */
export function lineBoxFor(
  vertical: boolean,
  length: number | null,
): Pick<LayoutElement, 'width' | 'height'> {
  if (!vertical) return { width: length, height: null }
  return { width: 0, height: Math.max(length ?? DEFAULT_FREE_HEIGHT, MIN_ELEMENT_SIZE) }
}
