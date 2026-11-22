import { describe, expect, it } from 'vitest'
import { createDraftRegistry } from './drafts'

describe('createDraftRegistry', () => {
  it('createDraftRegistryTest', () => {
    const registry = createDraftRegistry()
    const asked: (EventTarget | null)[] = []
    registry.register((target) => {
      asked.push(target)
      return true
    })
    const target = new EventTarget()

    // Every field is asked, and is told what the pointer went down on.
    expect(registry.flush(target)).toBe(true)
    expect(asked).toEqual([target])
    expect(registry.flush()).toBe(true)
    expect(asked).toEqual([target, null])
  })

  it('createDraftRegistryWithARefusingFieldTest', () => {
    const registry = createDraftRegistry()
    let later = 0
    registry.register(() => false)
    registry.register(() => {
      later += 1
      return true
    })

    // One field cannot hand in what it holds: the answer is no — but the others are still
    // asked, so each of them commits or complains for itself.
    expect(registry.flush()).toBe(false)
    expect(later).toBe(1)
  })

  it('createDraftRegistryWithoutFieldsTest', () => {
    expect(createDraftRegistry().flush()).toBe(true)
  })

  it('createDraftRegistryForgetsAFieldTest', () => {
    const registry = createDraftRegistry()
    let asked = 0
    const forget = registry.register(() => {
      asked += 1
      return false
    })
    forget()

    // A field that left the screen is not asked any more, and cannot hold a save up.
    expect(registry.flush()).toBe(true)
    expect(asked).toBe(0)
  })
})
