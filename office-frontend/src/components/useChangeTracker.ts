import { useCallback, useState, type SyntheticEvent } from 'react'

/**
 * Notices whether the user has changed anything in a part of a mask.
 *
 * <p>Spread `track` onto the element around the fields. Every value the user types, ticks or
 * picks in there marks the mask as changed. Values the code fills in by itself — a default
 * language, a country the tenant prefers — do not, because no input event fires for them, and
 * that is the point: the question «Änderungen verwerfen?» is about what the user did.
 *
 * <p>Fields inside a dialog over the mask are left out: a dialog saves on its own, and what was
 * typed there says nothing about the mask behind it.
 *
 * @returns `changed`, the handlers to spread as `track`, and `reset` for after a save
 */
export function useChangeTracker(): {
  changed: boolean
  track: {
    onInputCapture: (event: SyntheticEvent) => void
    onChangeCapture: (event: SyntheticEvent) => void
  }
  reset: () => void
} {
  const [changed, setChanged] = useState(false)

  const note = useCallback((event: SyntheticEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('[role="dialog"]') !== null) return
    setChanged(true)
  }, [])

  return {
    changed,
    track: { onInputCapture: note, onChangeCapture: note },
    reset: () => setChanged(false),
  }
}
