import { describe, expect, it } from 'vitest'
import {
  dispatchNote,
  documentMailMessagesUrl,
  mailAccountUrl,
  MAIL_PLACEHOLDERS,
  messageStatusLabel,
  messageStatusTone,
  outboxAttachmentUrl,
  splitAddresses,
} from './outbox'
import type { OutboxSummary } from './types'

function message(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return {
    id: 7,
    status: 'SENT',
    recipients: 'kunde@example.ch',
    subject: 'Rechnung RE-2026-0042',
    attempts: 1,
    sentAt: '2026-08-28T09:05:00Z',
    createdAt: '2026-08-28T09:00:00Z',
    ...overrides,
  }
}

describe('dispatchNote', () => {
  it('dispatchNoteTest', () => {
    expect(dispatchNote([message()])).toEqual({
      tone: 'success',
      text: 'Gesendet am 28.08.2026 an kunde@example.ch',
    })
  })

  /** A document that was never mailed says nothing — most documents never are. */
  it('dispatchNoteWithoutAnyMessageTest', () => {
    expect(dispatchNote([])).toBeNull()
  })

  it('dispatchNoteWhileWaitingTest', () => {
    expect(dispatchNote([message({ status: 'QUEUED', sentAt: undefined })])).toEqual({
      tone: 'neutral',
      text: 'Wartet im Postausgang',
    })
  })

  it('dispatchNoteWhileSendingTest', () => {
    expect(dispatchNote([message({ status: 'SENDING', sentAt: undefined })])?.tone).toBe(
      'neutral',
    )
  })

  it('dispatchNoteAfterAFailureTest', () => {
    expect(dispatchNote([message({ status: 'FAILED', sentAt: undefined })])).toEqual({
      tone: 'danger',
      text: 'Versand fehlgeschlagen',
    })
  })

  /**
   * The one case worth getting right: a second send failed after a first one arrived. Saying
   * «gesendet» would hide the bad news behind older good news.
   */
  it('dispatchNoteWithAFailureAfterASendTest', () => {
    const result = dispatchNote([
      message({ id: 8, status: 'FAILED', sentAt: undefined }),
      message({ id: 7 }),
    ])

    expect(result?.tone).toBe('danger')
    expect(result?.text).toBe('Versand fehlgeschlagen · 2 Mails')
  })

  it('dispatchNoteCountsSeveralMessagesTest', () => {
    expect(dispatchNote([message({ id: 8 }), message({ id: 7 })])?.text).toBe(
      'Gesendet am 28.08.2026 an kunde@example.ch · 2 Mails',
    )
  })
})

describe('splitAddresses', () => {
  it('splitAddressesTest', () => {
    expect(splitAddresses('erste@example.ch, zweite@example.ch')).toEqual([
      'erste@example.ch',
      'zweite@example.ch',
    ])
  })

  /** Pasted out of a mail client, separators come in every shape. */
  it('splitAddressesWithMixedSeparatorsTest', () => {
    expect(splitAddresses('a@x.ch; b@x.ch\n c@x.ch')).toEqual(['a@x.ch', 'b@x.ch', 'c@x.ch'])
  })

  it('splitAddressesWithNothingTest', () => {
    expect(splitAddresses('')).toEqual([])
    expect(splitAddresses('  ,  ; ')).toEqual([])
  })
})

describe('messageStatus', () => {
  it('messageStatusLabelTest', () => {
    expect(messageStatusLabel('FAILED')).toBe('Fehlgeschlagen')
    expect(messageStatusTone('FAILED')).toBe('danger')
  })

  /** A state a later backend adds must not blank the cell or throw. */
  it('messageStatusLabelWithAnUnknownStateTest', () => {
    expect(messageStatusLabel('BOUNCED')).toBe('BOUNCED')
    expect(messageStatusTone('BOUNCED')).toBe('neutral')
  })
})

describe('addresses', () => {
  it('outboxUrlsTest', () => {
    expect(mailAccountUrl(1)).toBe('/api/tenants/1/outbox/account')
    expect(outboxAttachmentUrl(1, 7, 3)).toBe(
      '/api/tenants/1/outbox/messages/7/attachments/3',
    )
    expect(documentMailMessagesUrl(1, 'invoices', 42)).toBe(
      '/api/tenants/1/outbox/invoices/42/messages',
    )
  })
})

describe('MAIL_PLACEHOLDERS', () => {
  /**
   * The list the mask offers has to be the one the backend accepts — an unknown placeholder is
   * refused when the template is saved, and a wrong button would be a trap.
   */
  it('mailPlaceholdersMatchTheBackendCatalogueTest', () => {
    expect(MAIL_PLACEHOLDERS.map((entry) => entry.name)).toEqual([
      'belegart',
      'belegnummer',
      'belegdatum',
      'faelligkeit',
      'betrag',
      'waehrung',
      'empfaenger',
      'ansprechpartner',
      'absender',
    ])
  })
})
