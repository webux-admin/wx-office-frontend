import { describe, expect, it } from 'vitest'
import { BASIC_DATA_LISTS } from '../lib/basicData'
import {
  MAIL_TEMPLATE_PATH,
  OUTBOX_ACCOUNT_PATH,
  OUTBOX_PATH,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import {
  DUNNING_BLOCKS_PATH,
  DUNNING_NOTICES_PATH,
  DUNNING_WORKLIST_PATH,
} from '../lib/dunning'
import { SECURITY_PATH } from '../lib/loginPolicy'
import { OPEN_ITEM_PATH, WRITE_OFF_RUN_PATH } from '../lib/openItem'
import { SALES_DOCUMENT_KINDS } from '../lib/salesDocument'
import {
  flattenNav,
  folderFor,
  isFolder,
  NAV_GROUPS,
  visibleNavGroups,
  type NavEntry,
  type NavModule,
} from './navigation'

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
   *
   * <p>Only the document entries are held against the table, not the whole group: the group
   * also carries screens that follow on from a document without being one — the dunning work
   * list is the first. What this test is about is that no kind of document is missing.
   */
  it('navGroupsCoverEverySalesDocumentTest', () => {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    const entries = flattenNav(sales?.entries ?? [])
    const paths = new Set<string>(SALES_DOCUMENT_KINDS.map((kind) => kind.path))

    expect(entries.map((entry) => entry.href).filter((href) => paths.has(href))).toEqual(
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

  /**
   * The working screens of the inventory stand together and in the order somebody uses them:
   * what lies there, what is missing, what is spoken for, the journal that explains them, the
   * counts and the report on a cut-off date the counts are held against. The setup screens
   * belong one group lower and are not part of this one.
   */
  it('navGroupsCoverTheInventoryGroupTest', () => {
    const lager = NAV_GROUPS.find((group) => group.title === 'Lager')
    const entries = flattenNav(lager?.entries ?? [])

    expect(entries.map((entry) => entry.href)).toEqual([
      '/bestand',
      '/unterdeckung',
      '/reservierungen',
      '/lagerbewegungen',
      '/inventuren',
      '/inventar',
    ])
    for (const entry of entries) {
      expect(entry.permission).toBe('INVENTORY_READ')
      expect(entry.module).toBe('INVENTORY')
    }
  })

  /**
   * Three screens for the outbox, and all three carry the module: a tenant that does not send
   * mail is offered neither the account, nor the log, nor the texts (backend ADR-0086).
   */
  it('navGroupsCoverTheOutboxScreensTest', () => {
    const outbox = allEntries().filter((entry) =>
      [OUTBOX_ACCOUNT_PATH, OUTBOX_PATH, MAIL_TEMPLATE_PATH].includes(entry.href),
    )

    expect(outbox).toHaveLength(3)
    for (const entry of outbox) {
      expect(entry.permission).toBe(OUTBOX_RIGHTS.read)
      expect(entry.module).toBe('OUTBOX')
    }
  })

  /**
   * The account stands with the tenant, the log and the texts with the documents. That split
   * is the decision of ADR-0020 and is worth a test: an account is an operating setting, a log
   * is worked with.
   */
  it('navGroupsPutTheAccountWithTheTenantTest', () => {
    const system = NAV_GROUPS.find((group) => group.title === 'Systemeinstellungen')
    const modules = NAV_GROUPS.find((group) => group.title === 'Moduleinstellungen')

    expect(flattenNav(system?.entries ?? []).map((entry) => entry.href)).toContain(
      OUTBOX_ACCOUNT_PATH,
    )
    expect(flattenNav(modules?.entries ?? []).map((entry) => entry.href)).toContain(OUTBOX_PATH)
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

  /**
   * The module screen stands beside «Mandanten» in the system settings, not in a folder of
   * its own under the module settings: the sorting rule of ADR-0011 asks how many modules
   * read the value, and the module switch is read by every one of them.
   *
   * <p>And it carries no `module` field. A screen that hides itself once somebody switches
   * everything off leaves no way back but psql (ADR-0018).
   */
  it('navGroupsHoldsTheModuleScreenTest', () => {
    const system = NAV_GROUPS.find((group) => group.title === 'Systemeinstellungen')
    const entry = system?.entries.find((node) => !isFolder(node) && node.label === 'Module')

    expect(entry).toBeDefined()
    expect(entry && !isFolder(entry) ? entry.href : undefined).toBe('/module')
    expect(entry?.permission).toBe('TENANT_READ')
    expect(entry?.module).toBeUndefined()
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
      '/preisgruppen',
      '/preise-erfassen',
      '/zahlungskonditionen',
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
      OUTBOX_PATH,
      MAIL_TEMPLATE_PATH,
      '/basisdaten/verrechnungsarten',
      '/basisdaten/mahnarten',
      '/basisdaten/mahnstopp-gruende',
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

describe('visibleNavGroups', () => {
  /** Every permission and every module: the menu stands as it is written. */
  const all = () => true
  const none = () => false

  function hrefs(groups: ReturnType<typeof visibleNavGroups>): string[] {
    return groups.flatMap((group) => flattenNav(group.entries)).map((entry) => entry.href)
  }

  it('visibleNavGroupsTest', () => {
    const visible = visibleNavGroups(all, () => true)

    expect(hrefs(visible)).toContain('/lagerorte')
    expect(hrefs(visible)).toContain('/kunden')
  })

  /**
   * Recht UND Schalter: a tenant that does not run the inventory does not see it, however
   * many inventory rights the session holds (ADR-0060 of the backend).
   */
  it('visibleNavGroupsHidesASwitchedOffModuleTest', () => {
    const visible = visibleNavGroups(all, () => false)

    expect(hrefs(visible)).not.toContain('/lagerorte')
    expect(hrefs(visible)).toContain('/kunden')
  })

  /**
   * The same for the outbox, and this one is worth its own case: three screens in two
   * different groups have to disappear together, and one of them sits among screens that stay.
   */
  it('visibleNavGroupsHidesTheOutboxWithoutTheModuleTest', () => {
    const visible = visibleNavGroups(all, (module) => module !== 'OUTBOX')

    expect(hrefs(visible)).not.toContain(OUTBOX_ACCOUNT_PATH)
    expect(hrefs(visible)).not.toContain(OUTBOX_PATH)
    expect(hrefs(visible)).not.toContain(MAIL_TEMPLATE_PATH)
    expect(hrefs(visible)).toContain('/nummernkreise')
    expect(hrefs(visible)).toContain('/mandanten')
  })

  it('visibleNavGroupsHidesTheOutboxWithoutTheRightTest', () => {
    const visible = visibleNavGroups(
      (permission) => permission !== OUTBOX_RIGHTS.read,
      () => true,
    )

    expect(hrefs(visible)).not.toContain(OUTBOX_PATH)
    expect(hrefs(visible)).toContain('/nummernkreise')
  })

  it('visibleNavGroupsHidesWhatThePermissionForbidsTest', () => {
    const visible = visibleNavGroups(
      (permission) => permission !== 'INVENTORY_READ',
      () => true,
    )

    expect(hrefs(visible)).not.toContain('/lagerorte')
  })

  /** A folder whose last child fell away disappears rather than folding open on nothing. */
  it('visibleNavGroupsDropsAnEmptyFolderTest', () => {
    const visible = visibleNavGroups(all, () => false)
    const module = visible.find((group) => group.title === 'Moduleinstellungen')

    expect(module?.entries.some((node) => isFolder(node) && node.label === 'Lager')).toBe(false)
  })

  it('visibleNavGroupsWithoutAnyPermissionTest', () => {
    const visible = visibleNavGroups(none, () => true)

    // Only the overview is left: it is the one entry that asks for no permission.
    expect(hrefs(visible)).toEqual(['/'])
  })

  /**
   * The security screen decides for the whole installation, so no right opens it — and no
   * amount of rights either. That is the case worth a test of its own: every other entry in
   * this menu is a matter of permissions (backend ADR-0090).
   */
  it('visibleNavGroupsHidesTheInstallationScreenFromEveryTenantRoleTest', () => {
    const visible = visibleNavGroups(all, () => true)

    expect(hrefs(visible)).not.toContain(SECURITY_PATH)
    expect(hrefs(visible)).toContain('/mandanten')
  })

  it('visibleNavGroupsShowsTheInstallationScreenToASuperuserTest', () => {
    const visible = visibleNavGroups(all, () => true, true)

    expect(hrefs(visible)).toContain(SECURITY_PATH)
  })

  /** A superuser gains that one entry and nothing else — the flag is not a second permission. */
  it('visibleNavGroupsGrantsNothingElseToASuperuserTest', () => {
    const asUser = hrefs(visibleNavGroups(none, () => true))
    const asSuperuser = hrefs(visibleNavGroups(none, () => true, true))

    expect(asSuperuser).toEqual([...asUser, SECURITY_PATH])
  })
})

/**
 * The register strip of a screen is the folder its menu entry sits in.
 *
 * <p>Derived, never maintained: the strip cannot disagree with the menu, and bundling a
 * screen into a folder stops making it harder to find (ADR-0031).
 */
describe('folderFor', () => {
  const all = () => true
  const none = () => false
  const runsAll = () => true

  function labels(
    pathname: string,
    can: (permission: string) => boolean = all,
    runs: (module: NavModule) => boolean = runsAll,
    superuser = false,
  ) {
    return folderFor(pathname, can, runs, superuser)?.children.map((child) => child.href)
  }

  it('folderForTest', () => {
    const folder = folderFor('/preisgruppen', all, runsAll)

    expect(folder?.label).toBe('Produkte')
    // In menu order, not in the order the addresses were asked for.
    expect(folder?.children.map((child) => child.href)).toEqual([
      '/produkte',
      '/preisgruppen',
      '/preise-erfassen',
      '/zahlungskonditionen',
    ])
  })

  it('folderForOutsideAnyFolderTest', () => {
    expect(folderFor('/kunden', all, runsAll)).toBeNull()
  })

  /**
   * Three of the maintained lists stand outside any folder although ten others share their
   * route. The strip is chosen by the address, which is why wrapping that route is harmless.
   */
  it('folderForOnAFlatListEntryTest', () => {
    expect(folderFor('/basisdaten/einheiten', all, runsAll)).toBeNull()
    expect(labels('/basisdaten/sprachen')).toContain('/basisdaten/laender')
  })

  it('folderForHidesWhatThePermissionForbidsTest', () => {
    const only = (permission: string) => (asked: string) => asked === permission

    expect(labels('/zahlungskonditionen', only('MASTERDATA_READ'))).toEqual([
      '/zahlungskonditionen',
    ])
    expect(labels('/produkte', only('PRODUCT_READ'))).toEqual([
      '/produkte',
      '/preisgruppen',
      '/preise-erfassen',
    ])
  })

  it('folderForHidesASwitchedOffModuleTest', () => {
    const withoutOutbox = (module: string) => module !== 'OUTBOX'

    const hrefs = labels('/belegarten', all, withoutOutbox) ?? []
    expect(hrefs).toContain('/belegarten')
    expect(hrefs).not.toContain(OUTBOX_PATH)
    expect(hrefs).not.toContain(MAIL_TEMPLATE_PATH)
  })

  /**
   * The proof test: a folder is compared exactly, not by prefix the way the sidebar folds.
   *
   * <p>A full mask of one record is not one of the siblings; it is what the sibling led to.
   */
  it('folderForOnADetailRouteTest', () => {
    expect(folderFor('/belegarten/42', all, runsAll)).toBeNull()
    expect(folderFor('/belegarten', all, runsAll)?.label).toBe('Belege')
  })

  /** Nothing to show, nothing to hang a strip on. */
  it('folderForWithoutAnyPermissionTest', () => {
    expect(folderFor('/zahlungskonditionen', none, runsAll)).toBeNull()
  })
})

/**
 * The open items and the collective write-off are one row in the menu and two screens.
 *
 * <p>The run keeps its own screen — «a run over a whole page is a piece of work, not a detail
 * of a list». What it gains is a roof (ADR-0031).
 */
describe('the open items folder', () => {
  const all = () => true
  const runsAll = () => true

  function openItems() {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    return sales?.entries.find(
      (node): node is Extract<typeof node, { children: unknown }> =>
        isFolder(node) && node.label === 'Offene Posten',
    )
  }

  it('navGroupsFoldTheOpenItemsTest', () => {
    const folder = openItems()

    expect(folder?.children.map((child) => child.href)).toEqual([
      OPEN_ITEM_PATH,
      WRITE_OFF_RUN_PATH,
    ])
    // INVOICE_READ on both: reading the proposal is a read. Only booking it needs the run
    // right, and the screen asks for that at its button.
    expect(folder?.children.every((child) => child.permission === 'INVOICE_READ')).toBe(true)
  })

  /** No module switch: the open item hangs on `document`, and there is nothing to switch off. */
  it('navGroupsLeaveTheOpenItemsUnswitchedTest', () => {
    const folder = openItems()

    expect(folder?.module).toBeUndefined()
    expect(folder?.children.every((child) => child.module === undefined)).toBe(true)
  })

  /** The proof test: an old bookmark on the run lands in the same folder as the list. */
  it('folderForHoldsTheOpenItemsTest', () => {
    const fromRun = folderFor(WRITE_OFF_RUN_PATH, all, runsAll)
    const fromList = folderFor(OPEN_ITEM_PATH, all, runsAll)

    expect(fromRun?.label).toBe('Offene Posten')
    expect(fromRun?.children.map((child) => child.href)).toEqual(
      fromList?.children.map((child) => child.href),
    )
  })
})

/**
 * The three dunning screens are one row, and the switch sits on the registers.
 *
 * <p>What went out is business correspondence with a ten-year retention; a module switch must
 * not hide it (backend ADR-0092). That is why «Mahnungen» comes first and carries no module —
 * it is what the folder head opens, and what a tenant without the dunning keeps.
 */
describe('the dunning folder', () => {
  function dunning() {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    return sales?.entries.find((node) => isFolder(node) && node.label === 'Mahnungen')
  }

  it('navGroupsHoldTheDunningFolderTest', () => {
    const folder = dunning()

    expect(folder && isFolder(folder) && folder.children.map((child) => child.href)).toEqual([
      DUNNING_NOTICES_PATH,
      DUNNING_WORKLIST_PATH,
      DUNNING_BLOCKS_PATH,
    ])
  })

  /** The retention rule, in a test for the first time. */
  it('navGroupsLeaveTheIssuedNoticesUnswitchedTest', () => {
    const folder = dunning()
    if (!folder || !isFolder(folder)) throw new Error('folder missing')

    expect(folder.module).toBeUndefined()
    expect(folder.children.map((child) => child.module)).toEqual([
      undefined,
      'DUNNING',
      'DUNNING',
    ])
  })

  /** Without the module exactly one register is left — and it is the one that has to stay. */
  it('folderForKeepsTheNoticesWithoutTheModuleTest', () => {
    const folder = folderFor(DUNNING_NOTICES_PATH, () => true, () => false)

    expect(folder?.children.map((child) => child.href)).toEqual([DUNNING_NOTICES_PATH])
    expect(folderFor(DUNNING_WORKLIST_PATH, () => true, () => false)).toBeNull()
  })
})

/**
 * The article, its price and the terms it is paid on stand together.
 *
 * <p>«Verkaufskonditionen» is gone as a level of its own — two clicks behind a word that
 * stands on no screen is not in the menu any more (ADR-0034).
 */
describe('the products folder', () => {
  function stammdaten() {
    return NAV_GROUPS.find((group) => group.title === 'Stammdaten')
  }

  /** The proof test. */
  it('navGroupsFoldTheSalesConditionsUnderProductsTest', () => {
    const group = stammdaten()
    const folder = group?.entries[2]

    expect(group?.entries).toHaveLength(3)
    expect(folder && isFolder(folder)).toBe(true)
    if (!folder || !isFolder(folder)) throw new Error('folder missing')
    expect(folder.label).toBe('Produkte')
    expect(folder.permission).toBeUndefined()
    expect(folder.module).toBeUndefined()
    expect(folder.children.map((child) => child.href)).toEqual([
      '/produkte',
      '/preisgruppen',
      '/preise-erfassen',
      '/zahlungskonditionen',
    ])
  })

  /**
   * No permission on the head, so the payment terms stay reachable for a session that may
   * read master data and no product.
   */
  it('visibleNavGroupsKeepsThePaymentTermForMasterDataOnlyTest', () => {
    const only = (permission: string) => (asked: string) => asked === permission

    const forMasterData = folderFor('/zahlungskonditionen', only('MASTERDATA_READ'), () => true)
    expect(forMasterData?.children.map((child) => child.href)).toEqual(['/zahlungskonditionen'])

    const forProducts = folderFor('/produkte', only('PRODUCT_READ'), () => true)
    expect(forProducts?.children.map((child) => child.href)).toEqual([
      '/produkte',
      '/preisgruppen',
      '/preise-erfassen',
    ])
  })
})
