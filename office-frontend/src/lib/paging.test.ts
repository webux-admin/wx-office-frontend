import { describe, expect, it } from 'vitest'
import { emptyPage, listQuery, PAGE_SIZE, pageRange, sortDirection, toggleSort } from './paging'
import type { Page } from './types'

/** A page as the server would answer it. */
function page<T>(content: T[], number: number, size: number, total: number): Page<T> {
  return {
    content,
    page: number,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
    sort: '',
  }
}

describe('listQuery', () => {
  it('listQueryTest', () => {
    expect(listQuery({ search: 'meier', activeOnly: true, page: 2, size: 50 })).toBe(
      'search=meier&activeOnly=true&page=2&size=50',
    )
  })

  it('listQueryWithoutAnythingTest', () => {
    expect(listQuery({})).toBe('')
  })

  it('listQueryWithSingleParameterTest', () => {
    expect(listQuery({ page: 0 })).toBe('page=0')
  })

  /** An empty search must not become `search=`, which the server reads as a filter. */
  it('listQueryWithBlankStringTest', () => {
    expect(listQuery({ search: '   ', activeOnly: false })).toBe('activeOnly=false')
  })

  it('listQueryWithUndefinedTest', () => {
    expect(listQuery({ search: undefined, role: null, page: 1 })).toBe('page=1')
  })

  /** Repeated rather than comma separated: the server reads status twice. */
  it('listQueryWithRepeatedParameterTest', () => {
    expect(listQuery({ status: ['DRAFT', 'FINALISED'] })).toBe('status=DRAFT&status=FINALISED')
  })

  it('listQueryWithEmptyArrayTest', () => {
    expect(listQuery({ status: [] })).toBe('')
  })

  it('listQueryEncodesTest', () => {
    expect(listQuery({ search: 'Müller & Co' })).toBe('search=M%C3%BCller+%26+Co')
  })
})

describe('emptyPage', () => {
  it('emptyPageTest', () => {
    const result = emptyPage<string>()

    expect(result.content).toEqual([])
    expect(result.totalElements).toBe(0)
    expect(result.totalPages).toBe(0)
    expect(result.size).toBe(PAGE_SIZE)
  })
})

describe('pageRange', () => {
  it('pageRangeTest', () => {
    expect(pageRange(page(['a', 'b', 'c'], 1, 3, 10))).toEqual({ first: 4, last: 6 })
  })

  it('pageRangeOnFirstPageTest', () => {
    expect(pageRange(page(['a'], 0, 50, 1))).toEqual({ first: 1, last: 1 })
  })

  /** The last page is usually shorter than a full one. */
  it('pageRangeOnLastPageTest', () => {
    expect(pageRange(page(['a'], 3, 3, 10))).toEqual({ first: 10, last: 10 })
  })

  it('pageRangeWithEmptyPageTest', () => {
    expect(pageRange(emptyPage())).toEqual({ first: 0, last: 0 })
  })
})

describe('toggleSort', () => {
  it('toggleSortTest', () => {
    expect(toggleSort('name,asc', 'name')).toBe('name,desc')
  })

  it('toggleSortBackToAscendingTest', () => {
    expect(toggleSort('name,desc', 'name')).toBe('name,asc')
  })

  /** A different column starts ascending, whichever way the old one pointed. */
  it('toggleSortOnAnotherColumnTest', () => {
    expect(toggleSort('name,desc', 'partnerNumber')).toBe('partnerNumber,asc')
  })

  it('toggleSortWithoutCurrentSortTest', () => {
    expect(toggleSort('', 'name')).toBe('name,asc')
  })
})

describe('sortDirection', () => {
  it('sortDirectionTest', () => {
    expect(sortDirection('name,desc', 'name')).toBe('desc')
  })

  it('sortDirectionAscendingTest', () => {
    expect(sortDirection('name,asc', 'name')).toBe('asc')
  })

  /** A field without a direction is ascending, the same reading the server uses. */
  it('sortDirectionWithoutDirectionTest', () => {
    expect(sortDirection('name', 'name')).toBe('asc')
  })

  it('sortDirectionOnAnotherColumnTest', () => {
    expect(sortDirection('name,asc', 'partnerNumber')).toBeUndefined()
  })

  it('sortDirectionWithoutSortTest', () => {
    expect(sortDirection('', 'name')).toBeUndefined()
  })
})
