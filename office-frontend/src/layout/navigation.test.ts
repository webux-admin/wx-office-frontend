import { describe, expect, it } from 'vitest'
import { BASIC_DATA_LISTS } from '../lib/basicData'
import { SALES_DOCUMENT_KINDS } from '../lib/salesDocument'
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

  /**
   * Menu and routes are built from one table, and this says so: a kind of document added there
   * has to be reachable through the menu too, under its own address and behind its own read
   * right — not only by typing the path.
   */
  it('navGroupsCoverEverySalesDocumentTest', () => {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    const entries = flattenNav(sales?.entries ?? [])

    expect(entries.map((entry) => entry.href)).toEqual(
      SALES_DOCUMENT_KINDS.map((kind) => kind.path),
    )
    for (const kind of SALES_DOCUMENT_KINDS) {
      const entry = entries.find((candidate) => candidate.href === kind.path)
      expect(entry?.label).toBe(kind.plural)
      expect(entry?.permission).toBe(kind.rights.read)
    }
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

  /**
   * Settings split into two groups: what several modules read, and one folder per module for
   * what only that module reads. The old collective groups are gone — an entry surviving under
   * «Basisdaten» would be the state ADR-0011 replaced.
   */
  it('navGroupsSplitSettingsIntoSystemAndModuleTest', () => {
    const titles = NAV_GROUPS.map((group) => group.title)

    expect(titles).toContain('Systemeinstellungen')
    expect(titles).toContain('Moduleinstellungen')
    expect(titles).not.toContain('Basisdaten')
    expect(titles).not.toContain('Einstellungen')
  })

  /** Module settings come per module, so every top level entry there is a module folder. */
  it('navGroupsListModuleSettingsPerModuleTest', () => {
    const module = NAV_GROUPS.find((group) => group.title === 'Moduleinstellungen')

    expect(module).toBeDefined()
    for (const node of module?.entries ?? []) {
      expect(isFolder(node)).toBe(true)
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
   * The screens of one document belong together, and the order is the order somebody sets
   * them up in: the kinds, what they print on, their numbers, then billing and dunning.
   */
  it('flattenNavHoldsTheDocumentScreensTogetherTest', () => {
    const module = NAV_GROUPS.find((group) => group.title === 'Moduleinstellungen')
    const belege = module?.entries.find((node) => isFolder(node) && node.label === 'Belege')

    expect(belege).toBeDefined()
    expect(flattenNav(belege === undefined ? [] : [belege]).map((entry) => entry.href)).toEqual([
      '/belegarten',
      '/druckvorlagen',
      '/drucker',
      '/nummernkreise',
      '/basisdaten/verrechnungsarten',
      '/basisdaten/mahnarten',
    ])
  })

  it('flattenNavWithoutFolderTest', () => {
    const uebersicht = NAV_GROUPS.find((group) => group.title === 'Übersicht')

    expect(flattenNav(uebersicht?.entries ?? []).map((entry) => entry.href)).toEqual(['/'])
  })

  it('flattenNavWithEmptyListTest', () => {
    expect(flattenNav([])).toEqual([])
  })
})
