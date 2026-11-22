import type { LayoutElement, PrintLayoutDefinition, PrintLayoutFields } from '../lib/types'
import { DEFAULT_PAGE, EMPTY_STYLE } from './definition'

/**
 * A form and a catalogue for the tests of the designer.
 *
 * <p>Close to the standard form a tenant starts from: a title, the number, the recipient and
 * a footer on the page; a header text, the positions, the totals and a free section with one
 * element in the content. Imported by tests only, never by the application.
 */

/** Builds a page element with everything a test does not care about filled in. */
export function element(overrides: Partial<LayoutElement> = {}): LayoutElement {
  return {
    type: 'TEXT',
    repeat: 'FIRST_PAGE',
    field: null,
    text: 'Text',
    image: null,
    x: 20,
    y: 20,
    width: 60,
    height: null,
    style: { ...EMPTY_STYLE },
    ...overrides,
  }
}

/** @returns a fresh copy of the sample form, so a test may change it freely */
export function sampleForm(): PrintLayoutDefinition {
  return {
    version: 2,
    page: { ...DEFAULT_PAGE },
    paymentPart: 'OWN_PAGE',
    elements: [
      element({
        type: 'FIELD',
        field: 'document.heading',
        text: null,
        x: 20,
        y: 78,
        width: 120,
        style: { ...EMPTY_STYLE, fontSize: 13, bold: true },
      }),
      element({ type: 'FIELD', field: 'document.number', text: 'Nr.', x: 130, y: 50, width: 60 }),
      element({ type: 'ADDRESS', field: 'recipient', text: null, x: 20, y: 45, width: 85, height: 35 }),
      element({
        type: 'TEXT',
        repeat: 'EVERY_PAGE',
        text: 'Muster AG · Bern',
        x: 20,
        y: 280,
        width: 100,
        height: 5,
      }),
    ],
    flow: {
      top: 103,
      sections: [
        {
          type: 'DOCUMENT_TEXT',
          field: 'header',
          x: 0,
          width: null,
          spaceAfter: 4,
          style: { ...EMPTY_STYLE },
        },
        {
          type: 'POSITIONS',
          x: 0,
          width: null,
          spaceAfter: 4,
          style: { ...EMPTY_STYLE },
          columns: [],
          showHeader: true,
          rowLines: true,
        },
        { type: 'TOTALS', x: 92, width: 78, spaceAfter: 4, style: { ...EMPTY_STYLE } },
        {
          type: 'FREE',
          height: 20,
          spaceAfter: 0,
          style: { ...EMPTY_STYLE },
          elements: [
            {
              type: 'TEXT',
              field: null,
              text: 'Besten Dank',
              image: null,
              x: 10,
              y: 5,
              width: 50,
              height: 5,
              style: { ...EMPTY_STYLE },
            },
          ],
        },
      ],
    },
  }
}

/** @returns a fresh copy of the sample catalogue, as `GET /fields` answers it */
export function sampleCatalogue(): PrintLayoutFields {
  return {
    fields: [
      { path: 'document.heading', label: 'Titel mit Nummer', group: 'Beleg', sample: 'Rechnung RE-2026-00042' },
      { path: 'document.number', label: 'Belegnummer', group: 'Beleg', sample: 'RE-2026-00042' },
      { path: 'document.date', label: 'Belegdatum', group: 'Beleg', sample: '21.11.2026' },
      { path: 'document.dueDate', label: 'Fällig am', group: 'Beleg', sample: '21.12.2026' },
      { path: 'totals.gross', label: 'Total brutto', group: 'Beträge', sample: '1’783.65' },
      { path: 'recipient.name', label: 'Name', group: 'Empfänger', sample: 'Muster AG' },
    ],
    columns: [
      { code: 'position', label: 'Pos', widthMm: 8, numeric: false, sample: '1' },
      { code: 'productNumber', label: 'Artikel', widthMm: 22, numeric: false, sample: 'P-100' },
      { code: 'description', label: 'Bezeichnung', widthMm: 0, numeric: false, sample: 'Hosting' },
      { code: 'quantity', label: 'Menge', widthMm: 18, numeric: true, sample: '2.00' },
      { code: 'unit', label: 'Einheit', widthMm: 13, numeric: false, sample: 'Std.' },
      { code: 'unitPrice', label: 'Preis', widthMm: 22, numeric: true, sample: '125.00' },
      { code: 'discountPercent', label: 'Rabatt %', widthMm: 14, numeric: true, sample: '' },
      { code: 'vatRate', label: 'MwSt', widthMm: 13, numeric: true, sample: '8.1' },
      { code: 'lineNet', label: 'Betrag', widthMm: 24, numeric: true, sample: '250.00' },
    ],
    formats: [
      { code: 'A4', label: 'A4', widthMm: 210, heightMm: 297 },
      { code: 'A5', label: 'A5', widthMm: 148, heightMm: 210 },
      { code: 'A3', label: 'A3', widthMm: 297, heightMm: 420 },
      { code: 'LETTER', label: 'Letter', widthMm: 215.9, heightMm: 279.4 },
      { code: 'LEGAL', label: 'Legal', widthMm: 215.9, heightMm: 355.6 },
    ],
    sample: {
      recipient: ['Muster AG', 'Frau Anna Muster', 'Bahnhofstrasse 1', '8000 Zürich'],
      issuer: ['Webux GmbH', 'Hauptstrasse 5', '3000 Bern'],
      headerText: 'Wir danken für Ihren Auftrag und stellen wie folgt in Rechnung.',
      footerText: 'Freundliche Grüsse',
      lines: [
        {
          kind: 'ITEM',
          cells: {
            position: '1',
            productNumber: 'P-100',
            description: 'Hosting Basic',
            quantity: '2.00',
            unit: 'Mt.',
            unitPrice: '125.00',
            discountPercent: '',
            vatRate: '8.1',
            lineNet: '250.00',
          },
          details: ['01.10.2026 – 30.11.2026'],
        },
        { kind: 'COMMENT', text: 'Leistungen im November' },
        { kind: 'SUBTOTAL', label: 'Zwischentotal', amount: '250.00' },
      ],
      totals: [
        { label: 'Total netto', amount: '1’650.00', kind: 'NET' },
        { label: 'MwSt 8.1% auf 1’650.00', amount: '133.65', kind: 'VAT' },
        { label: 'Total CHF', amount: '1’783.65', kind: 'GRAND' },
      ],
      paymentTerms: ['Zahlbar innert 30 Tagen netto'],
      discountStages: ['2% Skonto bis 01.12.2026: 1’747.98 CHF'],
      pageNumber: 'Seite 1 von 1',
    },
  }
}
