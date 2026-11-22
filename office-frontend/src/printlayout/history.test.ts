import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  redo,
  replacePresent,
  undo,
} from './history'

describe('createHistory', () => {
  it('createHistoryTest', () => {
    const history = createHistory('a')
    expect(history.present).toBe('a')
    expect(history.past).toEqual([])
    expect(history.future).toEqual([])
  })
})

describe('commit', () => {
  it('commitTest', () => {
    const history = commit(commit(createHistory('a'), 'b'), 'c')
    expect(history.present).toBe('c')
    expect(history.past).toEqual(['a', 'b'])
  })

  it('commitDropsWhatWasUndoneTest', () => {
    // A new change after an undo starts a new future.
    const undone = undo(commit(commit(createHistory('a'), 'b'), 'c'))
    const history = commit(undone, 'd')
    expect(history.past).toEqual(['a', 'b'])
    expect(history.present).toBe('d')
    expect(canRedo(history)).toBe(false)
  })

  it('commitWithTheSameStateTest', () => {
    const history = commit(createHistory('a'), 'b')
    expect(commit(history, 'b')).toBe(history)
  })

  it('commitMergesQuickChangesOfOneKindTest', () => {
    // Holding an arrow key: many moves, one step back.
    let history = commit(createHistory('a'), 'b', { mergeKey: 'nudge', at: 1000 })
    history = commit(history, 'c', { mergeKey: 'nudge', at: 1200 })
    history = commit(history, 'd', { mergeKey: 'nudge', at: 1400 })

    expect(history.present).toBe('d')
    expect(history.past).toEqual(['a'])
    expect(undo(history).present).toBe('a')
  })

  it('commitDoesNotMergeAcrossKindsOrPausesTest', () => {
    let history = commit(createHistory('a'), 'b', { mergeKey: 'nudge', at: 1000 })
    // Another kind of change is its own step.
    history = commit(history, 'c', { mergeKey: 'text', at: 1100 })
    expect(history.past).toEqual(['a', 'b'])
    // And so is the same kind after a pause.
    history = commit(history, 'd', { mergeKey: 'text', at: 1100 + MERGE_WINDOW_MS + 1 })
    expect(history.past).toEqual(['a', 'b', 'c'])
    // Exactly at the end of the window still merges.
    history = commit(history, 'e', { mergeKey: 'text', at: 1100 + 2 * MERGE_WINDOW_MS + 1 })
    expect(history.past).toEqual(['a', 'b', 'c'])
    // A change without a key never merges.
    history = commit(history, 'f', { at: 1100 + 2 * MERGE_WINDOW_MS + 2 })
    expect(history.past).toEqual(['a', 'b', 'c', 'e'])
  })

  it('commitForgetsTheOldestStepsTest', () => {
    let history = createHistory(0)
    for (let step = 1; step <= HISTORY_LIMIT + 20; step++) history = commit(history, step)

    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]).toBe(20)
    expect(history.present).toBe(HISTORY_LIMIT + 20)
  })
})

describe('replacePresent', () => {
  it('replacePresentTest', () => {
    const history = replacePresent(commit(createHistory('a'), 'b'), 'B')
    expect(history.present).toBe('B')
    // No step was added: one undo still leads to the start.
    expect(history.past).toEqual(['a'])
  })

  it('replacePresentEndsAMergeTest', () => {
    let history = commit(createHistory('a'), 'b', { mergeKey: 'nudge', at: 1000 })
    history = replacePresent(history, 'b2')
    history = commit(history, 'c', { mergeKey: 'nudge', at: 1100 })
    expect(history.past).toEqual(['a', 'b2'])
  })
})

describe('undo', () => {
  it('undoTest', () => {
    const history = undo(commit(commit(createHistory('a'), 'b'), 'c'))
    expect(history.present).toBe('b')
    expect(history.past).toEqual(['a'])
    expect(history.future).toEqual(['c'])
  })

  it('undoDownToTheStartTest', () => {
    const history = undo(undo(commit(commit(createHistory('a'), 'b'), 'c')))
    expect(history.present).toBe('a')
    expect(canUndo(history)).toBe(false)
    expect(history.future).toEqual(['b', 'c'])
  })

  it('undoWithNothingToUndoTest', () => {
    const history = createHistory('a')
    expect(undo(history)).toBe(history)
  })
})

describe('redo', () => {
  it('redoTest', () => {
    const history = redo(undo(undo(commit(commit(createHistory('a'), 'b'), 'c'))))
    expect(history.present).toBe('b')
    expect(history.future).toEqual(['c'])
  })

  it('redoBackToTheEndTest', () => {
    const start = commit(commit(createHistory('a'), 'b'), 'c')
    const history = redo(redo(undo(undo(start))))
    expect(history.present).toBe('c')
    expect(history.past).toEqual(['a', 'b'])
    expect(canRedo(history)).toBe(false)
  })

  it('redoWithNothingToRedoTest', () => {
    const history = commit(createHistory('a'), 'b')
    expect(redo(history)).toBe(history)
  })
})

describe('canUndo', () => {
  it('canUndoTest', () => {
    expect(canUndo(commit(createHistory('a'), 'b'))).toBe(true)
  })

  it('canUndoAtTheStartTest', () => {
    expect(canUndo(createHistory('a'))).toBe(false)
  })
})

describe('canRedo', () => {
  it('canRedoTest', () => {
    expect(canRedo(undo(commit(createHistory('a'), 'b')))).toBe(true)
  })

  it('canRedoWithoutAnUndoTest', () => {
    expect(canRedo(commit(createHistory('a'), 'b'))).toBe(false)
  })
})
