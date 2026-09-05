import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  DRAFT_PATH,
  ENTRY_PATH,
  FISCAL_YEARS_PATH,
  CHART_OF_ACCOUNTS_PATH,
  JOURNAL_PATH,
  TAX_CODES_PATH,
} from '../lib/accounting'
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
import { CUSTOMER_CREDIT_PATH } from '../lib/customerCredit'
import { PAYMENT_RECEIPT_PATH } from '../lib/paymentReceipt'

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
   * Eleven maintained lists share one route and sit in three different folders.
   *
   * <p>The strip is chosen by the ADDRESS and not by the route — which is why wrapping
   * `/basisdaten/:liste` once is enough, and why the units and the dunning types get
   * different siblings out of the same route (ADR-0031, ADR-0035).
   */
  it('folderForOnAListEntryTest', () => {
    expect(folderFor('/basisdaten/einheiten', all, runsAll)?.label).toBe('Werte')
    expect(folderFor('/basisdaten/mahnarten', all, runsAll)?.label).toBe('Belege')
    expect(folderFor('/basisdaten/ertragskonten', all, runsAll)?.label).toBe('Produkte')
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
/**
 * The payment receipt gets a folder of its own, today with a single child.
 *
 * <p>The statement import and the clarification basket belong under the same roof and become
 * registers of this one. A flat row now would mean rebuilding the menu twice and moving it the
 * second time, after people learnt where it was (ADR-0037).
 */
describe('the payments folder', () => {
  const all = () => true
  const runsAll = () => true

  function payments() {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    return sales?.entries.find(
      (node): node is Extract<typeof node, { children: unknown }> =>
        isFolder(node) && node.label === 'Zahlungen',
    )
  }

  it('navGroupsFoldThePaymentsTest', () => {
    const folder = payments()

    expect(folder?.children.map((child) => child.href)).toEqual([
      PAYMENT_RECEIPT_PATH,
      CUSTOMER_CREDIT_PATH,
    ])
    // INVOICE_READ on both: what came in and what we owe are two sides of the same books,
    // and whoever may read one must read the other (backend ADR-0104).
    expect(folder?.children.every((child) => child.permission === 'INVOICE_READ')).toBe(true)
  })

  /** The credit is a register of the same folder, so an old bookmark lands beside it. */
  it('folderForHoldsTheCreditTest', () => {
    const folder = folderFor(CUSTOMER_CREDIT_PATH, all, runsAll)

    expect(folder?.label).toBe('Zahlungen')
    expect(folder?.children.map((child) => child.href)).toEqual(
      folderFor(PAYMENT_RECEIPT_PATH, all, runsAll)?.children.map((child) => child.href),
    )
  })

  /**
   * No module switch: the receipt hangs on `document`, and there is nothing to switch off —
   * the same reason the open items carry none.
   */
  it('navGroupsLeaveThePaymentsUnswitchedTest', () => {
    const folder = payments()

    expect(folder?.module).toBeUndefined()
    expect(folder?.children.every((child) => child.module === undefined)).toBe(true)
  })

  /**
   * The proof test: in the order a sale runs through them — billed, then paid, and only then
   * the roofs that ask about a state.
   */
  it('navGroupsPutThePaymentsAfterTheInvoiceTest', () => {
    const sales = NAV_GROUPS.find((group) => group.title === 'Verkauf')
    const labels = (sales?.entries ?? []).map((entry) => entry.label)

    expect(labels.indexOf('Zahlungen')).toBe(labels.indexOf('Rechnungen') + 1)
    expect(labels.indexOf('Zahlungen')).toBeLessThan(labels.indexOf('Offene Posten'))
  })

  it('folderForHoldsThePaymentsTest', () => {
    const folder = folderFor(PAYMENT_RECEIPT_PATH, all, runsAll)

    expect(folder?.label).toBe('Zahlungen')
  })

  /** A viewer without INVOICE_READ never sees the roof either. */
  it('folderForHidesThePaymentsWithoutTheRightTest', () => {
    expect(folderFor(PAYMENT_RECEIPT_PATH, () => false, runsAll)).toBeNull()
  })
})
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

/**
 * Every value the tenant maintains stands in one row, and none of them got harder to find.
 *
 * <p>ADR-0004 abolished a collective mask whose registers had no address and no name in the
 * menu. These have both — which is why it stays in force (ADR-0035).
 */
describe('the values folder', () => {
  function systemEntries() {
    const group = NAV_GROUPS.find((g) => g.title === 'Systemeinstellungen')
    return group?.entries ?? []
  }

  /**
   * The proof test: nine addresses, in this order, and the folder stands first.
   *
   * <p>The only test that goes red on a wrong order, a forgotten child or a folder in second
   * place. `navGroupsCoverEveryBasicDataListTest` cannot see any of the three — it flattens.
   */
  it('flattenNavHoldsTheValuesFolderTest', () => {
    const flat = flattenNav(systemEntries()).map((entry) => entry.href)

    expect(flat.slice(0, 9)).toEqual([
      '/basisdaten/zahlungsarten',
      '/basisdaten/einheiten',
      '/basisdaten/waehrungen',
      '/basisdaten/sprachen',
      '/basisdaten/laender',
      '/basisdaten/rechtsformen',
      '/basisdaten/anreden',
      '/feste-werte',
      '/mehrwertsteuer',
    ])
    expect(flat[9]).toBe('/mandanten')
  })

  it('navGroupsHoldTheValuesFolderFirstTest', () => {
    const first = systemEntries()[0]

    expect(first && isFolder(first) && first.label).toBe('Werte')
  })

  /**
   * The VAT rates run on PRODUCT_READ, not on MASTERDATA_READ — the rates are federal.
   *
   * <p>This survives the folding because `allowed()` applies the permission to entries and
   * filters children one by one; the permission on the folder head is not read. Whoever one
   * day «corrects» that gets this test red, and then takes the right off the head rather than
   * the register out of the folder.
   */
  it('visibleNavGroupsKeepsTheVatRegisterWithoutTheMasterDataRightTest', () => {
    const visible = visibleNavGroups((permission) => permission === 'PRODUCT_READ', () => true)
    const group = visible.find((g) => g.title === 'Systemeinstellungen')
    const folder = group?.entries.find((node) => isFolder(node) && node.label === 'Werte')

    expect(folder && isFolder(folder) && folder.children.map((child) => child.href)).toEqual([
      '/mehrwertsteuer',
    ])
  })
})

/**
 * The last two folds of the settings — and the one row that must not fold.
 */
describe('the tenant and access folders', () => {
  function systemEntries() {
    return NAV_GROUPS.find((group) => group.title === 'Systemeinstellungen')?.entries ?? []
  }

  function folder(label: string) {
    const node = systemEntries().find((entry) => isFolder(entry) && entry.label === label)
    if (!node || !isFolder(node)) throw new Error(`folder ${label} missing`)
    return node
  }

  it('navGroupsHoldTheTenantFolderTest', () => {
    const tenant = folder('Mandant')

    expect(tenant.children.map((child) => child.href)).toEqual([
      '/mandanten',
      OUTBOX_ACCOUNT_PATH,
    ])
    // The switch stays on the child: on the head it would take the master data with it.
    expect(tenant.module).toBeUndefined()
    expect(tenant.children.map((child) => child.module)).toEqual([undefined, 'OUTBOX'])
  })

  it('navGroupsHoldTheAccessFolderTest', () => {
    const access = folder('Zugang')

    expect(access.children.map((child) => child.href)).toEqual([
      '/benutzer',
      '/rollen',
      SECURITY_PATH,
    ])
    // No permission on the head — see visibleNavGroupsGrantsNothingElseToASuperuserTest.
    expect(access.permission).toBeUndefined()
  })

  /**
   * The four top rows, and «Module» flat among them.
   *
   * <p>A folder may carry a module, and `allowed` then throws the whole folder away. The one
   * screen that governs the switches must never be able to go down with one of them
   * (ADR-0018, ADR-0036).
   */
  it('navGroupsKeepTheModuleScreenFlatBetweenTheFoldersTest', () => {
    const labels = systemEntries().map((entry) => entry.label)

    expect(labels).toEqual(['Werte', 'Mandant', 'Module', 'Zugang'])
    const module = systemEntries()[2]
    expect(isFolder(module)).toBe(false)
  })
})

/**
 * The bookkeeping is one folder under «Moduleinstellungen» — and no group of its own.
 *
 * <p>A group «Buchhaltung» would need entries pointing at screens that do not exist yet; it
 * comes with the first screen that posts something and the journal that reads it back
 * (frontend ADR-0044, backend ADR-0119).
 */
describe('the accounting folder', () => {
  const all = () => true

  function accounting() {
    const module = NAV_GROUPS.find((group) => group.title === 'Moduleinstellungen')
    return module?.entries.find((node) => isFolder(node) && node.label === 'Buchhaltung')
  }

  it('accountingFolderNeedsAccountingReadTest', () => {
    const folder = accounting()
    if (!folder || !isFolder(folder)) throw new Error('folder missing')

    // The switch sits on the head AND on the child: nothing here has to survive it. The
    // archive entry that does belongs to a later delivery.
    expect(folder.module).toBe('ACCOUNTING')
    // The chart of accounts stands first: it is what a tenant lays out on the first day. The
    // tax codes follow it, because a copy from a template lays out both in one step. The fiscal
    // years come before the settings — the lock date over there only bites once a year exists.
    expect(folder.children.map((child) => child.href)).toEqual([
      CHART_OF_ACCOUNTS_PATH,
      TAX_CODES_PATH,
      FISCAL_YEARS_PATH,
      ACCOUNTING_SETTINGS_PATH,
    ])
    // «Zustand» no longer: from the fiscal year on the screen sets something, and the address
    // stayed where it was.
    expect(folder.children.map((child) => child.label)).toEqual([
      'Kontenplan',
      'Steuercodes',
      'Geschäftsjahre',
      'Einstellungen',
    ])
    expect(folder.children.map((child) => child.label)).not.toContain('Zustand')
    expect(folder.children.map((child) => child.permission)).toEqual([
      ACCOUNTING_RIGHTS.read,
      ACCOUNTING_RIGHTS.read,
      ACCOUNTING_RIGHTS.read,
      ACCOUNTING_RIGHTS.read,
    ])
    expect(folder.children.map((child) => child.module)).toEqual([
      'ACCOUNTING',
      'ACCOUNTING',
      'ACCOUNTING',
      'ACCOUNTING',
    ])

    const withoutTheRight = visibleNavGroups(
      (permission) => permission !== ACCOUNTING_RIGHTS.read,
      all,
    )
    const reachable = withoutTheRight
      .flatMap((group) => flattenNav(group.entries))
      .map((entry) => entry.href)
    expect(reachable).not.toContain(ACCOUNTING_SETTINGS_PATH)
    expect(reachable).not.toContain(CHART_OF_ACCOUNTS_PATH)
    expect(reachable).not.toContain(TAX_CODES_PATH)
    expect(reachable).not.toContain(FISCAL_YEARS_PATH)
  })

  it('accountingFolderVanishesWithoutTheModuleTest', () => {
    const withoutAccounting = visibleNavGroups(all, (module) => module !== 'ACCOUNTING')
    const module = withoutAccounting.find((group) => group.title === 'Moduleinstellungen')

    expect(module?.entries.some((node) => isFolder(node) && node.label === 'Buchhaltung')).toBe(
      false,
    )
    const reachable = withoutAccounting
      .flatMap((group) => flattenNav(group.entries))
      .map((entry) => entry.href)
    expect(reachable).not.toContain(ACCOUNTING_SETTINGS_PATH)
    expect(reachable).not.toContain(CHART_OF_ACCOUNTS_PATH)
    expect(reachable).not.toContain(TAX_CODES_PATH)
    expect(reachable).not.toContain(FISCAL_YEARS_PATH)
    // The typed address is caught by RequireTenant, not by the menu — this only tidies it.
    expect(folderFor(ACCOUNTING_SETTINGS_PATH, all, (module) => module !== 'ACCOUNTING')).toBeNull()
    expect(folderFor(CHART_OF_ACCOUNTS_PATH, all, (module) => module !== 'ACCOUNTING')).toBeNull()
    expect(folderFor(TAX_CODES_PATH, all, (module) => module !== 'ACCOUNTING')).toBeNull()
    expect(folderFor(FISCAL_YEARS_PATH, all, (module) => module !== 'ACCOUNTING')).toBeNull()
  })

  /** The two live side by side: set up in the folder, worked in the group (ADR-0011). */
  it('accountingFolderStandsBesideTheGroupTest', () => {
    expect(NAV_GROUPS.map((group) => group.title)).toContain('Buchhaltung')
    expect(accounting()).toBeDefined()
  })
})

/**
 * The menu group «Buchhaltung», built with #92.
 *
 * <p>It replaces `accountingHasNoOwnGroupYetTest`, which held the earlier state on purpose so
 * that the group would appear deliberately and not in passing (ADR-0044 section 2). This is the
 * delivery that gives it a content, so the old assertion is not weakened but answered.
 */
describe('the accounting group', () => {
  const all = () => true

  function group() {
    return NAV_GROUPS.find((candidate) => candidate.title === 'Buchhaltung')
  }

  it('accountingGroupHasThreeEntriesTest', () => {
    const entries = flattenNav(group()?.entries ?? [])

    expect(entries.map((entry) => entry.label)).toEqual(['Buchen', 'Entwürfe', 'Journal'])
    expect(entries.map((entry) => entry.href)).toEqual([ENTRY_PATH, DRAFT_PATH, JOURNAL_PATH])
    // Typing needs the write right; reading what is waiting and what is booked needs the read
    // one. Posting is asked for at the button, not at the menu entry.
    expect(entries.map((entry) => entry.permission)).toEqual([
      ACCOUNTING_RIGHTS.write,
      ACCOUNTING_RIGHTS.read,
      ACCOUNTING_RIGHTS.read,
    ])
    expect(entries.map((entry) => entry.module)).toEqual([
      'ACCOUNTING',
      'ACCOUNTING',
      'ACCOUNTING',
    ])
  })

  /** The order of the groups is the order of the working day: sale, books, warehouse. */
  it('accountingGroupStandsBetweenSalesAndInventoryTest', () => {
    const titles = NAV_GROUPS.map((candidate) => candidate.title)

    expect(titles.indexOf('Buchhaltung')).toBe(titles.indexOf('Verkauf') + 1)
    expect(titles.indexOf('Lager')).toBe(titles.indexOf('Buchhaltung') + 1)
  })

  /**
   * `NavGroup` carries no `module` field, and this is what stands in for one: all three entries
   * fall, `visibleNavGroups` is left with an empty group and throws it away.
   */
  it('accountingGroupVanishesWithoutTheModuleTest', () => {
    const withoutAccounting = visibleNavGroups(all, (module) => module !== 'ACCOUNTING')

    expect(withoutAccounting.map((candidate) => candidate.title)).not.toContain('Buchhaltung')
    const reachable = withoutAccounting
      .flatMap((candidate) => flattenNav(candidate.entries))
      .map((entry) => entry.href)
    expect(reachable).not.toContain(ENTRY_PATH)
    expect(reachable).not.toContain(DRAFT_PATH)
    expect(reachable).not.toContain(JOURNAL_PATH)
  })

  /** The group is a heading and no folder: its entries carry no register strip. */
  it('accountingGroupIsNoFolderTest', () => {
    expect((group()?.entries ?? []).some(isFolder)).toBe(false)
    expect(folderFor(ENTRY_PATH, all, all)).toBeNull()
    expect(folderFor(DRAFT_PATH, all, all)).toBeNull()
    expect(folderFor(JOURNAL_PATH, all, all)).toBeNull()
  })

  /** Somebody who may read but not type keeps the two reading screens and loses «Buchen». */
  it('accountingGroupWithoutTheWriteRightTest', () => {
    const reading = visibleNavGroups(
      (permission) => permission !== ACCOUNTING_RIGHTS.write,
      all,
    ).find((candidate) => candidate.title === 'Buchhaltung')

    expect(flattenNav(reading?.entries ?? []).map((entry) => entry.href)).toEqual([
      DRAFT_PATH,
      JOURNAL_PATH,
    ])
  })
})
