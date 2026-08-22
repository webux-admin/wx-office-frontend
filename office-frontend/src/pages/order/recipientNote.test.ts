import { describe, expect, it } from 'vitest'
import { recipientNote } from './recipientNote'

describe('recipientNote', () => {
  it('recipientNoteTest', () => {
    const note = recipientNote('FINALISED')

    expect(note).toBe('Kopie aus den Stammdaten, festgehalten beim Ausstellen.')
  })

  it('recipientNoteForDraftTest', () => {
    const note = recipientNote('DRAFT')

    expect(note).toBe('Folgt dem Kunden: solange der Beleg Entwurf ist, zieht eine geänderte Adresse nach.')
  })

  it('recipientNoteForCancelledTest', () => {
    // A cancelled document was issued before it was cancelled, so the copy stays frozen.
    const note = recipientNote('CANCELLED')

    expect(note).toBe(recipientNote('FINALISED'))
  })

  it('recipientNoteDiffersBetweenDraftAndIssuedTest', () => {
    expect(recipientNote('DRAFT')).not.toBe(recipientNote('FINALISED'))
  })
})
