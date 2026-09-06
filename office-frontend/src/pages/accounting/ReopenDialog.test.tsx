// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClosingEntry } from '../../lib/types'
import { ReopenDialog } from './ReopenDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The three entries an ordinary close leaves behind, each of which gets a counter entry. */
const ENTRIES: ClosingEntry[] = [
  {
    entryId: 91,
    entryNumber: '2026-000480',
    bookingDate: '2026-12-31',
    description: 'Abschluss 2026: Erfolgskonten auf 9200',
    documentReference: 'JA-2026-1',
    reversed: false,
  },
  {
    entryId: 92,
    entryNumber: '2026-000481',
    bookingDate: '2026-12-31',
    description: 'Abschluss 2026: Jahresergebnis auf 2979',
    documentReference: 'JA-2026-2',
    reversed: false,
  },
  {
    entryId: 93,
    entryNumber: '2027-000001',
    bookingDate: '2027-01-01',
    description: 'Eröffnungsbilanz per 01.01.2027',
    documentReference: 'EB-2027',
    reversed: false,
  },
]

let container: HTMLDivElement
let root: Root
let reopened: string[]
let closed: number

beforeEach(() => {
  reopened = []
  closed = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function paint(
  over: Partial<Parameters<typeof ReopenDialog>[0]> = {},
) {
  await act(async () => {
    root.render(
      <ReopenDialog
        open
        yearLabel="2026"
        entries={ENTRIES}
        busy={false}
        error={null}
        onReopen={(reason) => reopened.push(reason)}
        onClose={() => {
          closed += 1
        }}
        {...over}
      />,
    )
  })
}

function text() {
  return container.textContent ?? ''
}

/** Matched loosely: a busy button carries a spinner beside its wording. */
function button(label: string) {
  return [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  )
}

async function type(value: string) {
  const field = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * The reopening dialog: the one move of the bookkeeping that asks for a reason.
 *
 * <p>What is checked here is the pair the backend also holds: nothing happens without a reason,
 * and the sentence the user reads first says that the closing entries stay where they are. «Wieder
 * öffnen» sounds like undoing and is not — a counter entry is written beside each closing entry,
 * and both stay in the journal (OR Art. 958f).
 */
describe('ReopenDialog', () => {
  /** The warning is the first thing in the box, before the field that asks for anything. */
  it('reopenDialogSaysNothingIsDeletedTest', async () => {
    await paint()

    expect(text()).toContain('Geschäftsjahr 2026 wieder öffnen')
    expect(text()).toContain('Der Abschluss wird zurückgenommen, nicht gelöscht.')
    expect(text()).toContain('Es werden 3 Gegenbuchungen geschrieben.')
    expect(text()).toContain('Die ursprünglichen Buchungen bleiben im Journal stehen.')
  })

  /**
   * <b>Journal number and Buchungstext, not a count.</b> The count says how much happens; these
   * two say what happens, and they are what somebody looks for in the journal afterwards.
   */
  it('reopenDialogNamesTheCounterEntriesTest', async () => {
    await paint()

    expect(text()).toContain('2026-000480')
    expect(text()).toContain('Abschluss 2026: Erfolgskonten auf 9200')
    expect(text()).toContain('2026-000481')
    expect(text()).toContain('Abschluss 2026: Jahresergebnis auf 2979')
    expect(text()).toContain('2027-000001')
    expect(text()).toContain('Eröffnungsbilanz per 01.01.2027')
  })

  /** The list comes from the caller: a year closed without a carry forward has fewer. */
  it('reopenDialogNamesHowManyEntriesAreTakenBackTest', async () => {
    await paint({ entries: ENTRIES.slice(0, 2) })

    expect(text()).toContain('Es werden 2 Gegenbuchungen geschrieben.')
    expect(text()).not.toContain('2027-000001')
  })

  /**
   * <b>A later year that is not open replaces the whole dialog.</b> The backend refuses in that
   * case, and asking for a reason first only to throw it away would be the rudest way of saying
   * so. The sentence is the one the backend refuses with, word for word.
   */
  it('reopenDialogWithALaterYearInTheWayTest', async () => {
    await paint({
      blockedBy: {
        label: '2027',
        message:
          'Das Geschäftsjahr 2027 ist abgeschlossen. Öffnen Sie zuerst 2027, dann 2026.',
      },
    })

    expect(text()).toContain(
      'Das Geschäftsjahr 2027 ist abgeschlossen. Öffnen Sie zuerst 2027, dann 2026.',
    )
    expect(container.querySelector('textarea')).toBeNull()
    expect(button('Wieder öffnen')).toBeUndefined()
    expect(button('Schliessen')).toBeDefined()
  })

  /**
   * <b>And the notice leads there.</b> The cascade is deliberately not automated — whoever wants
   * three years open decides it three times — so the one thing the notice owes its reader is the
   * way to the year that has to be opened first.
   */
  it('reopenDialogLeadsToTheYearInTheWayTest', async () => {
    let led = 0
    await paint({
      blockedBy: {
        label: '2027',
        message:
          'Das Geschäftsjahr 2027 ist abgeschlossen. Öffnen Sie zuerst 2027, dann 2026.',
      },
      onOpenBlockedYear: () => {
        led += 1
      },
    })

    const way = button('Geschäftsjahr 2027 öffnen')
    expect(way).toBeDefined()
    await act(async () => {
      way?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(led).toBe(1)
    expect(reopened).toEqual([])
  })

  /**
   * A locked later year is in the way exactly as a closed one, and it is not called
   * abgeschlossen: the wording comes from the caller and is the one the backend refuses with.
   */
  it('reopenDialogWithALockedLaterYearTest', async () => {
    await paint({
      blockedBy: {
        label: '2027',
        message: 'Das Geschäftsjahr 2027 ist gesperrt. Öffnen Sie zuerst 2027, dann 2026.',
      },
    })

    expect(text()).toContain('Das Geschäftsjahr 2027 ist gesperrt.')
    expect(container.querySelector('textarea')).toBeNull()
  })

  /** Without a way to that year the notice still stands: it says what is wrong, and no less. */
  it('reopenDialogWithALaterYearAndNoWayToItTest', async () => {
    await paint({
      blockedBy: { label: '2027', message: 'Das Geschäftsjahr 2027 ist abgeschlossen.' },
    })

    expect(text()).toContain('Das Geschäftsjahr 2027 ist abgeschlossen.')
    expect(button('Geschäftsjahr 2027 öffnen')).toBeUndefined()
  })

  /** No reason, no button: the caller is spared a 400 they could have been warned about. */
  it('reopenDialogWithoutAReasonTest', async () => {
    await paint()

    expect(button('Wieder öffnen')?.disabled).toBe(true)
    await act(async () => {
      button('Wieder öffnen')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(reopened).toEqual([])
  })

  /** Whitespace is not a reason either — the backend trims it away and would refuse. */
  it('reopenDialogWithABlankReasonTest', async () => {
    await paint()
    await type('   ')

    expect(button('Wieder öffnen')?.disabled).toBe(true)
  })

  /** With a reason the button works, and what is sent is the trimmed text. */
  it('reopenDialogWithAReasonTest', async () => {
    await paint()
    await type('  Nachträgliche Abgrenzung Miete Dezember  ')

    expect(button('Wieder öffnen')?.disabled).toBe(false)
    await act(async () => {
      button('Wieder öffnen')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(reopened).toEqual(['Nachträgliche Abgrenzung Miete Dezember'])
  })

  /**
   * The reason becomes «Storno zu 2026-000045: …» in the Buchungstext of every counter entry, a
   * 200-character column — so the room is smaller than the column, and depends on how long the
   * journal number is. 170 is safe for any number of up to eighteen characters; the backend
   * checks the exact room again, where the number is known. Said here rather than answered as a
   * 400 the person could have been spared.
   */
  it('reopenDialogWithATooLongReasonTest', async () => {
    await paint()
    await type('a'.repeat(171))

    expect(button('Wieder öffnen')?.disabled).toBe(true)
    expect(text()).toContain('170 Zeichen sind das Höchstmass')
    expect(text()).toContain('Storno zu')
  })

  /** Exactly 170 is allowed: the boundary belongs to what always fits, not beyond it. */
  it('reopenDialogWithAReasonOfExactlyTheLimitTest', async () => {
    await paint()
    await type('a'.repeat(170))

    expect(button('Wieder öffnen')?.disabled).toBe(false)
  })

  /** A run in flight takes no second click, and the button says it is working. */
  it('reopenDialogWhileTheRunIsInFlightTest', async () => {
    await paint({ busy: true })
    await type('Nachträgliche Abgrenzung')

    const submit = button('Wieder öffnen')
    expect(submit?.disabled).toBe(true)
    await act(async () => {
      submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(reopened).toEqual([])
  })

  /** A refusal is shown in the box rather than closing it: the typed reason stays. */
  it('reopenDialogWithARefusalTest', async () => {
    await paint({ error: new Error('Das Folgejahr 2027 ist abgeschlossen.') })

    expect(text()).toContain('Das Folgejahr 2027 ist abgeschlossen.')
    expect(container.querySelector('textarea')).not.toBeNull()
  })

  /** «Abbrechen» closes and clears, so the next opening does not show the old reason. */
  it('reopenDialogCancelsTest', async () => {
    await paint()
    await type('Nachträgliche Abgrenzung')

    await act(async () => {
      button('Abbrechen')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(closed).toBe(1)
    expect(reopened).toEqual([])
    expect((container.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? '').toBe(
      '',
    )
  })
})
