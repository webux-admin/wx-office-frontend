import { formatAmount, parseDecimal } from './format'
import type {
  CreditableInvoice,
  CreditableLine,
  CreditNoteBody,
  SalesDocument,
} from './types'

/**
 * The Gutschrift: its addresses, its cache keys and the rules of its dialog.
 *
 * <p>A Gutschrift is written from an issued invoice and nowhere else. The backend copies the
 * parties, the currency and — line by line — the VAT rate of the invoice, and holds every
 * Gutschrift against what the invoice still has per rate. Nothing of that is worked out here:
 * the dialog shows the figures of `creditable` and sends what was ticked and typed (backend
 * ADR-0155).
 */

/**
 * @param tenantId  the tenant
 * @param invoiceId the invoice
 * @returns what that invoice still has to give for a Gutschrift
 */
export function creditableUrl(tenantId: number, invoiceId: number): string {
  return `/api/tenants/${tenantId}/invoices/${invoiceId}/creditable`
}

/**
 * @param tenantId  the tenant
 * @param invoiceId the invoice
 * @returns its Gutschriften, and where a new one is written
 */
export function invoiceCreditNotesUrl(tenantId: number, invoiceId: number): string {
  return `/api/tenants/${tenantId}/invoices/${invoiceId}/credit-notes`
}

/**
 * @param tenantId     the tenant
 * @param creditNoteId the Gutschrift
 * @returns the address of that Gutschrift
 */
export function creditNoteUrl(tenantId: number, creditNoteId: number | string): string {
  return `/api/tenants/${tenantId}/credit-notes/${creditNoteId}`
}

/**
 * Where the Gutschriften of one invoice are cached.
 *
 * @param tenantId  the tenant
 * @param invoiceId the invoice; left out to reach those of every invoice
 */
export function invoiceCreditNotesKey(tenantId: number, invoiceId?: number): unknown[] {
  const key: unknown[] = ['invoice-credit-notes', tenantId]
  return invoiceId === undefined ? key : [...key, invoiceId]
}

/**
 * Where what one invoice still has to give is cached.
 *
 * @param tenantId  the tenant
 * @param invoiceId the invoice; left out to reach every invoice
 */
export function creditableKey(tenantId: number, invoiceId?: number): unknown[] {
  const key: unknown[] = ['invoice-creditable', tenantId]
  return invoiceId === undefined ? key : [...key, invoiceId]
}

/**
 * One line of the invoice in the Gutschrift dialog: ticked or not, and what is typed for it.
 *
 * <p>Quantity and price stay text while they are typed, so a half written «12,» is not thrown
 * away by a round trip through a number.
 */
export type CreditNoteRow = {
  line: CreditableLine
  selected: boolean
  quantity: string
  unitPrice: string
  description: string
}

/**
 * The rows the dialog starts with.
 *
 * <p>For a new Gutschrift nothing is ticked, and each row offers the proposal of the server:
 * what is left on the line, after the discount on the whole invoice, a rebate line, earlier
 * Gutschriften and write-offs. Ticked on every row, the proposals credit exactly what the
 * invoice has left (backend ADR-0156). For a draft that is being changed, the lines it already
 * carries are ticked with what they say, matched by the invoice line they came from.
 *
 * @param creditable what the invoice still has to give
 * @param draft      the draft Gutschrift being changed, left out for a new one
 * @returns one row per creditable line, in the order of the invoice
 */
export function creditNoteRowsOf(
  creditable: CreditableInvoice,
  draft?: SalesDocument,
): CreditNoteRow[] {
  return creditable.lines.map((line) => {
    const taken = draft?.lines?.find((candidate) => candidate.predecessorLineId === line.lineId)
    if (taken === undefined) {
      return {
        line,
        selected: false,
        quantity: String(line.proposedQuantity),
        unitPrice: String(line.proposedUnitPrice),
        description: '',
      }
    }
    return {
      line,
      selected: true,
      quantity: String(taken.quantity ?? line.proposedQuantity),
      unitPrice: String(taken.unitPrice ?? line.proposedUnitPrice),
      description: taken.description === line.description ? '' : (taken.description ?? ''),
    }
  })
}

/**
 * What is wrong with a ticked row, said so it can stand beside it.
 *
 * <p>Only the shape: a quantity and a price above zero. Whether the amount fits into what the
 * invoice has left is the backend's question, and its answer names the rate.
 *
 * @param row the row
 * @returns the message, `undefined` for a row that may be sent or one that is not ticked
 */
export function creditNoteRowError(row: CreditNoteRow): string | undefined {
  if (!row.selected) return undefined
  const quantity = parseDecimal(row.quantity)
  if (quantity === null || quantity <= 0) return 'Die Menge muss grösser als null sein.'
  const price = parseDecimal(row.unitPrice)
  if (price === null || price <= 0) return 'Der Preis muss grösser als null sein.'
  return undefined
}

/**
 * Whether the dialog may be sent: at least one row ticked, and none of them wrong.
 *
 * @param rows the rows of the dialog
 */
export function creditNoteRowsReady(rows: readonly CreditNoteRow[]): boolean {
  return rows.some((row) => row.selected)
    && rows.every((row) => creditNoteRowError(row) === undefined)
}

/**
 * Builds what `POST …/credit-notes` and `PUT /credit-notes/{id}` take.
 *
 * <p>Only the ticked rows, in the order of the invoice. An empty description is left out, so
 * the line keeps the text of the invoice line. Footer and reference are handed through
 * unchanged: the dialog does not edit them, and the backend replaces what it is sent.
 *
 * @param documentDate the date of the Gutschrift, as `yyyy-MM-dd`
 * @param headerText   the header text as typed
 * @param rows         the rows of the dialog
 * @param kept         footer and reference of a draft being changed, left out for a new one
 * @returns the body
 */
export function creditNoteBodyOf(
  documentDate: string,
  headerText: string,
  rows: readonly CreditNoteRow[],
  kept: { footerText?: string; reference?: string } = {},
): CreditNoteBody {
  const header = headerText.trim()
  return {
    documentDate,
    ...(header === '' ? {} : { headerText: header }),
    ...(kept.footerText === undefined ? {} : { footerText: kept.footerText }),
    ...(kept.reference === undefined ? {} : { reference: kept.reference }),
    lines: rows
      .filter((row) => row.selected)
      .map((row) => {
        const description = row.description.trim()
        return {
          invoiceLineId: row.line.lineId,
          quantity: parseDecimal(row.quantity) ?? 0,
          unitPrice: parseDecimal(row.unitPrice) ?? 0,
          ...(description === '' ? {} : { description }),
        }
      }),
  }
}

/**
 * The sentence above the rows: what the invoice still has to give, in its currency.
 *
 * <p>A write-off lowers what may be credited as much as a Gutschrift does, so where one stands
 * the sentence names it — otherwise «nothing left» would read as «credited in full» after a bad
 * debt (backend ADR-0156).
 *
 * @param creditable what the invoice still has to give
 * @returns for example «Noch gutschreibbar: 1’125.00 CHF von 1’250.00 CHF»
 */
export function creditableSentence(creditable: CreditableInvoice): string {
  const currency = creditable.currency
  const writtenOff = creditable.writtenOff > 0
    ? `${formatAmount(creditable.writtenOff)} ${currency} wurden ausgebucht oder abgezogen`
    : undefined
  if (creditable.remaining <= 0) {
    return writtenOff === undefined
      ? `Rechnung ${creditable.documentNumber} ist vollständig gutgeschrieben.`
      : `Rechnung ${creditable.documentNumber} gibt nichts mehr für eine Gutschrift her;`
        + ` ${writtenOff}.`
  }
  const sentence = `Noch gutschreibbar: ${formatAmount(creditable.remaining)} ${currency}`
    + ` von ${formatAmount(creditable.totalGross)} ${currency}`
  return writtenOff === undefined ? sentence : `${sentence}; ${writtenOff}`
}
