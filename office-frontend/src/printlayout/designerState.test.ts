import { describe, expect, it } from 'vitest'
import { nudgeSelection, removeSelection } from './commands'
import { moveElement } from './definition'
import {
  designerReducer,
  initialDesignerState,
  type DesignerAction,
  type DesignerState,
} from './designerState'
import { sampleCatalogue, sampleForm } from './fixtures'

const CATALOGUE = sampleCatalogue()
const start = () => initialDesignerState(sampleForm())
const run = (state: DesignerState, ...actions: DesignerAction[]) =>
  actions.reduce(designerReducer, state)

describe('initialDesignerState', () => {
  it('initialDesignerStateTest', () => {
    const form = sampleForm()
    const state = initialDesignerState(form)
    expect(state.history.present).toEqual({ definition: form, selection: [] })
    expect(state.history.past).toEqual([])
    expect(state.clipboard).toEqual([])
    expect(state.message).toBe('')
  })
})

describe('designerReducer', () => {
  it('designerReducerTest', () => {
    // Select, move, and the move is one step with an announcement.
    const state = run(
      start(),
      { type: 'select', selection: ['e:1'] },
      {
        type: 'run',
        command: (snapshot) => nudgeSelection(snapshot, 5, 0, CATALOGUE),
        at: 1000,
      },
    )

    expect(state.history.present.definition.elements[1].x).toBe(135)
    expect(state.history.present.selection).toEqual(['e:1'])
    expect(state.history.past).toHaveLength(1)
    expect(state.message).toBe('Belegnummer: 135 mm von links, 50 mm von oben')
    expect(state.messageId).toBe(1)
  })

  it('designerReducerSelectIsNoStepTest', () => {
    const state = run(start(), { type: 'select', selection: ['e:1'] })
    expect(state.history.present.selection).toEqual(['e:1'])
    expect(state.history.past).toEqual([])
  })

  it('designerReducerSelectDropsWhatIsNotThereTest', () => {
    const state = run(start(), { type: 'select', selection: ['e:1', 'e:99'] })
    expect(state.history.present.selection).toEqual(['e:1'])
    // Selecting what is selected already changes nothing at all.
    expect(designerReducer(state, { type: 'select', selection: ['e:1'] })).toBe(state)
  })

  it('designerReducerCommitTest', () => {
    const form = sampleForm()
    const moved = moveElement(form, 'e:0', { x: 30, y: 30 })
    const state = designerReducer(initialDesignerState(form), {
      type: 'commit',
      outcome: { definition: moved, selection: ['e:0'], announcement: 'Verschoben.' },
      at: 1000,
    })
    expect(state.history.present.definition).toBe(moved)
    expect(state.history.past).toHaveLength(1)
    expect(state.message).toBe('Verschoben.')
  })

  it('designerReducerCommitWithoutAChangeTest', () => {
    // A command that only moves the selection leaves nothing to undo.
    const form = sampleForm()
    const state = designerReducer(initialDesignerState(form), {
      type: 'commit',
      outcome: { definition: form, selection: ['s:1'], announcement: 'Ausgewählt.' },
      at: 1000,
    })
    expect(state.history.past).toEqual([])
    expect(state.history.present.selection).toEqual(['s:1'])
    expect(state.message).toBe('Ausgewählt.')
  })

  it('designerReducerRunWithNothingToDoTest', () => {
    const state = start()
    // Nothing is selected, so there is nothing to delete — and nothing is recorded.
    expect(
      designerReducer(state, {
        type: 'run',
        command: (snapshot) => removeSelection(snapshot, CATALOGUE),
        at: 1000,
      }),
    ).toBe(state)
  })

  it('designerReducerUndoAndRedoTest', () => {
    const nudge = (at: number): DesignerAction => ({
      type: 'run',
      command: (snapshot) => nudgeSelection(snapshot, 5, 0, CATALOGUE),
      at,
    })
    const moved = run(start(), { type: 'select', selection: ['e:1'] }, nudge(1000), nudge(5000))
    expect(moved.history.present.definition.elements[1].x).toBe(140)

    const undone = designerReducer(moved, { type: 'undo' })
    expect(undone.history.present.definition.elements[1].x).toBe(135)
    // The selection comes back with the state it belonged to.
    expect(undone.history.present.selection).toEqual(['e:1'])
    expect(undone.message).toBe('Rückgängig gemacht.')

    const redone = designerReducer(undone, { type: 'redo' })
    expect(redone.history.present.definition.elements[1].x).toBe(140)
    expect(redone.message).toBe('Wiederholt.')
  })

  it('designerReducerMergesQuickNudgesTest', () => {
    // Holding an arrow key: three moves, one step back.
    const nudge = (at: number): DesignerAction => ({
      type: 'run',
      command: (snapshot) => nudgeSelection(snapshot, 0.5, 0, CATALOGUE),
      mergeKey: 'nudge',
      at,
    })
    const moved = run(
      start(),
      { type: 'select', selection: ['e:1'] },
      nudge(1000),
      nudge(1100),
      nudge(1200),
    )
    expect(moved.history.present.definition.elements[1].x).toBe(131.5)
    expect(moved.history.past).toHaveLength(1)
    expect(designerReducer(moved, { type: 'undo' }).history.present.definition.elements[1].x).toBe(
      130,
    )
  })

  it('designerReducerUndoWithNothingToUndoTest', () => {
    const state = designerReducer(start(), { type: 'undo' })
    expect(state.history.present.definition).toEqual(sampleForm())
    expect(state.message).toBe('Es gibt nichts rückgängig zu machen.')
    expect(designerReducer(start(), { type: 'redo' }).message).toBe('Es gibt nichts zu wiederholen.')
  })

  it('designerReducerCopyAndPasteTest', () => {
    const copied = run(start(), { type: 'select', selection: ['e:1'] }, { type: 'copy' })
    expect(copied.clipboard).toHaveLength(1)
    expect(copied.message).toBe('Kopiert. Einfügen mit Strg+V.')

    const pasted = designerReducer(copied, { type: 'paste', at: 1000 })
    expect(pasted.history.present.definition.elements).toHaveLength(5)
    expect(pasted.history.present.selection).toEqual(['e:4'])
    // The clipboard stays: pasting twice gives two copies, the second beside the first.
    const twice = designerReducer(pasted, { type: 'paste', at: 3000 })
    expect(twice.history.present.definition.elements).toHaveLength(6)
    expect(twice.history.present.definition.elements[4].x).toBe(135)
    expect(twice.history.present.definition.elements[5].x).toBe(140)
  })

  it('designerReducerCopyAndPasteWithNothingTest', () => {
    const state = start()
    expect(designerReducer(state, { type: 'copy' })).toBe(state)
    expect(designerReducer(state, { type: 'paste', at: 1000 })).toBe(state)
  })

  it('designerReducerAnnounceTest', () => {
    const first = designerReducer(start(), { type: 'announce', message: 'Gespeichert.' })
    const second = designerReducer(first, { type: 'announce', message: 'Gespeichert.' })
    expect(second.message).toBe('Gespeichert.')
    // The same sentence twice still counts twice, so it is read out twice.
    expect(second.messageId).toBe(2)
  })

  it('designerReducerIsPureTest', () => {
    const state = start()
    const action: DesignerAction = {
      type: 'run',
      command: (snapshot) => nudgeSelection({ ...snapshot, selection: ['e:1'] }, 5, 0, CATALOGUE),
      at: 1000,
    }
    // The same action on the same state gives the same result, and leaves the state alone.
    expect(designerReducer(state, action)).toEqual(designerReducer(state, action))
    expect(state.history.present.definition).toEqual(sampleForm())
  })
})
