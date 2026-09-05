// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntryTemplate, EntryTemplateLine } from '../../lib/types'
import { EntryTemplateMenu, NO_TEMPLATE_NOTE } from './EntryTemplateMenu'

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
})

const onApply = vi.fn()
const onSave = vi.fn()
const onManage = vi.fn()

function line(over: Partial<EntryTemplateLine> = {}): EntryTemplateLine {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    side: 'DEBIT',
    amount: 3200,
    taxCodeId: null,
    taxCode: null,
    text: null,
    postable: true,
    ...over,
  }
}

function template(over: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 300,
    name: 'Miete Geschäftslokal',
    description: 'jeden Monatsletzten',
    entryDescription: 'Miete September',
    documentReference: 'MB-144',
    carriesAmounts: true,
    sortOrder: 0,
    version: 3,
    lines: [line()],
    problems: [],
    ...over,
  }
}

const MISSING_ACCOUNT = 'Konto 6105 gibt es in Ihrem Kontenplan nicht mehr.'

function paint(templates: EntryTemplate[]) {
  onApply.mockClear()
  onSave.mockClear()
  onManage.mockClear()
  act(() =>
    root.render(
      <EntryTemplateMenu
        templates={templates}
        onApply={onApply}
        onSave={onSave}
        onManage={onManage}
      />,
    ),
  )
}

/** The left half. */
function primary(): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Vorlage anwenden'),
  ) as HTMLButtonElement
}

/** The arrow. */
function toggle(): HTMLButtonElement {
  return container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
}

function menuItems(): HTMLButtonElement[] {
  return [...container.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[]
}

describe('EntryTemplateMenu', () => {
  /**
   * The decision this test nails down: with no template the **left half** goes off and the
   * arrow does not. Behind the arrow sits the only way to a first template, and a wholly
   * disabled button would lock the tenant out of it — the mask would bolt itself shut.
   */
  it('applyTemplateWithoutTemplatesTest', () => {
    paint([])

    expect(primary().disabled).toBe(true)
    expect(toggle().disabled).toBe(false)

    act(() => toggle().click())

    expect(container.querySelector('[role="presentation"]')?.textContent).toBe(NO_TEMPLATE_NOTE)
    expect(menuItems().map((item) => item.textContent)).toEqual([
      'Als Vorlage speichern …',
      'Vorlagen verwalten …',
    ])
    // The note stands above the rule, the two dialogs below it.
    expect(menuItems()[0].getAttribute('data-separator')).toBe('true')

    act(() => menuItems()[0].click())
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  /** The finding travels as a finished sentence and the entry carries the ⚠ beside it. */
  it('markTemplateWithMissingAccountTest', () => {
    paint([
      template({ id: 300, name: 'Miete Geschäftslokal' }),
      template({
        id: 302,
        name: 'Krankentaggeld',
        description: 'monatlich',
        problems: [MISSING_ACCOUNT],
      }),
    ])
    act(() => toggle().click())

    const marked = menuItems()[1]
    expect(marked.textContent).toContain('Krankentaggeld')
    expect(marked.textContent).toContain(MISSING_ACCOUNT)
    expect(marked.querySelector('svg')).not.toBeNull()
    // The sound template carries neither.
    expect(menuItems()[0].textContent).toContain('jeden Monatsletzten')
    expect(menuItems()[0].querySelector('svg')).toBeNull()
  })

  /** A template with a finding stays applicable: it is the property of the tenant. */
  it('applyTemplateFromTheMenuTest', () => {
    const second = template({ id: 301, name: 'Lohn Mitarbeiter A' })
    paint([template(), second])
    act(() => toggle().click())

    act(() => menuItems()[1].click())

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(second)
  })

  /**
   * The left half fires the **first** template of the list — the one the tenant put on top.
   * That is what gives the order a visible purpose.
   */
  it('applyFirstTemplateFromThePrimaryHalfTest', () => {
    const first = template({ id: 300, name: 'Miete Geschäftslokal' })
    paint([first, template({ id: 301, name: 'Lohn Mitarbeiter A' })])

    expect(primary().disabled).toBe(false)
    act(() => primary().click())

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(first)
  })

  /** And the second dialog is reachable the same way. */
  it('manageTemplatesFromTheMenuTest', () => {
    paint([template()])
    act(() => toggle().click())

    act(() => menuItems()[2].click())

    expect(onManage).toHaveBeenCalledTimes(1)
  })
})
