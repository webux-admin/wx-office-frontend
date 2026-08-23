import { describe, expect, it } from 'vitest'
import type { StockLocation } from '../../lib/types'
import {
  belongsToCode,
  emptyLocationForm,
  firstLocationComplaint,
  toLocationForm,
  toLocationPayload,
} from './stockLocationForm'

const STORED: StockLocation = {
  id: 7,
  code: 'AUSSEN',
  name: 'Aussenlager',
  binHint: 'Regal C3',
  note: 'Nur Paletten',
  active: false,
  defaultLocation: false,
  negativeStockPolicy: 'BLOCK',
}

describe('emptyLocationForm', () => {
  it('emptyLocationFormTest', () => {
    const form = emptyLocationForm()

    expect(form.code).toBe('')
    expect(form.negativeStockPolicy).toBe('WARN')
    expect(form.active).toBe(true)
  })
})

describe('toLocationForm', () => {
  it('toLocationFormTest', () => {
    expect(toLocationForm(STORED)).toEqual({
      code: 'AUSSEN',
      name: 'Aussenlager',
      binHint: 'Regal C3',
      note: 'Nur Paletten',
      negativeStockPolicy: 'BLOCK',
      active: false,
    })
  })

  it('toLocationFormOfALocationWithoutOptionalFieldsTest', () => {
    const form = toLocationForm({ id: 1, code: 'HAUPT', name: 'Hauptlager' })

    expect(form.binHint).toBe('')
    expect(form.note).toBe('')
    expect(form.negativeStockPolicy).toBe('WARN')
    expect(form.active).toBe(true)
  })
})

describe('toLocationPayload', () => {
  it('toLocationPayloadTest', () => {
    const payload = toLocationPayload({
      code: ' aussen ',
      name: '  Aussenlager  ',
      binHint: ' Regal C3 ',
      note: '',
      negativeStockPolicy: 'BLOCK',
      active: true,
    })

    expect(payload).toEqual({
      code: 'AUSSEN',
      name: 'Aussenlager',
      binHint: 'Regal C3',
      note: undefined,
      negativeStockPolicy: 'BLOCK',
      active: true,
    })
  })

  /** An empty free text field is nothing, not the empty string. */
  it('toLocationPayloadWithoutFreeTextTest', () => {
    const payload = toLocationPayload({ ...emptyLocationForm(), code: 'A', name: 'B' })

    expect(payload.binHint).toBeUndefined()
    expect(payload.note).toBeUndefined()
  })
})

describe('firstLocationComplaint', () => {
  it('firstLocationComplaintTest', () => {
    const form = { ...emptyLocationForm(), code: 'AUSSEN', name: 'Aussenlager' }

    expect(firstLocationComplaint(form, true)).toBeNull()
  })

  it('firstLocationComplaintWithoutACodeTest', () => {
    const form = { ...emptyLocationForm(), name: 'Aussenlager' }

    expect(firstLocationComplaint(form, true)).toBe(
      'Ein Lagerort braucht einen Code, zum Beispiel HAUPT.',
    )
  })

  /** While editing the code is fixed, so an empty field there is not a complaint. */
  it('firstLocationComplaintWhileEditingIgnoresTheCodeTest', () => {
    const form = { ...emptyLocationForm(), name: 'Aussenlager' }

    expect(firstLocationComplaint(form, false)).toBeNull()
  })

  it('firstLocationComplaintWithoutANameTest', () => {
    const form = { ...emptyLocationForm(), code: 'AUSSEN', name: '   ' }

    expect(firstLocationComplaint(form, true)).toBe('Ein Lagerort braucht eine Bezeichnung.')
  })
})

describe('belongsToCode', () => {
  it('belongsToCodeTest', () => {
    expect(belongsToCode('Es gibt bereits einen Lagerort mit dem Code AUSSEN')).toBe(true)
  })

  it('belongsToCodeForTheOwnComplaintTest', () => {
    expect(belongsToCode('Ein Lagerort braucht einen Code, zum Beispiel HAUPT.')).toBe(true)
  })

  it('belongsToCodeForAnotherFieldTest', () => {
    expect(belongsToCode('Ein Lagerort braucht eine Bezeichnung.')).toBe(false)
  })

  it('belongsToCodeForAnEmptyMessageTest', () => {
    expect(belongsToCode('')).toBe(false)
  })
})
