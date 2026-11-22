import type {
  LayoutElement,
  LayoutSection,
  LayoutStyle,
  PrintLayoutDefinition,
  PrintLayoutFields,
} from '../lib/types'
import { isUnknownField, labelOfElement, labelOfSection } from './catalogue'
import { chosenColumnsOf, columnBudgetOf } from './columns'
import {
  childKey,
  COLOUR_PATTERN,
  containerOf,
  elementKey,
  elementRectOf,
  estimatedHeightOf,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FREE_HEIGHT_MAX,
  FREE_HEIGHT_MIN,
  ISSUER_UID_FIELDS,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  MAX_FREE_ELEMENTS,
  MAX_HEADING_LENGTH,
  MAX_IMAGES,
  MAX_PAGE_ELEMENTS,
  MAX_SECTIONS,
  MAX_TEXT_LENGTH,
  sectionKey,
  sectionOffsetOf,
  sectionWidthOf,
  SPACE_AFTER_MAX,
  totalsMinWidthOf,
  type ObjectKey,
  type ObjectRef,
} from './definition'
import { bottomOf, rightOf } from './geometry'
import {
  allowsPaymentPartAtBottom,
  contentWidthOf,
  CUSTOM_SIDE_MAX,
  CUSTOM_SIDE_MIN,
  MIN_CONTENT_WIDTH,
  MIN_FLOW_HEIGHT,
  paperSizeOf,
  PAYMENT_PART_HEIGHT,
  PAYMENT_PART_RESERVE,
} from './paper'
import { formatLengthShort } from './units'

/** What two lengths may differ by and still count as equal, the same as on the server. */
const TOLERANCE = 0.005

/** The input of the inspector a problem belongs to, so it can be shown at that field. */
export type ProblemField =
  | 'customWidth'
  | 'customHeight'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'flowTop'
  | 'paymentPart'
  | 'position'
  | 'width'
  | 'height'
  | 'fontSize'
  | 'lineWidth'
  | 'colour'
  | 'spaceAfter'
  | 'columns'
  | 'content'

/** Something about a form that will not be accepted, or that will print badly. */
export type Problem = {
  /** An error is refused by the server on save; a warning saves and prints, but not well. */
  severity: 'error' | 'warning'
  /** A German sentence that names the thing and says what is wrong. */
  message: string
  /** The page setup, or the key of the element or section. */
  target: 'page' | ObjectKey
  field?: ProblemField
}

/**
 * Checks a form the way the server will, and a little further.
 *
 * <p>The errors mirror the rules the backend refuses a save for, so nobody learns of them
 * only after pressing «Speichern»: paper and margins that leave no room, an element outside
 * what holds it, a field or a column nobody offers any more, a picture without a file. The
 * warnings are things the backend accepts but that print badly: columns that add up to more
 * than the table, a document without positions.
 *
 * @param definition the form
 * @param catalogue the fields and columns the server offers
 * @returns every problem found, the page first; empty when the form is fine
 */
export function validateDefinition(
  definition: PrintLayoutDefinition,
  catalogue: PrintLayoutFields,
): Problem[] {
  const problems: Problem[] = [...pageProblemsOf(definition)]

  definition.elements.forEach((element, index) => {
    const ref: ObjectRef = { kind: 'element', index }
    problems.push(...elementProblemsOf(definition, element, ref, elementKey(index), catalogue))
  })

  definition.flow.sections.forEach((section, index) => {
    problems.push(...sectionProblemsOf(definition, section, index, catalogue))
    if (section.type !== 'FREE') return
    section.elements.forEach((element, child) => {
      const ref: ObjectRef = { kind: 'child', section: index, index: child }
      problems.push(
        ...elementProblemsOf(definition, element, ref, childKey(index, child), catalogue),
      )
    })
  })

  problems.push(...capProblemsOf(definition), ...uidProblemsOf(definition))

  if (!definition.flow.sections.some((section) => section.type === 'POSITIONS')) {
    problems.push({
      severity: 'warning',
      target: 'page',
      message: 'Im Inhalt fehlen die Positionen: der Beleg druckt keine Zeilen.',
    })
  }
  return problems
}

/**
 * @param problems what {@link validateDefinition} found
 * @returns true when at least one of them keeps the form from being saved
 */
export function hasErrors(problems: readonly Problem[]): boolean {
  return problems.some((problem) => problem.severity === 'error')
}

/**
 * Picks the problems of one thing, optionally of one of its fields.
 *
 * @param problems what {@link validateDefinition} found
 * @param target the page setup or the key of an object
 * @param field the inspector field; left out, every problem of the target is returned
 * @returns the matching problems, errors first
 */
export function problemsFor(
  problems: readonly Problem[],
  target: 'page' | ObjectKey,
  field?: ProblemField,
): Problem[] {
  return problems
    .filter((problem) => problem.target === target)
    .filter((problem) => field === undefined || problem.field === field)
    .sort((first, second) => Number(second.severity === 'error') - Number(first.severity === 'error'))
}

/**
 * The caps on how much a form may hold, and the one section a form has only once.
 *
 * <p>Nobody reaches two hundred elements by design; whoever does has an accident on the sheet
 * — a key held down on «duplizieren» — and should hear of it before the server says so.
 */
function capProblemsOf(definition: PrintLayoutDefinition): Problem[] {
  const problems: Problem[] = []
  const error = (target: 'page' | ObjectKey, message: string) =>
    problems.push({ severity: 'error', target, message })
  const { elements, flow } = definition

  if (elements.length > MAX_PAGE_ELEMENTS) {
    error(
      'page',
      `Eine Vorlage fasst höchstens ${MAX_PAGE_ELEMENTS} feste Elemente; hier sind es ${elements.length}.`,
    )
  }
  if (flow.sections.length > MAX_SECTIONS) {
    error(
      'page',
      `Der Inhalt fasst höchstens ${MAX_SECTIONS} Abschnitte; hier sind es ${flow.sections.length}.`,
    )
  }
  let images = elements.filter((element) => element.type === 'IMAGE').length
  let totals = 0
  flow.sections.forEach((section, index) => {
    if (section.type === 'TOTALS') {
      totals += 1
      if (totals > 1) {
        error(
          sectionKey(index),
          'Totale gibt es nur einmal pro Vorlage. Einen der beiden Abschnitte löschen.',
        )
      }
    }
    if (section.type !== 'FREE') return
    images += section.elements.filter((element) => element.type === 'IMAGE').length
    if (section.elements.length > MAX_FREE_ELEMENTS) {
      error(
        sectionKey(index),
        `Ein freier Bereich fasst höchstens ${MAX_FREE_ELEMENTS} Elemente; hier sind es ${section.elements.length}.`,
      )
    }
  })
  if (images > MAX_IMAGES) {
    error('page', `Eine Vorlage fasst höchstens ${MAX_IMAGES} Bilder; hier sind es ${images}.`)
  }
  return problems
}

/**
 * The UID of the issuer under a payment part at the bottom of the page.
 *
 * <p>A Swiss invoice names the UID of who issued it (MWSTG Art. 26 Abs. 2 Bst. a). On the last
 * page, whatever repeats on every page and reaches into the bottom 105 mm gives way to the
 * payment part — and on a one-page invoice the first page is the last, so «Nur Seite 1» does
 * not help. Where the UID is printed only by such elements, a one-page invoice would come
 * out without it — the server refuses that, and so does the designer, at the setting that
 * causes it and at the element that could be moved.
 */
function uidProblemsOf(definition: PrintLayoutDefinition): Problem[] {
  if (definition.paymentPart !== 'LAST_PAGE_BOTTOM') return []
  const paper = paperSizeOf(definition.page)
  const strip = paper.height - PAYMENT_PART_HEIGHT
  const printsUid = (element: LayoutElement) =>
    element.type === 'FIELD' && element.field !== null && ISSUER_UID_FIELDS.includes(element.field)

  const inContent = definition.flow.sections.some(
    (section) => section.type === 'FREE' && section.elements.some(printsUid),
  )
  const onPage = definition.elements
    .map((element, index) => ({ element, key: elementKey(index) }))
    .filter(({ element }) => printsUid(element))
  if (inContent || onPage.length === 0) return []

  // «Nur Seite 1» does not save an element: on a one-page invoice the first page is the last.
  const givesWay = ({ element }: { element: LayoutElement }) =>
    element.y + estimatedHeightOf(element) > strip + TOLERANCE
  if (!onPage.every(givesWay)) return []

  const message =
    'Mit dem Zahlteil unten fehlt auf einer einseitigen Rechnung die UID: sie steht nur im ' +
    'untersten Streifen, der dort dem Zahlteil weicht. Das Element höher setzen oder die UID ' +
    'zusätzlich oben drucken.'
  return [
    { severity: 'error', target: 'page', field: 'paymentPart', message },
    ...onPage.map(({ key }): Problem => ({
      severity: 'error',
      target: key,
      field: 'position',
      message,
    })),
  ]
}

function pageProblemsOf(definition: PrintLayoutDefinition): Problem[] {
  const { page, flow } = definition
  const paper = paperSizeOf(page)
  const problems: Problem[] = []
  const error = (field: ProblemField, message: string) =>
    problems.push({ severity: 'error', target: 'page', field, message })

  if (page.format === 'CUSTOM') {
    const sides = [
      ['customWidth', 'Breite', page.customWidth],
      ['customHeight', 'Höhe', page.customHeight],
    ] as const
    for (const [field, name, value] of sides) {
      if (value === null || value < CUSTOM_SIDE_MIN || value > CUSTOM_SIDE_MAX) {
        error(
          field,
          `Die ${name} des eigenen Formats muss zwischen ${CUSTOM_SIDE_MIN} und ${CUSTOM_SIDE_MAX} mm liegen.`,
        )
      }
    }
  }

  const margins = [
    ['marginTop', 'oben', page.marginTop],
    ['marginRight', 'rechts', page.marginRight],
    ['marginBottom', 'unten', page.marginBottom],
    ['marginLeft', 'links', page.marginLeft],
  ] as const
  for (const [field, side, value] of margins) {
    if (value < 0) error(field, `Der Rand ${side} darf nicht negativ sein.`)
  }

  if (page.marginLeft + page.marginRight >= paper.width - MIN_CONTENT_WIDTH) {
    const left = Math.max(paper.width - page.marginLeft - page.marginRight, 0)
    error(
      'marginLeft',
      `Zwischen den Rändern links und rechts bleiben nur ${formatLengthShort(left)} mm; ` +
        `der Inhalt braucht mehr als ${MIN_CONTENT_WIDTH} mm.`,
    )
  }
  const following = paper.height - page.marginTop - page.marginBottom
  if (following < MIN_FLOW_HEIGHT) {
    error(
      'marginTop',
      `Zwischen den Rändern oben und unten bleiben nur ${formatLengthShort(Math.max(following, 0))} mm; ` +
        `der Inhalt braucht ${MIN_FLOW_HEIGHT} mm.`,
    )
  }
  if (flow.top < 0) {
    error('flowTop', 'Der Inhalt kann nicht oberhalb des Blatts beginnen.')
  } else if (paper.height - flow.top - page.marginBottom < MIN_FLOW_HEIGHT) {
    const room = Math.max(paper.height - flow.top - page.marginBottom, 0)
    error(
      'flowTop',
      `Auf Seite 1 bleiben für den Inhalt nur ${formatLengthShort(room)} mm; ` +
        `nötig sind ${MIN_FLOW_HEIGHT} mm. Den Inhalt weiter oben beginnen lassen.`,
    )
  }
  if (definition.paymentPart === 'LAST_PAGE_BOTTOM' && !allowsPaymentPartAtBottom(page)) {
    error(
      'paymentPart',
      'Der QR-Zahlteil passt nur auf A4 hoch unten auf die letzte Seite (210 mm breit, ' +
        'mindestens 297 mm hoch).',
    )
  } else if (
    definition.paymentPart === 'LAST_PAGE_BOTTOM' &&
    page.marginTop > paper.height - PAYMENT_PART_RESERVE + TOLERANCE
  ) {
    error(
      'marginTop',
      'Mit dem Zahlteil unten auf der letzten Seite darf der Rand oben höchstens ' +
        `${formatLengthShort(paper.height - PAYMENT_PART_RESERVE)} mm messen, sonst bleibt darüber kein Platz.`,
    )
  }
  return problems
}

function styleProblemsOf(
  style: LayoutStyle,
  name: string,
  target: ObjectKey,
  withLine: boolean,
): Problem[] {
  const problems: Problem[] = []
  const size = style.fontSize
  if (size !== null && size !== undefined && (size < FONT_SIZE_MIN || size > FONT_SIZE_MAX)) {
    problems.push({
      severity: 'error',
      target,
      field: 'fontSize',
      message: `${name}: Die Schriftgrösse muss zwischen ${FONT_SIZE_MIN} und ${FONT_SIZE_MAX} pt liegen.`,
    })
  }
  const line = style.lineWidth
  if (withLine && line !== null && line !== undefined && (line < LINE_WIDTH_MIN || line > LINE_WIDTH_MAX)) {
    problems.push({
      severity: 'error',
      target,
      field: 'lineWidth',
      message: `${name}: Die Linienstärke muss zwischen ${LINE_WIDTH_MIN} und ${LINE_WIDTH_MAX} pt liegen.`,
    })
  }
  const colour = style.colour
  if (colour !== null && colour !== undefined && !COLOUR_PATTERN.test(colour)) {
    problems.push({
      severity: 'error',
      target,
      field: 'colour',
      message: `${name}: Die Farbe muss als #rrggbb angegeben sein.`,
    })
  }
  return problems
}

function elementProblemsOf(
  definition: PrintLayoutDefinition,
  element: LayoutElement,
  ref: ObjectRef,
  key: ObjectKey,
  catalogue: PrintLayoutFields,
): Problem[] {
  const name = labelOfElement(element, catalogue)
  const problems = styleProblemsOf(element.style, name, key, element.type === 'LINE')
  const container = containerOf(definition, ref)
  const rect = elementRectOf(element, container)
  const frame = container.frame

  // The server refuses an element whose corner or whose box lies outside what holds it. Only
  // sizes the form names are judged: where the width runs to the margin or the height follows
  // the content, there is nothing stored that could reach too far.
  const holder =
    ref.kind === 'child'
      ? { named: 'der freie Bereich', over: 'den freien Bereich' }
      : { named: 'das Blatt', over: 'das Blatt' }
  const error = (field: ProblemField, message: string) =>
    problems.push({ severity: 'error', target: key, field, message })
  if (
    element.x < -TOLERANCE ||
    element.x > frame.width + TOLERANCE ||
    element.y < -TOLERANCE ||
    element.y > frame.height + TOLERANCE
  ) {
    error(
      'position',
      `${name} liegt ausserhalb: ${holder.named} misst ` +
        `${formatLengthShort(frame.width)} × ${formatLengthShort(frame.height)} mm.`,
    )
  } else if (element.width !== null && element.x + element.width > rightOf(frame) + TOLERANCE) {
    error(
      'width',
      `${name} ragt rechts über ${holder.over} hinaus ` +
        `(Platz: ${formatLengthShort(frame.width)} mm).`,
    )
  } else if (element.height !== null && bottomOf(rect) > bottomOf(frame) + TOLERANCE) {
    error(
      'height',
      `${name} ragt unten über ${holder.over} hinaus ` +
        `(Platz: ${formatLengthShort(frame.height)} mm).`,
    )
  }
  if ((element.text ?? '').length > MAX_TEXT_LENGTH) {
    error('content', `${name}: Der Text darf höchstens ${MAX_TEXT_LENGTH} Zeichen lang sein.`)
  }
  if (isUnknownField(element, catalogue)) {
    error(
      'content',
      element.field === null
        ? 'Dieses Feld ist mit keinem Wert verbunden. Ein Feld wählen oder das Element löschen.'
        : `Das Feld «${element.field}» gibt es nicht mehr. Ein anderes Feld wählen oder das Element löschen.`,
    )
  }
  if (element.type === 'IMAGE' && element.image === null) {
    error('content', 'Das Bild braucht eine Datei. Ein Bild wählen oder das Element löschen.')
  }
  return problems
}

function sectionProblemsOf(
  definition: PrintLayoutDefinition,
  section: LayoutSection,
  index: number,
  catalogue: PrintLayoutFields,
): Problem[] {
  const key = sectionKey(index)
  const name = labelOfSection(section)
  const problems: Problem[] = []
  const error = (field: ProblemField, message: string) =>
    problems.push({ severity: 'error', target: key, field, message })

  if (section.spaceAfter < 0 || section.spaceAfter > SPACE_AFTER_MAX) {
    error('spaceAfter', `${name}: Der Abstand danach muss zwischen 0 und ${SPACE_AFTER_MAX} mm liegen.`)
  }
  if (section.type === 'FREE') {
    const paper = paperSizeOf(definition.page)
    const pageRoom = paper.height - definition.page.marginTop - definition.page.marginBottom
    if (section.height < FREE_HEIGHT_MIN || section.height > FREE_HEIGHT_MAX) {
      error('height', `${name}: Die Höhe muss zwischen ${FREE_HEIGHT_MIN} und ${FREE_HEIGHT_MAX} mm liegen.`)
    } else if (section.height > pageRoom + TOLERANCE) {
      // A free section is never cut in two, so it has to fit between the margins of a page.
      error(
        'height',
        `${name} ist höher als der Platz zwischen den Rändern einer Seite ` +
          `(${formatLengthShort(Math.max(pageRoom, 0))} mm) und wird nicht über zwei Seiten geteilt.`,
      )
    }
    return problems
  }

  problems.push(...styleProblemsOf(section.style, name, key, false))
  const contentWidth = contentWidthOf(definition.page)
  const width = sectionWidthOf(section, contentWidth)
  const offset = sectionOffsetOf(section, contentWidth)
  const narrow = section.type === 'TOTALS' || section.type === 'VAT_SUMMARY'
  const least = totalsMinWidthOf(section.style.fontSize)
  if (narrow && width < least - TOLERANCE) {
    error(
      'width',
      `${name}: Die Breite muss mindestens ${formatLengthShort(least)} mm sein, sonst haben die Beträge keinen Platz.`,
    )
  }
  if (offset < 0) {
    error('position', `${name}: Der Einzug darf nicht negativ sein.`)
  } else if (width <= 0) {
    // An indent as wide as the content, with a width «up to the margin»: nothing is left.
    error(
      'width',
      `${name} passt nicht zwischen die Ränder: bei einem Einzug von ${formatLengthShort(offset)} mm ` +
        `bleibt keine Breite (Platz: ${formatLengthShort(contentWidth)} mm).`,
    )
  } else if (offset + width > contentWidth + TOLERANCE) {
    error(
      'width',
      `${name}: Einzug und Breite reichen über den rechten Rand hinaus ` +
        `(Platz: ${formatLengthShort(contentWidth)} mm).`,
    )
  }

  if (section.type === 'POSITIONS') {
    const chosen = chosenColumnsOf(section, catalogue.columns)
    const unknown = chosen.filter(
      (column) => !catalogue.columns.some((entry) => entry.code === column.code),
    )
    if (unknown.length > 0) {
      // Not the field `columns`: that one is the sum of the widths, which the configurator
      // shows itself. This has to be said above it.
      error(
        'content',
        unknown.length === 1
          ? `Die Spalte «${unknown[0].code}» gibt es nicht mehr. Bitte in der Spaltenliste abwählen.`
          : `${unknown.length} Spalten gibt es nicht mehr. Bitte in der Spaltenliste abwählen.`,
      )
    }
    const tooWide = chosen.find((column) => (column.widthMm ?? 0) > contentWidth + TOLERANCE)
    if (tooWide !== undefined) {
      error(
        'content',
        `Die Spalte «${tooWide.label ?? tooWide.code}» ist breiter als der Inhalt ` +
          `(${formatLengthShort(contentWidth)} mm).`,
      )
    }
    const long = chosen.find((column) => (column.label ?? '').length > MAX_HEADING_LENGTH)
    if (long !== undefined) {
      error(
        'content',
        `Die Überschrift der Spalte «${long.code}» darf höchstens ${MAX_HEADING_LENGTH} Zeichen lang sein.`,
      )
    }
    // Columns that do not fit the table are refused by the server; the sum is its rule.
    const budget = columnBudgetOf(chosen, catalogue.columns, width)
    if (budget.message !== null && (budget.tone === 'error' || budget.tone === 'warning')) {
      problems.push({
        severity: budget.tone,
        target: key,
        field: 'columns',
        message: budget.message,
      })
    }
  }
  return problems
}

/**
 * The sentence to show under one field of the inspector.
 *
 * @param problems what {@link validateDefinition} found
 * @param target the page setup or the key of an object
 * @param field the inspector field
 * @returns the first problem of that field, an error before a warning; `undefined` when the
 *   field is fine
 */
export function firstMessageFor(
  problems: readonly Problem[],
  target: 'page' | ObjectKey,
  field: ProblemField,
): string | undefined {
  return problemsFor(problems, target, field)[0]?.message
}
