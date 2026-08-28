import {
  ArrowLeftRight,
  BellRing,
  Blocks,
  BookmarkCheck,
  BookOpen,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  Ellipsis,
  FileText,
  FileType2,
  Globe,
  HandCoins,
  Hash,
  Languages,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Mail,
  MailPlus,
  Package,
  PackageCheck,
  Percent,
  Printer,
  Receipt,
  ReceiptText,
  Ruler,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  Tags,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { basicDataFor } from '../lib/basicData'
import { STOCK_AS_OF_PATH } from '../lib/inventory'
import { MODULE_PATH, MODULE_RIGHTS } from '../lib/modules'
import {
  MAIL_TEMPLATE_PATH,
  OUTBOX_ACCOUNT_PATH,
  OUTBOX_MODULE,
  OUTBOX_PATH,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import { salesDocumentFor } from '../lib/salesDocument'
import type { DocumentCategory } from '../lib/types'

/**
 * A module a tenant can switch off altogether.
 *
 * <p>Visibility then has two sources: the permission says **who** may, the switch says
 * whether the tenant **runs** the module at all. Both have to agree — see ADR-0060 of the
 * backend.
 *
 * <p>The values are the backend codes, spelling included. A translation table between menu
 * key and backend code was weighed and dropped: it would be the second place where somebody
 * forgets a module (ADR-0018).
 */
export type NavModule = 'INVENTORY' | 'OUTBOX'

/** One navigation entry: a screen the sidebar links to. */
export type NavEntry = {
  label: string
  icon: LucideIcon
  href: string
  /** Left out for entries everyone may open, such as the overview. */
  permission?: string
  /** Set where the entry belongs to a module the tenant may have switched off. */
  module?: NavModule
}

/**
 * An entry that folds open instead of leading anywhere itself.
 *
 * <p>For screens that belong together and of which one is needed at a time. Without it the
 * base data would stand as twelve rows in a row, which is the wall of entries this menu was
 * reorganised to get rid of.
 */
export type NavFolder = {
  label: string
  icon: LucideIcon
  permission?: string
  /** Set where the whole folder belongs to a module the tenant may have switched off. */
  module?: NavModule
  /** The screens inside. The folder itself is no route. */
  children: NavEntry[]
}

export type NavNode = NavEntry | NavFolder

/** Whether a node folds open or leads somewhere. */
export function isFolder(node: NavNode): node is NavFolder {
  return 'children' in node
}

/** Everything under one heading in the sidebar. */
export type NavGroup = { title: string; entries: NavNode[] }

/** Right of the master data module; every maintained list is behind it. */
const MASTER_DATA = 'MASTERDATA_READ'

/**
 * A menu entry for one maintained list.
 *
 * <p>Wording and address come from {@link BASIC_DATA_LISTS}, so renaming a list there renames
 * it in the menu too. Only the icon is decided here — it is a React component and has no place
 * in `lib/`. An unknown slug shows up as itself rather than as an empty row, and
 * `navigation.test.ts` catches it.
 *
 * @param slug the path segment of the list
 * @param icon what the entry shows, also in the folded rail
 */
function listEntry(slug: string, icon: LucideIcon): NavEntry {
  return {
    label: basicDataFor(slug)?.label ?? slug,
    icon,
    href: `/basisdaten/${slug}`,
    permission: MASTER_DATA,
  }
}

/**
 * A menu entry for one kind of sales document.
 *
 * <p>Wording, address and right come from {@link SALES_DOCUMENT_KINDS} — the same table the
 * routes are built from — so an entry cannot point at a screen the router does not know or ask
 * for a right the mask does not check. Only the icon is decided here, as it is a React
 * component and has no place in `lib/`.
 *
 * <p>A category without a kind would lead to the overview, which shows up as a duplicate
 * address in `navigation.test.ts` rather than as a row that quietly goes nowhere.
 *
 * @param category the kind of document, as the backend spells it
 * @param icon what the entry shows, also in the folded rail
 */
function salesEntry(category: DocumentCategory, icon: LucideIcon): NavEntry {
  const kind = salesDocumentFor(category)
  return {
    label: kind?.plural ?? category,
    icon,
    href: kind?.path ?? '/',
    permission: kind?.rights.read,
  }
}

/**
 * The navigation, and with it the map of the application.
 *
 * <p>Only what the backend answers is listed. A module without a controller would be an entry
 * leading to an empty screen, which reads as a defect rather than as a promise.
 *
 * <p>The records worked on daily are at the top. Everything set up rather than worked on
 * splits into two groups (see ADR-0011): «Systemeinstellungen» holds the values several
 * modules read, «Moduleinstellungen» holds one folder per module with what only that module
 * reads. A folder disappears with the rights to its screens — the stand-in for the licence
 * switch that will decide module visibility later. `navigation.test.ts` checks that no
 * maintained list is forgotten.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Übersicht',
    entries: [{ label: 'Dashboard', icon: LayoutGrid, href: '/' }],
  },
  {
    title: 'Verkauf',
    // In the order a sale runs through them, not alphabetically: what is offered, ordered,
    // delivered and then billed. The Gutschrift is missing on purpose — it is written from the
    // invoice it corrects and has no list of its own.
    entries: [
      salesEntry('OFFER', FileText),
      salesEntry('ORDER', ClipboardList),
      salesEntry('DELIVERY_NOTE', PackageCheck),
      salesEntry('INVOICE', ReceiptText),
    ],
  },
  {
    // The working screens of the inventory, as opposed to its setup one group further down.
    // The group grows with the reservations, the stocktake and the as-of report; it
    // disappears with the module switch of the tenant.
    title: 'Lager',
    entries: [
      // «Wieviel habe ich wovon, und wo?» is the question somebody opens the inventory with,
      // so the stock stands first and the journal explaining it second.
      {
        label: 'Bestand',
        icon: Boxes,
        href: '/bestand',
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
      {
        label: 'Unterdeckung',
        icon: TriangleAlert,
        href: '/unterdeckung',
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
      // Between the shortfalls and the journal: it answers «why is verfügbar lower than
      // Bestand», which is the question the two screens above provoke.
      {
        label: 'Reservierungen',
        icon: BookmarkCheck,
        href: '/reservierungen',
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
      {
        label: 'Bewegungen',
        icon: ArrowLeftRight,
        href: '/lagerbewegungen',
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
      // Last of the group: an inventory is a thing one does now and then, while the four
      // above answer questions that come up every day.
      {
        label: 'Inventuren',
        icon: ClipboardCheck,
        href: '/inventuren',
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
      // Behind the count lists, because it answers the question they raise: a count says who
      // counted what, the report says what stood there on a day. Since counting runs without
      // closing the store, the two are not the same figure (backend ADR-0071).
      {
        label: 'Inventar',
        icon: CalendarClock,
        href: STOCK_AS_OF_PATH,
        permission: 'INVENTORY_READ',
        module: 'INVENTORY',
      },
    ],
  },
  {
    title: 'Stammdaten',
    entries: [
      { label: 'Kunden', icon: Users, href: '/kunden', permission: 'PARTNER_READ' },
      { label: 'Lieferanten', icon: Truck, href: '/lieferanten', permission: 'PARTNER_READ' },
      { label: 'Produkte', icon: Package, href: '/produkte', permission: 'PRODUCT_READ' },
      {
        // What is agreed with a buyer: when they pay, and at which price. Two screens,
        // because a payment term and a price group have nothing in common but the purpose.
        label: 'Verkaufskonditionen',
        icon: HandCoins,
        children: [
          {
            label: 'Zahlungskonditionen',
            icon: HandCoins,
            href: '/zahlungskonditionen',
            permission: MASTER_DATA,
          },
          {
            label: 'Preisgruppen',
            icon: Tags,
            href: '/preisgruppen',
            permission: 'PRODUCT_READ',
          },
          // Prices over the whole catalogue rather than one product at a time: the way a
          // price round is actually worked through (see ADR-0059 of the backend).
          {
            label: 'Schnellerfassung',
            icon: TableProperties,
            href: '/preise-erfassen',
            permission: 'PRODUCT_READ',
          },
        ],
      },
    ],
  },
  {
    // Values more than one module reads. What only one module reads sits one group lower.
    title: 'Systemeinstellungen',
    entries: [
      listEntry('zahlungsarten', CreditCard),
      listEntry('einheiten', Ruler),
      listEntry('waehrungen', Coins),
      // Not a maintained list: the rates are federal, carry no tenant and are read only.
      { label: 'MWST-Sätze', icon: Percent, href: '/mehrwertsteuer', permission: 'PRODUCT_READ' },
      // The structural values: renamable and hideable, but never added to or deleted.
      { label: 'Feste Werte', icon: Lock, href: '/feste-werte', permission: MASTER_DATA },
      {
        // Set up once and then left alone, so they sit one fold deeper than the rest.
        label: 'Weitere Werte',
        icon: Ellipsis,
        permission: MASTER_DATA,
        children: [
          listEntry('sprachen', Languages),
          listEntry('laender', Globe),
          listEntry('rechtsformen', Scale),
          listEntry('anreden', UserRound),
        ],
      },
      { label: 'Mandanten', icon: Building2, href: '/mandanten', permission: 'TENANT_READ' },
      // Between «Mandanten» and «Module»: the mail account is an operating setting of the
      // tenant, like its address — not a value a module reads (backend ADR-0082). It carries
      // the module, so a tenant that does not send sees no way to set up sending.
      {
        label: 'Postausgang',
        icon: Mail,
        href: OUTBOX_ACCOUNT_PATH,
        permission: OUTBOX_RIGHTS.read,
        module: OUTBOX_MODULE,
      },
      // Beside «Mandanten» and not under Moduleinstellungen: the sorting rule of ADR-0011 is
      // «how many modules read the value» — the module switch is read by every one of them.
      // It carries no `module` field of its own, on purpose: a screen that hides itself once
      // somebody switches everything off leaves no way back but psql (ADR-0018).
      { label: 'Module', icon: Blocks, href: MODULE_PATH, permission: MODULE_RIGHTS.read },
      { label: 'Benutzer', icon: UserCog, href: '/benutzer', permission: 'USER_READ' },
      { label: 'Rollen', icon: ShieldCheck, href: '/rollen', permission: 'USER_READ' },
    ],
  },
  {
    // One folder per module, holding what only that module reads. A folder vanishes with
    // the rights to its screens; later a licence will make that call (see ADR-0011).
    title: 'Moduleinstellungen',
    entries: [
      {
        // The screens behind one document: what kinds there are, what they print on, where
        // their numbers come from, and how they are billed and dunned. No permission of its
        // own — each screen has its own right, and the shell filters the children one by one.
        label: 'Belege',
        icon: FileType2,
        children: [
          {
            label: 'Belegarten',
            icon: FileType2,
            href: '/belegarten',
            permission: 'DOCUMENT_TYPE_READ',
          },
          // Not a selection list any more: a form has a drawing and an editor of its own.
          // The printer icon belongs to the devices below; a form is a template.
          {
            label: 'Druckvorlagen',
            icon: LayoutTemplate,
            href: '/druckvorlagen',
            permission: 'PRINT_LAYOUT_READ',
          },
          // The devices themselves, not what is printed on them: a Belegart names a
          // printer per copy, and a document takes that over when it is started.
          {
            label: 'Drucker',
            icon: Printer,
            href: '/drucker',
            permission: 'PRINTER_READ',
          },
          {
            label: 'Nummernkreise',
            icon: Hash,
            href: '/nummernkreise',
            permission: 'NUMBER_RANGE_READ',
          },
          // What went out and what did not. Beside the forms and the printers, because mail is
          // the third way a document leaves the house — and it is a screen rather than a line
          // on the document, because what failed has to be findable without knowing which
          // document it was (backend ADR-0084).
          {
            label: 'Postausgang',
            icon: Mail,
            href: OUTBOX_PATH,
            permission: OUTBOX_RIGHTS.read,
            module: OUTBOX_MODULE,
          },
          // Directly below it: the texts those mails go out with.
          {
            label: 'Mailvorlagen',
            icon: MailPlus,
            href: MAIL_TEMPLATE_PATH,
            permission: OUTBOX_RIGHTS.read,
            module: OUTBOX_MODULE,
          },
          listEntry('verrechnungsarten', Receipt),
          listEntry('mahnarten', BellRing),
        ],
      },
      {
        // What the tenant keeps and where. Only the setup lives here; the screens worked on
        // daily stand in the group «Lager» above.
        label: 'Lager',
        icon: Warehouse,
        module: 'INVENTORY',
        children: [
          {
            label: 'Lagerorte',
            icon: Warehouse,
            href: '/lagerorte',
            permission: 'INVENTORY_READ',
            module: 'INVENTORY',
          },
        ],
      },
      {
        label: 'Produkte',
        icon: Package,
        children: [
          // What the fifteen free places on a product mean. Set up once, then left alone.
          {
            label: 'Produkt-Freifelder',
            icon: SlidersHorizontal,
            href: '/produkt-freifelder',
            permission: 'PRODUCT_READ',
          },
          // Assigned on the product; the accounting that reads them comes later.
          listEntry('ertragskonten', BookOpen),
        ],
      },
    ],
  },
]

/**
 * The menu as one session sees it: filtered by permission and by the modules the tenant runs.
 *
 * <p>Filtering only tidies the sidebar. The backend refuses the request either way — with
 * 403 for a missing permission and with 409 for a module that is switched off.
 *
 * @param can  answers whether the session holds a permission
 * @param runs answers whether this tenant runs a switchable module. A lookup and not a total
 *             record, exactly parallel to `can`: with a record, every caller would have to
 *             name every module, and a forgotten key is a type error in a place nobody looks
 *             (ADR-0018)
 * @returns the groups with something left in them, in the order they stand
 */
export function visibleNavGroups(
  can: (permission: string) => boolean,
  runs: (module: NavModule) => boolean,
): NavGroup[] {
  const allowed = (node: NavNode): NavNode | null => {
    if (node.module !== undefined && !runs(node.module)) return null
    if (!isFolder(node)) return !node.permission || can(node.permission) ? node : null
    const children = node.children.filter(
      (child) =>
        (child.module === undefined || runs(child.module)) &&
        (!child.permission || can(child.permission)),
    )
    return children.length === 0 ? null : { ...node, children }
  }
  return NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.map(allowed).filter((entry) => entry !== null),
  })).filter((group) => group.entries.length > 0)
}

/**
 * Every entry of the menu, folders resolved.
 *
 * <p>The folded rail has no room to open anything, so it shows the entries themselves.
 *
 * @param entries the nodes of one group
 * @returns the screens behind them, in the order they stand
 */
export function flattenNav(entries: NavNode[]): NavEntry[] {
  return entries.flatMap((entry) => (isFolder(entry) ? entry.children : [entry]))
}
