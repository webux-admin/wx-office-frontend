import { describe, expect, it } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import {
  SALES_DOCUMENT_KINDS,
  salesDocumentKey,
  salesDocumentListKey,
  salesDocumentTrailKey,
} from '../../lib/salesDocument'
import { invalidateAfterPartnerChange } from './partnerRefresh'

/** Partner, partner list, and the three roots the documents are filed under. */
const STALE_KEY_COUNT = 5

/** A cache that only writes down what it was asked to mark stale. */
function recordingClient(onInvalidate?: () => Promise<void>) {
  const keys: unknown[][] = []
  const client = {
    invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
      keys.push(queryKey)
      return onInvalidate ? onInvalidate() : Promise.resolve()
    },
  } as unknown as QueryClient
  return { client, keys }
}

/**
 * Whether one key reaches another, the way react-query decides it: element by element from
 * the front, so a shorter key marks everything filed under it.
 */
function reaches(marked: unknown[], cached: unknown[]): boolean {
  return marked.length <= cached.length && marked.every((part, index) => part === cached[index])
}

describe('invalidateAfterPartnerChange', () => {
  it('invalidateAfterPartnerChangeTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 7)

    expect(keys).toEqual([
      ['partner', 7],
      ['partners', 7],
      ['sales-document', 7],
      ['sales-documents', 7],
      ['sales-document-trail', 7],
    ])
  })

  /**
   * The point of the whole function, and the part a list of hand-written strings got wrong
   * once: a draft follows its customer (ADR-0040), so every kind of document has to be
   * reached — not the one the keys happened to be named after.
   */
  it('invalidateAfterPartnerChangeReachesEveryKindTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 7)

    for (const kind of SALES_DOCUMENT_KINDS) {
      const cached = [
        salesDocumentKey(kind, 7, 42),
        salesDocumentListKey(kind, 7, 'page=0'),
        salesDocumentTrailKey(kind, 7, 42),
      ]
      for (const entry of cached) {
        expect(keys.some((marked) => reaches(marked, entry))).toBe(true)
      }
    }
  })

  /** A change at one tenant says nothing about the documents of another. */
  it('invalidateAfterPartnerChangeLeavesOtherTenantsAloneTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 7)

    const otherTenant = salesDocumentKey(SALES_DOCUMENT_KINDS[0], 8, 42)
    expect(keys.some((marked) => reaches(marked, otherTenant))).toBe(false)
  })

  it('invalidateAfterPartnerChangeWithTenantZeroTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 0)

    // Zero is a tenant id like any other here; it must not be dropped as falsy.
    expect(keys).toEqual([
      ['partner', 0],
      ['partners', 0],
      ['sales-document', 0],
      ['sales-documents', 0],
      ['sales-document-trail', 0],
    ])
  })

  it('invalidateAfterPartnerChangeWithRejectingCacheTest', () => {
    const { client, keys } = recordingClient(() => Promise.reject(new Error('offline')))

    // A refused refetch must not take the caller down: the mask has already saved by then.
    expect(() => invalidateAfterPartnerChange(client, 3)).not.toThrow()
    expect(keys).toHaveLength(STALE_KEY_COUNT)
  })
})
