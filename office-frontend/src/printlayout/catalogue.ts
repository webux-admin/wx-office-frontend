import type {
  LayoutElement,
  LayoutElementType,
  LayoutSection,
  LayoutSectionType,
  PrintLayoutDefinition,
  PrintLayoutFields,
  PrintoutColumn,
  PrintoutField,
  PrintoutFormat,
  PrintoutSample,
  PrintoutSampleLine,
  PrintoutSampleTotal,
} from '../lib/types'
import {
  childKey,
  elementAt,
  elementKey,
  sectionAt,
  type ObjectKey,
} from './definition'
import { PAPER_SIZES } from './paper'

/** What each kind of placed element is called. */
export const ELEMENT_LABELS: Record<LayoutElementType, string> = {
  TEXT: 'Text',
  FIELD: 'Feld',
  IMAGE: 'Bild',
  LINE: 'Linie',
  ADDRESS: 'Adresse',
  PAGE_NUMBER: 'Seitenzahl',
}

/** What each kind of section is called. */
const SECTION_LABELS: Record<LayoutSectionType, string> = {
  DOCUMENT_TEXT: 'Belegtext',
  POSITIONS: 'Positionen',
  TOTALS: 'Totale',
  VAT_SUMMARY: 'MwSt-Aufstellung',
  PAYMENT_TERMS: 'Zahlungskondition',
  DISCOUNT_STAGES: 'Skontostaffeln',
  FREE: 'Freier Bereich',
}

/** What is said in place of a field the catalogue no longer knows. */
export const UNKNOWN_FIELD_LABEL = 'Unbekanntes Feld'

/**
 * The print colours the inspector offers as swatches. Data of the form, not of the theme:
 * they look the same on paper whatever the screen is set to.
 */
export const PRINT_COLOURS: readonly { value: string; label: string }[] = [
  { value: '#000000', label: 'Schwarz' },
  { value: '#333333', label: 'Anthrazit' },
  { value: '#666666', label: 'Grau' },
  { value: '#999999', label: 'Hellgrau' },
  { value: '#1e4d3f', label: 'Dunkelgrün' },
  { value: '#1f3a5f', label: 'Dunkelblau' },
  { value: '#8c3023', label: 'Dunkelrot' },
]

/** The named formats, for a catalogue that offers none. */
const BUILT_IN_FORMATS: readonly PrintoutFormat[] = [
  { code: 'A4', label: 'A4', widthMm: PAPER_SIZES.A4.width, heightMm: PAPER_SIZES.A4.height },
  { code: 'A5', label: 'A5', widthMm: PAPER_SIZES.A5.width, heightMm: PAPER_SIZES.A5.height },
  { code: 'A3', label: 'A3', widthMm: PAPER_SIZES.A3.width, heightMm: PAPER_SIZES.A3.height },
  {
    code: 'LETTER',
    label: 'Letter',
    widthMm: PAPER_SIZES.LETTER.width,
    heightMm: PAPER_SIZES.LETTER.height,
  },
  {
    code: 'LEGAL',
    label: 'Legal',
    widthMm: PAPER_SIZES.LEGAL.width,
    heightMm: PAPER_SIZES.LEGAL.height,
  },
]

/** A sample document that says nothing, for a catalogue that brings none. */
export const EMPTY_SAMPLE: PrintoutSample = {
  recipient: [],
  issuer: [],
  headerText: '',
  footerText: '',
  lines: [],
  totals: [],
  paymentTerms: [],
  discountStages: [],
  pageNumber: 'Seite 1 von 1',
}

/**
 * Brings the catalogue of the server into a complete shape.
 *
 * <p>The designer draws from it on every pointer move, so nothing in it may be missing: a
 * field without a sample gets an empty one, a catalogue without formats gets the named ones,
 * and an entry that is not usable at all is left out.
 *
 * @param raw what `GET /fields` answered
 * @returns a complete catalogue, empty lists where there was nothing to read
 */
export function normalizeCatalogue(raw: unknown): PrintLayoutFields {
  const source = isRecord(raw) ? raw : {}
  const formats = listOf(source.formats)
    .map(formatOf)
    .filter((format) => format !== null)
  return {
    fields: listOf(source.fields)
      .map(fieldOf)
      .filter((field) => field !== null),
    columns: listOf(source.columns)
      .map(columnOf)
      .filter((column) => column !== null),
    formats: formats.length > 0 ? formats : [...BUILT_IN_FORMATS],
    sample: sampleOf(source.sample),
  }
}

function fieldOf(raw: unknown): PrintoutField | null {
  if (!isRecord(raw) || typeof raw.path !== 'string' || raw.path === '') return null
  return {
    path: raw.path,
    label: textOf(raw.label, raw.path),
    group: textOf(raw.group, 'Weitere'),
    sample: textOf(raw.sample, ''),
  }
}

function columnOf(raw: unknown): PrintoutColumn | null {
  if (!isRecord(raw) || typeof raw.code !== 'string' || raw.code === '') return null
  return {
    code: raw.code,
    label: textOf(raw.label, raw.code),
    widthMm: typeof raw.widthMm === 'number' && raw.widthMm >= 0 ? raw.widthMm : 0,
    numeric: raw.numeric === true,
    sample: textOf(raw.sample, ''),
  }
}

function formatOf(raw: unknown): PrintoutFormat | null {
  if (!isRecord(raw)) return null
  const built = BUILT_IN_FORMATS.find((format) => format.code === raw.code)
  if (built === undefined) return null
  return {
    code: built.code,
    label: textOf(raw.label, built.label),
    widthMm: typeof raw.widthMm === 'number' ? raw.widthMm : built.widthMm,
    heightMm: typeof raw.heightMm === 'number' ? raw.heightMm : built.heightMm,
  }
}

function sampleOf(raw: unknown): PrintoutSample {
  if (!isRecord(raw)) return { ...EMPTY_SAMPLE }
  return {
    recipient: textsOf(raw.recipient),
    issuer: textsOf(raw.issuer),
    headerText: textOf(raw.headerText, ''),
    footerText: textOf(raw.footerText, ''),
    lines: listOf(raw.lines)
      .map(lineOf)
      .filter((line) => line !== null),
    totals: listOf(raw.totals)
      .map(totalOf)
      .filter((total) => total !== null),
    paymentTerms: textsOf(raw.paymentTerms),
    discountStages: textsOf(raw.discountStages),
    pageNumber: textOf(raw.pageNumber, EMPTY_SAMPLE.pageNumber),
  }
}

function lineOf(raw: unknown): PrintoutSampleLine | null {
  if (!isRecord(raw)) return null
  if (raw.kind === 'COMMENT') return { kind: 'COMMENT', text: textOf(raw.text, '') }
  if (raw.kind === 'SUBTOTAL') {
    return { kind: 'SUBTOTAL', label: textOf(raw.label, ''), amount: textOf(raw.amount, '') }
  }
  if (raw.kind !== 'ITEM') return null
  const cells: Record<string, string> = {}
  if (isRecord(raw.cells)) {
    for (const [code, value] of Object.entries(raw.cells)) cells[code] = textOf(value, '')
  }
  return { kind: 'ITEM', cells, details: textsOf(raw.details) }
}

function totalOf(raw: unknown): PrintoutSampleTotal | null {
  if (!isRecord(raw)) return null
  const kinds: readonly PrintoutSampleTotal['kind'][] = ['SUBTOTAL', 'DISCOUNT', 'NET', 'VAT', 'GRAND']
  const kind = kinds.find((entry) => entry === raw.kind) ?? 'NET'
  return { label: textOf(raw.label, ''), amount: textOf(raw.amount, ''), kind }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function textsOf(value: unknown): string[] {
  return listOf(value).filter((entry) => typeof entry === 'string')
}

/**
 * Looks a field up by its path.
 *
 * @param catalogue the catalogue
 * @param path the path a `FIELD` element is bound to
 * @returns the field, or `undefined` when the catalogue does not know the path
 */
export function fieldByPath(
  catalogue: Pick<PrintLayoutFields, 'fields'>,
  path: string | null,
): PrintoutField | undefined {
  if (path === null) return undefined
  return catalogue.fields.find((field) => field.path === path)
}

/**
 * Whether an element is bound to a field the catalogue does not offer.
 *
 * <p>Such an element stays on the form and prints nothing; the designer marks it instead of
 * dropping it, so the person can rebind or remove it knowingly.
 *
 * @param element the element
 * @param catalogue the catalogue
 * @returns true for a `FIELD` element without a known path
 */
export function isUnknownField(
  element: LayoutElement,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): boolean {
  return element.type === 'FIELD' && fieldByPath(catalogue, element.field) === undefined
}

/**
 * What a text, a field or a page number prints on the sample document.
 *
 * <p>A field prints its value with its label in front, the way the renderer joins them: the
 * label alone where the value is empty, the value alone where there is no label.
 *
 * @param element the element
 * @param catalogue the catalogue with the sample values
 * @returns the text on the sheet; empty for elements that draw no text
 */
export function sampleTextOf(element: LayoutElement, catalogue: PrintLayoutFields): string {
  if (element.type === 'TEXT') return element.text ?? ''
  if (element.type === 'PAGE_NUMBER') return catalogue.sample.pageNumber
  if (element.type !== 'FIELD') return ''
  const field = fieldByPath(catalogue, element.field)
  const label = (element.text ?? '').trim()
  const value = field === undefined ? UNKNOWN_FIELD_LABEL : field.sample
  if (label === '') return value
  return value === '' ? label : `${label} ${value}`
}

/**
 * The lines an address element prints on the sample document.
 *
 * @param element an `ADDRESS` element
 * @param catalogue the catalogue with the sample addresses
 * @returns the address of the issuer or of the recipient, one entry per line
 */
export function sampleAddressOf(element: LayoutElement, catalogue: PrintLayoutFields): string[] {
  return element.field === 'issuer' ? catalogue.sample.issuer : catalogue.sample.recipient
}

/**
 * What an element is called in the outline, the inspector and an announcement.
 *
 * @param element the element
 * @param catalogue the catalogue, for the name of a field
 * @returns for example `Belegnummer`, `Text «Rechnung»` or `Adresse Empfänger`
 */
export function labelOfElement(
  element: LayoutElement,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): string {
  switch (element.type) {
    case 'TEXT': {
      const text = (element.text ?? '').trim().replace(/\s+/g, ' ')
      if (text === '') return 'Text'
      return `Text «${text.length > 24 ? `${text.slice(0, 24)}…` : text}»`
    }
    case 'FIELD':
      return fieldByPath(catalogue, element.field)?.label ?? UNKNOWN_FIELD_LABEL
    case 'ADDRESS':
      return element.field === 'issuer' ? 'Adresse Absender' : 'Adresse Empfänger'
    default:
      return ELEMENT_LABELS[element.type]
  }
}

/**
 * What a section is called.
 *
 * @param section the section
 * @returns for example `Positionen` or `Belegtext (Fuss)`
 */
export function labelOfSection(section: LayoutSection): string {
  if (section.type === 'DOCUMENT_TEXT') {
    return section.field === 'footer' ? 'Belegtext (Fuss)' : 'Belegtext (Kopf)'
  }
  return SECTION_LABELS[section.type]
}

/**
 * What the thing behind a key is called.
 *
 * @param definition the form
 * @param key the key of an element or a section
 * @param catalogue the catalogue, for the name of a field
 * @returns its name, or an empty string when the key names nothing
 */
export function labelOfObject(
  definition: PrintLayoutDefinition,
  key: ObjectKey,
  catalogue: Pick<PrintLayoutFields, 'fields'>,
): string {
  const element = elementAt(definition, key)
  if (element !== undefined) return labelOfElement(element, catalogue)
  const section = sectionAt(definition, key)
  return section === undefined ? '' : labelOfSection(section)
}

/**
 * Finds the fields that are already on the form.
 *
 * @param definition the form
 * @returns for each used path the key of the first element bound to it
 */
export function usedFieldKeys(definition: PrintLayoutDefinition): Map<string, ObjectKey> {
  const used = new Map<string, ObjectKey>()
  const note = (element: LayoutElement, key: ObjectKey) => {
    if (element.type !== 'FIELD' || element.field === null || used.has(element.field)) return
    used.set(element.field, key)
  }
  definition.elements.forEach((element, index) => note(element, elementKey(index)))
  definition.flow.sections.forEach((section, index) => {
    if (section.type !== 'FREE') return
    section.elements.forEach((element, child) => note(element, childKey(index, child)))
  })
  return used
}

/**
 * Filters the fields by what somebody typed and groups what is left.
 *
 * <p>The term is looked for in the label and in the sample value: people search for what they
 * see on their invoice — «RE-2026» — as often as for what it is called.
 *
 * @param fields the fields of the catalogue
 * @param term what was typed; blank keeps everything
 * @returns the groups in the order of the catalogue, each with its matching fields
 */
export function searchFields(
  fields: readonly PrintoutField[],
  term: string,
): { group: string; fields: PrintoutField[] }[] {
  const wanted = term.trim().toLocaleLowerCase('de-CH')
  const groups: { group: string; fields: PrintoutField[] }[] = []
  for (const field of fields) {
    const matches =
      wanted === '' ||
      field.label.toLocaleLowerCase('de-CH').includes(wanted) ||
      field.sample.toLocaleLowerCase('de-CH').includes(wanted)
    if (!matches) continue
    const group = groups.find((entry) => entry.group === field.group)
    if (group === undefined) groups.push({ group: field.group, fields: [field] })
    else group.fields.push(field)
  }
  return groups
}
