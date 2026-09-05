// @vitest-environment jsdom
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavCounters } from './useNavCounters'
import type { NavCounterKey } from './navigation'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let asked: string[]
let seen: Partial<Record<NavCounterKey, number>>

beforeEach(() => {
  asked = []
  seen = {}
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/**
 * @param attention what the accounting endpoint answers
 * @param failing whether every call is refused
 */
function stubFetch(attention: unknown, failing = false) {
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (failing) return Promise.reject(new Error('Netz weg'))
    if (url.includes('/banking/worklist/count')) return json({ open: 5 })
    return json(attention)
  })
}

/** Mounts a component that does nothing but call the hook and record what it answers. */
async function paint(counter: NavCounterKey | undefined, tenantId: number | null = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Probe() {
    seen = useNavCounters(tenantId, counter)
    return null
  }
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe)))
  })
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

describe('useNavCounters', () => {
  /** The everyday case of the counter this delivery adds: a period is about to be locked. */
  it('useNavCountersTest', async () => {
    stubFetch({ drafts: 3, draftTotal: 12480.55, lockingOn: '2026-09-30' })

    await paint('ACCOUNTING_DRAFTS')

    expect(seen.ACCOUNTING_DRAFTS).toBe(3)
    expect(asked.some((url) => url.includes('/accounting/entries/attention'))).toBe(true)
    // Only the counter that was asked for: the other query stays switched off, so a sidebar
    // showing one badge does not make two requests.
    expect(asked.some((url) => url.includes('/banking/worklist/count'))).toBe(false)
  })

  /**
   * <b>Drafts without a lock in sight show no number, and that is the decision.</b> In hand
   * bookkeeping a draft is the normal state of an entry somebody is in the middle of. A badge
   * that stands permanently for the normal case teaches people to stop looking at badges — on
   * the very channel real trouble is reported through.
   */
  it('useNavCountersWithoutLockingOnTest', async () => {
    stubFetch({ drafts: 7, draftTotal: 900, lockingOn: null })

    await paint('ACCOUNTING_DRAFTS')

    expect(asked.some((url) => url.includes('/accounting/entries/attention'))).toBe(true)
    expect(seen.ACCOUNTING_DRAFTS).toBeUndefined()
  })

  /** The counter that was there before still works, and it is the only one asked for. */
  it('useNavCountersForTheClearingTest', async () => {
    stubFetch({ drafts: 0, draftTotal: 0, lockingOn: null })

    await paint('CLEARING')

    expect(seen.CLEARING).toBe(5)
    expect(asked.some((url) => url.includes('/accounting/entries/attention'))).toBe(false)
  })

  /** An entry without a counter asks nothing at all — most entries have none. */
  it('useNavCountersWithoutCounterTest', async () => {
    stubFetch({ drafts: 3, draftTotal: 100, lockingOn: '2026-09-30' })

    await paint(undefined)

    expect(asked).toEqual([])
    expect(seen).toEqual({})
  })

  /** No tenant chosen, no request: the address would be `/api/tenants/null/…`. */
  it('useNavCountersWithoutATenantTest', async () => {
    stubFetch({ drafts: 3, draftTotal: 100, lockingOn: '2026-09-30' })

    await paint('ACCOUNTING_DRAFTS', null)

    expect(asked).toEqual([])
    expect(seen).toEqual({})
  })

  /**
   * <b>A failure shows nothing, and does not throw.</b> A navigation showing a red box is more
   * broken than one showing no number.
   */
  it('useNavCountersWhenTheRequestFailsTest', async () => {
    stubFetch(null, true)

    await paint('ACCOUNTING_DRAFTS')

    expect(seen).toEqual({})
  })
})
