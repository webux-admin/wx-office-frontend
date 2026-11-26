import { describe, expect, it } from 'vitest'
import { choicesMatching, type Choice } from './choices'

const PROJECTS: Choice[] = [
  { value: '', label: 'Alle Projekte', quiet: true },
  { value: '12', label: 'P-00012 Website-Relaunch' },
  { value: '13', label: 'P-00013 Wartung', detail: 'Muster AG' },
  { value: 'ohne', label: 'ohne Projekt', quiet: true },
]

const labelsOf = (choices: readonly Choice[]) => choices.map((choice) => choice.label)

describe('choicesMatching', () => {
  it('choicesMatchingTest', () => {
    expect(labelsOf(choicesMatching(PROJECTS, 'web'))).toEqual(['P-00012 Website-Relaunch'])
  })

  /** Case and the blanks around the term do not matter; the detail is searched too. */
  it('choicesMatchingIgnoresCaseAndFindsTheDetailTest', () => {
    expect(labelsOf(choicesMatching(PROJECTS, '  MUSTER '))).toEqual(['P-00013 Wartung'])
  })

  /** A hyphen is a character, not a range of a pattern. */
  it('choicesMatchingTakesTheTermAsPlainTextTest', () => {
    expect(labelsOf(choicesMatching(PROJECTS, 'p-0001'))).toEqual([
      'P-00012 Website-Relaunch',
      'P-00013 Wartung',
    ])
    expect(choicesMatching(PROJECTS, '.*')).toEqual([])
  })

  /** Nothing typed: the whole list, in its order. */
  it('choicesMatchingWithAnEmptyTermTest', () => {
    expect(choicesMatching(PROJECTS, '')).toBe(PROJECTS)
    expect(choicesMatching(PROJECTS, '   ')).toBe(PROJECTS)
  })

  it('choicesMatchingInAnEmptyListTest', () => {
    expect(choicesMatching([], 'web')).toEqual([])
  })

  /** Five hundred names are searched at once, and the order of the list stays. */
  it('choicesMatchingInALongListTest', () => {
    const people = Array.from({ length: 500 }, (_, index) => ({
      value: String(index),
      label: `Person ${String(index).padStart(3, '0')}`,
    }))

    const found = choicesMatching(people, '49')

    expect(labelsOf(found)).toEqual([
      'Person 049',
      'Person 149',
      'Person 249',
      'Person 349',
      'Person 449',
      'Person 490',
      'Person 491',
      'Person 492',
      'Person 493',
      'Person 494',
      'Person 495',
      'Person 496',
      'Person 497',
      'Person 498',
      'Person 499',
    ])
  })
})
