import type { BadgeTone } from '../components/Badge'
import type { MessageStatus, SmtpSecurity } from './types'

/**
 * Addresses, rights and wording of the outbox.
 *
 * <p>Its own building block rather than paths typed into the screens: four masks and a dialog
 * read the same endpoints, and a query key written twice is a cache that goes stale in one of
 * them — the same reasoning `modules.ts` was written for.
 */

/**
 * The rights that guard the outbox, as
 * {@code ch.webux.office.user.Permission} spells them.
 *
 * <p>Three, not one: looking at what went out, sending, and setting the account up are
 * different responsibilities. Whoever may send an invoice does not thereby decide which
 * server it goes through (backend ADR-0082).
 */
export const OUTBOX_RIGHTS = {
  read: 'OUTBOX_READ',
  send: 'OUTBOX_SEND',
  configure: 'OUTBOX_CONFIGURE',
} as const

/**
 * The module the outbox belongs to, as the backend `LicensedModule` spells it.
 *
 * <p>Every screen of the outbox and the send entry on the document carry it: a tenant that
 * does not run the module sees none of them (backend ADR-0086).
 */
export const OUTBOX_MODULE = 'OUTBOX'

/** Path of the mail account screen within the application. */
export const OUTBOX_ACCOUNT_PATH = '/postausgang-konto'

/** Path of the outbox list within the application. */
export const OUTBOX_PATH = '/postausgang'

/** Path of the covering texts within the application. */
export const MAIL_TEMPLATE_PATH = '/mailvorlagen'

/**
 * @param tenantId the tenant
 * @returns address of the mail account of that tenant
 */
export function mailAccountUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/outbox/account`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the mail account of that tenant
 */
export function mailAccountKey(tenantId: number): readonly unknown[] {
  return ['mail-account', tenantId]
}

/**
 * @param tenantId the tenant
 * @returns address of the outbox of that tenant
 */
export function outboxMessagesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/outbox/messages`
}

/**
 * @param tenantId the tenant
 * @param query the filter and page, as a query string
 * @returns cache key of that page of the outbox
 */
export function outboxListKey(tenantId: number, query: string): readonly unknown[] {
  return ['outbox-messages', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @param id the message
 * @returns cache key of one message with its text and attachments
 */
export function outboxMessageKey(tenantId: number, id: number): readonly unknown[] {
  return ['outbox-message', tenantId, id]
}

/**
 * @param tenantId the tenant
 * @param messageId the message
 * @param attachmentId what hung on it
 * @returns address of those bytes
 */
export function outboxAttachmentUrl(
  tenantId: number,
  messageId: number,
  attachmentId: number,
): string {
  return `${outboxMessagesUrl(tenantId)}/${messageId}/attachments/${attachmentId}`
}

/**
 * @param tenantId the tenant
 * @returns address of the covering texts of that tenant
 */
export function mailTemplatesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/outbox/templates`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the covering texts of that tenant
 */
export function mailTemplatesKey(tenantId: number): readonly unknown[] {
  return ['mail-templates', tenantId]
}

/**
 * @param tenantId the tenant
 * @param resource the REST segment of the document kind, for example `invoices`
 * @param documentId the document
 * @returns address that queues that document as a mail
 */
export function documentMailUrl(
  tenantId: number,
  resource: string,
  documentId: number,
): string {
  return `/api/tenants/${tenantId}/outbox/${resource}/${documentId}`
}

/**
 * @param tenantId the tenant
 * @param resource the REST segment of the document kind
 * @param documentId the document
 * @returns cache key of the preview of that mail
 */
export function documentMailPreviewKey(
  tenantId: number,
  resource: string,
  documentId: number,
): readonly unknown[] {
  return ['document-mail-preview', tenantId, resource, documentId]
}

/** What each state of a mail is called on screen. */
const STATUS_LABELS: Record<MessageStatus, string> = {
  QUEUED: 'Wartet',
  SENDING: 'Wird gesendet',
  SENT: 'Gesendet',
  FAILED: 'Fehlgeschlagen',
}

/**
 * How loudly each state speaks.
 *
 * <p>Four states, four badges, no traffic light of its own. Waiting and sending are statements
 * and stay neutral; only what went out and what did not are worth a colour.
 */
const STATUS_TONES: Record<MessageStatus, BadgeTone> = {
  QUEUED: 'neutral',
  SENDING: 'neutral',
  SENT: 'success',
  FAILED: 'danger',
}

/**
 * @param status the state as the backend spells it
 * @returns the German word, or the code itself for a state this version does not know
 */
export function messageStatusLabel(status: string): string {
  return STATUS_LABELS[status as MessageStatus] ?? status
}

/**
 * @param status the state as the backend spells it
 * @returns how loudly to say it; neutral for a state this version does not know
 */
export function messageStatusTone(status: string): BadgeTone {
  return STATUS_TONES[status as MessageStatus] ?? 'neutral'
}

/** The states the filter offers, in the order a queue runs through them. */
export const MESSAGE_STATUSES: MessageStatus[] = ['QUEUED', 'SENDING', 'SENT', 'FAILED']

/**
 * What the filter shows when the outbox is opened.
 *
 * <p>Failed, not «all»: nobody opens this screen to admire what went out. The one question it
 * is opened for is what did not.
 */
export const DEFAULT_STATUS_FILTER: MessageStatus = 'FAILED'

/** How the connection is protected, and what each way is called. */
export const SMTP_SECURITIES: { value: SmtpSecurity; label: string }[] = [
  { value: 'STARTTLS', label: 'STARTTLS (üblich, Port 587)' },
  { value: 'SSL', label: 'SSL/TLS (Port 465)' },
  { value: 'NONE', label: 'Ohne Verschlüsselung' },
]

/**
 * The placeholders a covering text may carry, as
 * {@code ch.webux.office.outbox.domain.MailTextRenderer} lists them.
 *
 * <p>Written out here so the mask can offer them for clicking. Copying them by hand is how a
 * `{{beleknummer}}` reaches a customer — the backend refuses an unknown one when the template
 * is saved (backend ADR-0085), and this list is what keeps anybody from meeting that refusal.
 */
export const MAIL_PLACEHOLDERS = [
  { name: 'belegart', hint: 'Rechnung, Offerte, …' },
  { name: 'belegnummer', hint: 'RE-2026-0042' },
  { name: 'belegdatum', hint: '20.08.2026' },
  { name: 'faelligkeit', hint: 'leer, wo nichts geschuldet ist' },
  { name: 'betrag', hint: 'Bruttobetrag' },
  { name: 'waehrung', hint: 'CHF' },
  { name: 'empfaenger', hint: 'Name des Kunden' },
  { name: 'ansprechpartner', hint: 'leer, wo keiner hinterlegt ist' },
  { name: 'absender', hint: 'Anzeigename des Mailkontos' },
] as const

/** The languages a covering text exists in, as the backend ships them. */
export const MAIL_LANGUAGES: { code: string; label: string }[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Französisch' },
  { code: 'it', label: 'Italienisch' },
  { code: 'en', label: 'Englisch' },
]

/**
 * Splits a recipient field into single addresses.
 *
 * <p>Comma, semicolon, whitespace and line breaks all count as separators: a mail address
 * carries none of them, and somebody pasting three addresses out of a mail client should not
 * have to know which one this field wanted.
 *
 * @param input what was typed
 * @returns the addresses, without empties
 */
export function splitAddresses(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter((address) => address !== '')
}
