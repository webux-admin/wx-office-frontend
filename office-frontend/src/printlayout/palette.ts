import type {
  LayoutElement,
  LayoutElementType,
  LayoutSection,
  LayoutSectionType,
  PrintoutField,
} from '../lib/types'
import { DEFAULT_FONT_SIZE, estimatedHeightOf, newElement, newSection, TOTALS_WIDTH } from './definition'
import { ptToMm } from './units'

/** Something the palette hands out: an element to place, or a section of the content. */
export type PaletteItem =
  | {
      kind: 'element'
      id: string
      type: LayoutElementType
      /** A field path for `FIELD`, `recipient` or `issuer` for `ADDRESS`. */
      field?: string
      label: string
      description: string
    }
  | {
      kind: 'section'
      id: string
      type: LayoutSectionType
      /** For `DOCUMENT_TEXT`: which of the two texts. */
      field?: 'header' | 'footer'
      label: string
      description: string
    }

/** What can be placed anywhere on the sheet. Fields have a list of their own. */
export const ELEMENT_ITEMS: readonly PaletteItem[] = [
  {
    kind: 'element',
    id: 'text',
    type: 'TEXT',
    label: 'Text',
    description: 'Ein fester Text, auf jedem Beleg gleich.',
  },
  {
    kind: 'element',
    id: 'image',
    type: 'IMAGE',
    label: 'Bild / Logo',
    description: 'Ihr Logo oder ein anderes Bild.',
  },
  {
    kind: 'element',
    id: 'line',
    type: 'LINE',
    label: 'Linie',
    description: 'Eine waagrechte oder senkrechte Trennlinie.',
  },
  {
    kind: 'element',
    id: 'address-recipient',
    type: 'ADDRESS',
    field: 'recipient',
    label: 'Adresse Empfänger',
    description: 'Die Anschrift des Kunden, passend fürs Fenstercouvert.',
  },
  {
    kind: 'element',
    id: 'address-issuer',
    type: 'ADDRESS',
    field: 'issuer',
    label: 'Adresse Absender',
    description: 'Ihre eigene Anschrift.',
  },
  {
    kind: 'element',
    id: 'page-number',
    type: 'PAGE_NUMBER',
    label: 'Seitenzahl',
    description: '«Seite 1 von 3», auf jeder Seite.',
  },
]

/** What grows with the document and is stacked in the content. */
export const SECTION_ITEMS: readonly PaletteItem[] = [
  {
    kind: 'section',
    id: 'positions',
    type: 'POSITIONS',
    label: 'Positionen',
    description: 'Die Tabelle mit den Zeilen des Belegs.',
  },
  {
    kind: 'section',
    id: 'totals',
    type: 'TOTALS',
    label: 'Totale',
    description: 'Netto, MwSt und Gesamtbetrag.',
  },
  {
    kind: 'section',
    id: 'vat-summary',
    type: 'VAT_SUMMARY',
    label: 'MwSt-Aufstellung',
    description: 'Die MwSt je Satz, getrennt von den Totalen.',
  },
  {
    kind: 'section',
    id: 'payment-terms',
    type: 'PAYMENT_TERMS',
    label: 'Zahlungskondition',
    description: 'Zahlbar bis, Leistungsdatum.',
  },
  {
    kind: 'section',
    id: 'discount-stages',
    type: 'DISCOUNT_STAGES',
    label: 'Skontostaffeln',
    description: 'Skonto je Frist mit dem Betrag.',
  },
  {
    kind: 'section',
    id: 'text-header',
    type: 'DOCUMENT_TEXT',
    field: 'header',
    label: 'Belegtext (Kopf)',
    description: 'Der Einleitungstext des Belegs.',
  },
  {
    kind: 'section',
    id: 'text-footer',
    type: 'DOCUMENT_TEXT',
    field: 'footer',
    label: 'Belegtext (Fuss)',
    description: 'Der Schlusstext des Belegs.',
  },
  {
    kind: 'section',
    id: 'free',
    type: 'FREE',
    label: 'Freier Bereich',
    description: 'Platz im Inhalt für eigene Elemente oder als Abstand.',
  },
]

/**
 * Turns a field of the catalogue into something the palette can hand out.
 *
 * @param field the field
 * @returns a palette item that places a `FIELD` element bound to it
 */
export function fieldItem(field: PrintoutField): PaletteItem {
  return {
    kind: 'element',
    id: `field:${field.path}`,
    type: 'FIELD',
    field: field.path,
    label: field.label,
    description: field.sample,
  }
}

/**
 * Builds the element a palette item stands for.
 *
 * @param item an item of kind `element`
 * @returns the element at the origin, ready to be placed
 */
export function elementFor(item: Extract<PaletteItem, { kind: 'element' }>): LayoutElement {
  return newElement(item.type, item.field)
}

/**
 * Builds the section a palette item stands for.
 *
 * @param item an item of kind `section`
 * @returns the section, ready to be inserted
 */
export function sectionFor(item: Extract<PaletteItem, { kind: 'section' }>): LayoutSection {
  return newSection(item.type, item.field)
}

/**
 * How large the ghost is that follows the pointer while an item is dragged.
 *
 * <p>The real size of what will land, so the person sees how much room it takes before
 * letting go.
 *
 * @param item the dragged item
 * @param contentWidth the width between the side margins
 * @returns width and height in millimetres
 */
export function ghostSizeOf(item: PaletteItem, contentWidth: number): { width: number; height: number } {
  if (item.kind === 'section') {
    const narrow = item.type === 'TOTALS' || item.type === 'VAT_SUMMARY'
    return { width: narrow ? Math.min(TOTALS_WIDTH, contentWidth) : contentWidth, height: 12 }
  }
  const element = elementFor(item)
  const line = ptToMm(DEFAULT_FONT_SIZE * 1.2)
  return {
    width: element.width ?? contentWidth,
    height: element.type === 'LINE' ? 1 : Math.max(estimatedHeightOf(element), line),
  }
}
