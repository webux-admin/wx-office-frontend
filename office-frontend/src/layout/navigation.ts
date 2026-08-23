import {
  BellRing,
  BookOpen,
  Building2,
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
  Truck,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { basicDataFor } from '../lib/basicData'
import { salesDocumentFor } from '../lib/salesDocument'
import type { DocumentCategory } from '../lib/types'

/** One navigation entry: a screen the sidebar links to. */
export type NavEntry = {
  label: string
  icon: LucideIcon
  href: string
  /** Left out for entries everyone may open, such as the overview. */
  permission?: string
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
          listEntry('verrechnungsarten', Receipt),
          listEntry('mahnarten', BellRing),
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
