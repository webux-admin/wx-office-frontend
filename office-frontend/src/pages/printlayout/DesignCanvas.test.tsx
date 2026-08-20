// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesignCanvas } from './DesignCanvas'
import { DEFAULT_PAGE, newBlock } from '../../printlayout/layout'
import type { PrintLayoutDefinition } from '../../lib/types'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FORM: PrintLayoutDefinition = {
  page: DEFAULT_PAGE,
  header: [
    { ...newBlock('TEXT', { x: 0, y: 0 }), text: 'Absenderzeile' },
    { ...newBlock('ADDRESS', { x: 0, y: 20 }), field: 'recipient' },
  ],
  body: [newBlock('POSITIONS', { x: 0, y: 0 })],
  footer: [],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Renders the canvas and hands back what the test wants to look at. */
function draw(props: Partial<Parameters<typeof DesignCanvas>[0]> = {}) {
  const onSelect = vi.fn()
  const onMove = vi.fn()
  const onResize = vi.fn()
  act(() =>
    root.render(
      <DesignCanvas
        definition={FORM}
        selection={null}
        onSelect={onSelect}
        onMove={onMove}
        onResize={onResize}
        {...props}
      />,
    ),
  )
  return { onSelect, onMove, onResize }
}

/** @returns the element whose text is exactly this, the way a person would point at it */
function elementWith(text: string): HTMLElement {
  // The last match is the innermost one: a wrapper reads the same as the block inside it.
  const found = [...container.querySelectorAll<HTMLElement>('div, button')]
    .filter((element) => element.textContent === text)
    .at(-1)
  if (!found) throw new Error(`nothing on the page reads "${text}"`)
  return found
}

describe('DesignCanvas', () => {
  it('designCanvasTest', () => {
    draw()

    // The three bands, the placed blocks and the flowing table are all on the page.
    expect(container.textContent).toContain('Kopf')
    expect(container.textContent).toContain('Körper')
    expect(container.textContent).toContain('Fuss')
    expect(container.textContent).toContain('Absenderzeile')
    expect(container.textContent).toContain('Adresse Empfänger')
    expect(container.textContent).toContain('Positionen')
  })

  it('designCanvasSelectsAPlacedBlockTest', () => {
    const { onSelect } = draw()

    act(() => {
      elementWith('Absenderzeile').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true }),
      )
    })

    expect(onSelect).toHaveBeenCalledWith({ band: 'header', index: 0 })
  })

  it('designCanvasSelectsAFlowingBlockTest', () => {
    const { onSelect } = draw()

    act(() => {
      elementWith('Positionen').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalledWith({ band: 'body', index: 0 })
  })

  it('designCanvasMovesABlockWithTheKeyboardTest', () => {
    const { onMove } = draw({ selection: { band: 'header', index: 1 } })

    act(() => {
      elementWith('Adresse Empfänger').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      )
    })

    expect(onMove).toHaveBeenCalledWith('header', 1, { x: 0, y: 21 })
  })

  it('designCanvasMovesFasterWithShiftTest', () => {
    const { onMove } = draw()

    act(() => {
      elementWith('Adresse Empfänger').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      )
    })

    expect(onMove).toHaveBeenCalledWith('header', 1, { x: 5, y: 20 })
  })

  it('designCanvasKeepsABlockOnThePageTest', () => {
    const { onMove } = draw()

    act(() => {
      elementWith('Absenderzeile').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      )
    })

    // Already at the top edge, so it stays there instead of walking off the band.
    expect(onMove).toHaveBeenCalledWith('header', 0, { x: 0, y: 0 })
  })

  it('designCanvasShowsAResizeHandleOnTheSelectedBlockTest', () => {
    draw({ selection: { band: 'header', index: 0 } })

    // Only the selected block carries one, so the page is not covered in handles.
    expect(container.querySelectorAll('[aria-label$="in der Grösse ändern"]')).toHaveLength(1)
  })

  it('designCanvasWithoutASelectionShowsNoHandleTest', () => {
    draw()

    expect(container.querySelectorAll('[aria-label$="in der Grösse ändern"]')).toHaveLength(0)
  })

  it('designCanvasWithAnEmptyBodyTest', () => {
    draw({ definition: { ...FORM, body: [] } })

    expect(container.textContent).toContain('Noch keine Tabellen')
  })
})
