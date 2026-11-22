import { useSyncExternalStore } from 'react'

/**
 * A value outside React that components can listen to.
 *
 * <p>The designer has two things that change on every pointer move — where the pointer is,
 * and where a dragged palette entry hovers. Kept in the state of the screen they would
 * re-render three panes sixty times a second; kept here, only the status line and the ghost
 * follow them.
 */
export type Store<Value> = {
  get: () => Value
  set: (next: Value) => void
  subscribe: (listener: () => void) => () => void
}

/**
 * Creates a store.
 *
 * @param initial the value it starts with
 * @returns the store; setting the value it already holds notifies nobody
 */
export function createStore<Value>(initial: Value): Store<Value> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * Reads a store and re-renders the component when its value changes.
 *
 * @param store the store
 * @returns its current value
 */
export function useStore<Value>(store: Store<Value>): Value {
  return useSyncExternalStore(store.subscribe, store.get)
}
