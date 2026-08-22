import { describe, expect, it } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateAfterPartnerChange } from './partnerRefresh'

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

describe('invalidateAfterPartnerChange', () => {
  it('invalidateAfterPartnerChangeTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 7)

    expect(keys).toEqual([
      ['partner', 7],
      ['partners', 7],
      ['order', 7],
      ['orders', 7],
    ])
  })

  it('invalidateAfterPartnerChangeWithTenantZeroTest', () => {
    const { client, keys } = recordingClient()

    invalidateAfterPartnerChange(client, 0)

    // Zero is a tenant id like any other here; it must not be dropped as falsy.
    expect(keys).toEqual([
      ['partner', 0],
      ['partners', 0],
      ['order', 0],
      ['orders', 0],
    ])
  })

  it('invalidateAfterPartnerChangeWithRejectingCacheTest', () => {
    const { client, keys } = recordingClient(() => Promise.reject(new Error('offline')))

    // A refused refetch must not take the caller down: the mask has already saved by then.
    expect(() => invalidateAfterPartnerChange(client, 3)).not.toThrow()
    expect(keys).toHaveLength(4)
  })
})
