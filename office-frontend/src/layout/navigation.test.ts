import { describe, expect, it } from 'vitest'
import { BASIC_DATA_LISTS } from '../lib/basicData'
import { flattenNav, isFolder, NAV_GROUPS, type NavEntry } from './navigation'

/** Every screen the menu links to, across all groups. */
function allEntries(): NavEntry[] {
  return NAV_GROUPS.flatMap((group) => flattenNav(group.entries))
}

describe('NAV_GROUPS', () => {
  /**
   * The point of the rebuild: a list that is not in the menu is only reachable by typing its
   * address, which is the state this replaced.
   */
  it('navGroupsCoverEveryBasicDataListTest', () => {
    const linked = new Set(
      allEntries()
        .map((entry) => entry.href)
        .filter((href) => href.startsWith('/basisdaten/')),
    )

    for (const list of BASIC_DATA_LISTS) {
      expect(linked).toContain(`/basisdaten/${list.slug}`)
    }
    expect(linked.size).toBe(BASIC_DATA_LISTS.length)
  })

  /** Menu and page heading name the same list, so neither can be renamed on its own. */
  it('navGroupsUseTheListLabelsTest', () => {
    const byHref = new Map(allEntries().map((entry) => [entry.href, entry.label]))

    for (const list of BASIC_DATA_LISTS) {
      expect(byHref.get(`/basisdaten/${list.slug}`)).toBe(list.label)
    }
  })

  it('navGroupsHaveNoDuplicateHrefsTest', () => {
    const hrefs = allEntries().map((entry) => entry.href)

    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('navGroupsUseInAppPathsTest', () => {
    for (const entry of allEntries()) {
      expect(entry.href.startsWith('/')).toBe(true)
      expect(entry.href.startsWith('//')).toBe(false)
    }
  })

  it('navGroupsAreLabelledTest', () => {
    for (const group of NAV_GROUPS) {
      expect(group.title.trim()).not.toBe('')
      expect(group.entries.length).toBeGreaterThan(0)
    }
    for (const entry of allEntries()) {
      expect(entry.label.trim()).not.toBe('')
    }
  })

  /** A folder that holds nothing would fold open onto an empty box. */
  it('navGroupsFoldersHoldEntriesTest', () => {
    for (const group of NAV_GROUPS) {
      for (const node of group.entries) {
        if (isFolder(node)) expect(node.children.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('flattenNav', () => {
  it('flattenNavTest', () => {
    const stammdaten = NAV_GROUPS.find((group) => group.title === 'Stammdaten')

    expect(flattenNav(stammdaten?.entries ?? []).map((entry) => entry.href)).toEqual([
      '/kunden',
      '/lieferanten',
      '/produkte',
      '/zahlungskonditionen',
      '/preisgruppen',
    ])
  })

  /**
   * The three screens of one document belong together, and the order is the order somebody
   * sets them up in: first the kinds, then what they print on, then their numbers.
   */
  it('flattenNavHoldsTheDocumentScreensTogetherTest', () => {
    const einstellungen = NAV_GROUPS.find((group) => group.title === 'Einstellungen')
    const belegwesen = einstellungen?.entries.find(
      (node) => isFolder(node) && node.label === 'Belegwesen',
    )

    expect(belegwesen).toBeDefined()
    expect(flattenNav(belegwesen === undefined ? [] : [belegwesen]).map((entry) => entry.href))
      .toEqual(['/belegarten', '/druckvorlagen', '/drucker', '/nummernkreise'])
  })

  it('flattenNavWithoutFolderTest', () => {
    const uebersicht = NAV_GROUPS.find((group) => group.title === 'Übersicht')

    expect(flattenNav(uebersicht?.entries ?? []).map((entry) => entry.href)).toEqual(['/'])
  })

  it('flattenNavWithEmptyListTest', () => {
    expect(flattenNav([])).toEqual([])
  })
})
