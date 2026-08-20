import { describe, expect, it } from 'vitest'
import { BASIC_DATA_LISTS, basicDataFor, firstBasicDataPath } from './basicData'

describe('BASIC_DATA_LISTS', () => {
  it('basicDataListsAreUniqueTest', () => {
    const slugs = BASIC_DATA_LISTS.map((entry) => entry.slug)
    const lists = BASIC_DATA_LISTS.map((entry) => entry.list)

    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(lists).size).toBe(lists.length)
  })

  /** A German path with an umlaut would have to be escaped in every link. */
  it('basicDataSlugsAreUrlSafeTest', () => {
    for (const entry of BASIC_DATA_LISTS) {
      expect(entry.slug).toMatch(/^[a-z-]+$/)
    }
  })

  it('basicDataEntriesAreLabelledTest', () => {
    for (const entry of BASIC_DATA_LISTS) {
      expect(entry.label.trim()).not.toBe('')
      expect(entry.description.trim()).not.toBe('')
    }
  })
})

describe('basicDataFor', () => {
  it('basicDataForTest', () => {
    expect(basicDataFor('einheiten')?.list).toBe('units')
  })

  it('basicDataForFirstEntryTest', () => {
    expect(basicDataFor('zahlungsarten')?.label).toBe('Zahlungsarten')
  })

  it('basicDataForLastEntryTest', () => {
    expect(basicDataFor('druckvorlagen')?.list).toBe('layout-templates')
  })

  /** An address someone typed or a link from an older version of the menu. */
  it('basicDataForUnknownSlugTest', () => {
    expect(basicDataFor('gibtsnicht')).toBeUndefined()
  })

  it('basicDataForWithoutSlugTest', () => {
    expect(basicDataFor(undefined)).toBeUndefined()
    expect(basicDataFor('')).toBeUndefined()
  })
})

describe('firstBasicDataPath', () => {
  it('firstBasicDataPathTest', () => {
    expect(firstBasicDataPath()).toBe(`/basisdaten/${BASIC_DATA_LISTS[0].slug}`)
  })
})
