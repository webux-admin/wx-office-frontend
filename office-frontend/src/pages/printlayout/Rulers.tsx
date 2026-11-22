import { memo } from 'react'
import type { Point } from '../../printlayout/geometry'
import { mmToPx } from '../../printlayout/units'
import { useStore, type Store } from './store'

/** Thickness of a ruler in CSS pixels at the default font size; follows `--spacing-ruler`. */
const RULER_REM = 1.25

/**
 * A ruler along one edge of the sheet, in millimetres.
 *
 * <p>Drawn as one SVG: a tick per millimetre where there is room for it, a longer one every
 * five and a number every ten. It measures the paper, not the screen, so the numbers stay
 * true at every zoom.
 *
 * @param axis `x` lies above the sheet, `y` to its left
 * @param length the side of the paper it measures, in millimetres
 * @param zoom the scale of the sheet, 1 for 100 %
 */
export const Ruler = memo(function Ruler({
  axis,
  length,
  zoom,
}: {
  axis: 'x' | 'y'
  length: number
  zoom: number
}) {
  const pixels = mmToPx(length, zoom)
  const perMillimetre = mmToPx(1, zoom)
  // Below two and a half pixels a tick per millimetre is a grey bar, not a scale.
  const step = perMillimetre >= 2.5 ? 1 : 5
  const labelEvery = perMillimetre >= 2.2 ? 10 : 20
  const ticks: number[] = []
  for (let value = 0; value <= length; value += step) ticks.push(value)

  const horizontal = axis === 'x'
  return (
    <svg
      aria-hidden
      className="block overflow-visible bg-surface"
      style={
        horizontal
          ? { width: pixels, height: `${RULER_REM}rem` }
          : { width: `${RULER_REM}rem`, height: pixels }
      }
    >
      {ticks.map((value) => {
        const at = value * perMillimetre
        const size = value % 10 === 0 ? 45 : value % 5 === 0 ? 30 : 18
        return horizontal ? (
          <line
            key={value}
            x1={at}
            x2={at}
            y1={`${100 - size}%`}
            y2="100%"
            className="stroke-line"
          />
        ) : (
          <line
            key={value}
            y1={at}
            y2={at}
            x1={`${100 - size}%`}
            x2="100%"
            className="stroke-line"
          />
        )
      })}
      {ticks
        .filter((value) => value % labelEvery === 0)
        .map((value) =>
          horizontal ? (
            <text
              key={value}
              x={value * perMillimetre + 2.5}
              y="48%"
              className="fill-text-tertiary font-mono text-micro"
            >
              {value}
            </text>
          ) : (
            <text
              key={value}
              x="46%"
              y={value * perMillimetre + 2.5}
              className="fill-text-tertiary font-mono text-micro"
              style={{ writingMode: 'vertical-rl' }}
            >
              {value}
            </text>
          ),
        )}
    </svg>
  )
})

/**
 * The mark on a ruler that follows the pointer across the sheet.
 *
 * <p>Its own component on its own subscription: it moves on every pointer event, and nothing
 * else on the screen should have to re-render for that.
 */
export function RulerPointer({
  axis,
  zoom,
  pointer,
}: {
  axis: 'x' | 'y'
  zoom: number
  pointer: Store<Point | null>
}) {
  const at = useStore(pointer)
  if (at === null) return null
  const offset = mmToPx(axis === 'x' ? at.x : at.y, zoom)
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bg-sheet-guide ${
        axis === 'x' ? 'inset-y-0 w-px' : 'inset-x-0 h-px'
      }`}
      style={axis === 'x' ? { left: offset } : { top: offset }}
    />
  )
}
