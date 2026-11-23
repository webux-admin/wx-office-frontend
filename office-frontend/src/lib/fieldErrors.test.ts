import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  fieldErrorsOf,
  isToldByFields,
  listItemErrorsOf,
  nestedErrors,
  prefixedErrors,
} from './fieldErrors'

/** A refusal as the client builds it from a 400 answer. */
function refused(errors: unknown): ApiError {
  return new ApiError(400, 'Die Anfrage wurde nicht angenommen.', { detail: '…', errors })
}

describe('fieldErrorsOf', () => {
  it('fieldErrorsOfTest', () => {
    const error = refused([
      { field: 'uid', message: 'Keine gültige Schweizer UID: CHE-1' },
      { field: 'email', message: 'Ist keine gültige E-Mail-Adresse.' },
    ])

    expect(fieldErrorsOf(error)).toEqual({
      uid: 'Keine gültige Schweizer UID: CHE-1',
      email: 'Ist keine gültige E-Mail-Adresse.',
    })
  })

  /** A mask with one address does not count, so the index has to go. */
  it('fieldErrorsOfWithAnIndexTest', () => {
    const error = refused([{ field: 'addresses[0].postalCode', message: 'Darf nicht leer sein.' }])

    expect(fieldErrorsOf(error)).toEqual({ 'addresses.postalCode': 'Darf nicht leer sein.' })
  })

  it('fieldErrorsOfWithAPrefixTest', () => {
    const error = refused([
      { field: 'addresses.town', message: 'Der Ort darf nicht leer sein.' },
      { field: 'postalCode', message: 'Darf nicht leer sein.' },
    ])

    expect(fieldErrorsOf(error, 'addresses.')).toEqual({
      town: 'Der Ort darf nicht leer sein.',
      postalCode: 'Darf nicht leer sein.',
    })
  })

  it('fieldErrorsOfWithTheSameFieldTwiceTest', () => {
    const error = refused([
      { field: 'name', message: 'Erste' },
      { field: 'name', message: 'Zweite' },
    ])

    expect(fieldErrorsOf(error)).toEqual({ name: 'Erste' })
  })

  it('fieldErrorsOfWithoutErrorsTest', () => {
    expect(fieldErrorsOf(new ApiError(400, 'Nein', { detail: 'Nein' }))).toEqual({})
    expect(fieldErrorsOf(refused([]))).toEqual({})
  })

  it('fieldErrorsOfWithSomethingElseTest', () => {
    expect(fieldErrorsOf(null)).toEqual({})
    expect(fieldErrorsOf(new Error('kaputt'))).toEqual({})
    expect(fieldErrorsOf(new ApiError(500, 'Fehler', 'text'))).toEqual({})
  })

  /** A malformed entry is skipped rather than taking the others down with it. */
  it('fieldErrorsOfWithMalformedEntriesTest', () => {
    const error = refused([null, { field: 3, message: 'x' }, { field: 'uid', message: 'Falsch' }])

    expect(fieldErrorsOf(error)).toEqual({ uid: 'Falsch' })
  })
})

describe('isToldByFields', () => {
  it('isToldByFieldsTest', () => {
    const error = refused([{ field: 'uid', message: 'Falsch' }])

    expect(isToldByFields(error, ['name', 'uid'])).toBe(true)
  })

  /** A field the mask does not show would swallow its message without a notice. */
  it('isToldByFieldsWithAHiddenFieldTest', () => {
    const error = refused([{ field: 'language', message: 'Fehlt' }])

    expect(isToldByFields(error, ['name', 'uid'])).toBe(false)
  })

  it('isToldByFieldsWithoutFieldErrorsTest', () => {
    expect(isToldByFields(new ApiError(400, 'Höchstens eine Standardadresse'), ['name'])).toBe(
      false,
    )
    expect(isToldByFields(null, ['name'])).toBe(false)
  })
})

describe('nestedErrors', () => {
  it('nestedErrorsTest', () => {
    const errors = { name: 'Fehlt', 'addresses.town': 'Ort fehlt', 'addresses.postalCode': 'PLZ fehlt' }

    expect(nestedErrors(errors, 'addresses.')).toEqual({ town: 'Ort fehlt', postalCode: 'PLZ fehlt' })
  })

  it('nestedErrorsWithoutAMatchTest', () => {
    expect(nestedErrors({ name: 'Fehlt' }, 'addresses.')).toEqual({})
    expect(nestedErrors({}, 'addresses.')).toEqual({})
  })
})

describe('prefixedErrors', () => {
  it('prefixedErrorsTest', () => {
    expect(prefixedErrors({ town: 'Ort fehlt' }, 'addresses.')).toEqual({
      'addresses.town': 'Ort fehlt',
    })
  })

  it('prefixedErrorsOfNothingTest', () => {
    expect(prefixedErrors({}, 'addresses.')).toEqual({})
  })

  /** The two undo each other, which is what the create mask relies on. */
  it('prefixedErrorsUndoneByNestedErrorsTest', () => {
    const own = { town: 'Ort fehlt', name: 'Empfänger fehlt' }

    expect(nestedErrors(prefixedErrors(own, 'addresses.'), 'addresses.')).toEqual(own)
  })
})

describe('listItemErrorsOf', () => {
  it('listItemErrorsOfTest', () => {
    const error = refused([
      { field: 'lines[0].serviceDateTo', message: 'Position 1 läuft über einen Satzwechsel.' },
      { field: 'lines[2].serviceDateTo', message: 'Position 3 läuft über einen Satzwechsel.' },
    ])

    expect(listItemErrorsOf(error, 'lines')).toEqual(
      new Map([
        [0, 'Position 1 läuft über einen Satzwechsel.'],
        [2, 'Position 3 läuft über einen Satzwechsel.'],
      ]),
    )
  })

  it('listItemErrorsOfWithAnotherListTest', () => {
    const error = refused([{ field: 'addresses[0].town', message: 'Darf nicht leer sein.' }])

    expect(listItemErrorsOf(error, 'lines').size).toBe(0)
  })

  it('listItemErrorsOfWithoutErrorsTest', () => {
    expect(listItemErrorsOf(new Error('netz weg'), 'lines').size).toBe(0)
  })

  it('listItemErrorsOfWithTheSameItemTwiceTest', () => {
    const error = refused([
      { field: 'lines[1].serviceDateTo', message: 'Erste Meldung.' },
      { field: 'lines[1].serviceDateFrom', message: 'Zweite Meldung.' },
    ])

    expect(listItemErrorsOf(error, 'lines').get(1)).toBe('Erste Meldung.')
  })
})
