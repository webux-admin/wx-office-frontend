import type { Page } from './types'

/** Rows a list asks for at a time. The server allows at most 200. */
export const PAGE_SIZE = 50

/**
 * Rows a picker asks for: the largest page the server allows.
 *
 * <p>A dropdown wants every entry, not a page. Beyond this many a dropdown is the wrong
 * control anyway, and the mask needs a type-ahead against the search parameter instead.
 */
export const PICKER_SIZE = 200

/**
 * Builds the query string of a list request.
 *
 * <p>Leaves out what was not asked for: an empty search must not become `search=`, which the
 * server would read as "match the empty string" rather than "no filter".
 *
 * @param params the filters and paging values, in any order
 * @returns the query string without a leading `?`, empty when nothing was asked for
 */
export function listQuery(
  params: Record<string, string | number | boolean | undefined | null | string[]>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      // Repeated rather than comma separated: the server reads status=DRAFT&status=FINALISED.
      value.filter((entry) => entry !== '').forEach((entry) => search.append(key, entry))
      continue
    }
    if (typeof value === 'string' && value.trim() === '') continue
    search.append(key, String(value))
  }
  return search.toString()
}

/**
 * The page to show while the first answer is still on its way.
 *
 * <p>Saves every list from spelling out `?? { content: [], ... }` and from the `rows.length`
 * habit that the unpaged endpoints taught it.
 *
 * @returns an empty page on page zero
 */
export function emptyPage<T>(): Page<T> {
  return { content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0, sort: '' }
}

/**
 * The 1-based range this page covers, for a line like "51-100 von 1'284".
 *
 * @param page the page as the server answered it
 * @returns first and last row number, both 0 when the page is empty
 */
export function pageRange(page: Page<unknown>): { first: number; last: number } {
  if (page.content.length === 0) return { first: 0, last: 0 }
  const first = page.page * page.size + 1
  return { first, last: first + page.content.length - 1 }
}

/**
 * Flips a sort expression when the same column is clicked again.
 *
 * @param current the sort in force, as `field,direction`
 * @param field the column that was clicked
 * @returns the sort to ask for next
 */
export function toggleSort(current: string, field: string): string {
  return current === `${field},asc` ? `${field},desc` : `${field},asc`
}

/**
 * Reads the direction a column is sorted in.
 *
 * @param current the sort in force
 * @param field the column to ask about
 * @returns the direction, or undefined when the list is sorted by another column
 */
export function sortDirection(current: string, field: string): 'asc' | 'desc' | undefined {
  const [sorted, direction] = current.split(',')
  if (sorted !== field) return undefined
  return direction === 'desc' ? 'desc' : 'asc'
}
