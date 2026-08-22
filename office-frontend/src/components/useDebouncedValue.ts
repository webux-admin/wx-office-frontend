import { useEffect, useState } from 'react'

/**
 * Holds a value back until it has stopped changing.
 *
 * <p>What a type-ahead is built on: every keystroke would otherwise be a request, and the
 * answers would arrive in an order nobody controls. The first value passes through at once,
 * so a mask that opens with a term does not start out empty.
 *
 * @param value the value as it changes, usually what is in a field
 * @param delay how long it has to stand still, in milliseconds
 * @returns the last value that stood still for that long
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}
