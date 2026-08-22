/**
 * Moving a marker through a list with the arrow keys.
 *
 * <p>Its own file because it has nothing to do with any one list: the rule is the same for a
 * type-ahead, a menu and a picker, and it is worth testing without a renderer.
 */

/**
 * The entry the next arrow key marks.
 *
 * <p>Wraps around at both ends, so the last entry is one key press away from the first. That
 * matters where the list is the whole point of the mask: the alternative is a dead key at the
 * bottom of a list somebody is holding a key down on.
 *
 * @param current the entry marked now, -1 while none is
 * @param delta 1 for down, -1 for up
 * @param count how many entries the list holds
 * @returns the entry to mark, -1 while the list is empty
 */
export function nextIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1
  const moved = current + delta
  if (moved < 0) return count - 1
  if (moved >= count) return 0
  return moved
}
