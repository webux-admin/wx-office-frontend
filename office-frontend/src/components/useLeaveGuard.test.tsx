// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLeaveGuard } from './useLeaveGuard'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  vi.restoreAllMocks()
})

/** A mask with one button; the guard is the only thing under test. */
function Mask({ dirty, abandon }: { dirty: boolean; abandon: () => void }) {
  const { question } = useLeaveGuard(dirty, abandon)
  return (
    <>
      <p>Maske</p>
      {question}
    </>
  )
}

async function render(dirty: boolean, abandon: () => void) {
  await act(async () => {
    root.render(<Mask dirty={dirty} abandon={abandon} />)
  })
}

function escape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
}

function buttonNamed(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((entry) => entry.textContent === text)
}

describe('useLeaveGuard', () => {
  it('leavesAtOnceWithoutChangesTest', async () => {
    const abandon = vi.fn()
    await render(false, abandon)

    escape()

    expect(abandon).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('Änderungen verwerfen?')
  })

  it('asksBeforeLeavingWithChangesTest', async () => {
    const abandon = vi.fn()
    await render(true, abandon)

    escape()

    expect(document.body.textContent).toContain('Änderungen verwerfen?')
    expect(abandon).not.toHaveBeenCalled()
  })

  it('keepsTheMaskWhenTheQuestionIsAnsweredWithKeepTest', async () => {
    const abandon = vi.fn()
    await render(true, abandon)
    escape()

    await act(async () => {
      buttonNamed('Weiter bearbeiten')?.click()
    })

    expect(abandon).not.toHaveBeenCalled()
  })

  it('abandonsWhenTheQuestionIsAnsweredWithDiscardTest', async () => {
    const abandon = vi.fn()
    await render(true, abandon)
    escape()

    await act(async () => {
      buttonNamed('Verwerfen')?.click()
    })

    expect(abandon).toHaveBeenCalledTimes(1)
  })
})
