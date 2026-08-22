import {
  BellRing,
  BookOpen,
  Building2,
  ClipboardList,
  Coins,
  CreditCard,
  Ellipsis,
  FileType2,
  Globe,
  HandCoins,
  Hash,
  Languages,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Package,
  Percent,
  Printer,
  Receipt,
  Ruler,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Truck,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { basicDataFor } from '../lib/basicData'

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
 * The navigation, and with it the map of the application.
 *
 * <p>Only what the backend answers is listed. A module without a controller would be an entry
 * leading to an empty screen, which reads as a defect rather than as a promise.
 *
 * <p>Grouped by what somebody is doing, not by which module happens to own the table: the
 * records worked on daily are at the top, the values that steer them below, and what is set
 * up once at the bottom. The maintained lists used to hide behind tabs on one screen called
 * «Auswahllisten» — a word nobody looking for units would guess — so each is its own entry
 * now. `navigation.test.ts` checks that none of them is forgotten.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Übersicht',
    entries: [{ label: 'Dashboard', icon: LayoutGrid, href: '/' }],
  },
  {
    title: 'Verkauf',
    entries: [
      { label: 'Aufträge', icon: ClipboardList, href: '/auftraege', permission: 'ORDER_READ' },
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
        ],
      },
    ],
  },
  {
    title: 'Basisdaten',
    entries: [
      listEntry('zahlungsarten', CreditCard),
      listEntry('mahnarten', BellRing),
      listEntry('einheiten', Ruler),
      listEntry('waehrungen', Coins),
      // Not a maintained list: the rates are federal, carry no tenant and are read only.
      { label: 'MWST-Sätze', icon: Percent, href: '/mehrwertsteuer', permission: 'PRODUCT_READ' },
      listEntry('verrechnungsarten', Receipt),
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
          listEntry('ertragskonten', BookOpen),
        ],
      },
    ],
  },
  {
    title: 'Einstellungen',
    entries: [
      {
        // The three screens behind one document: what kinds there are, what they print on,
        // and where their numbers come from. As three entries in a row they read as three
        // unrelated lists, and the connection between a Belegart and its Druckvorlage was
        // exactly the thing nobody could see. No permission of its own — each screen has
        // its own right, and the shell filters the children one by one.
        label: 'Belegwesen',
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
        ],
      },
      // What the fifteen free places on a product mean. Set up once, then left alone --
      // which is why it sits here and not next to the articles themselves.
      {
        label: 'Produkt-Freifelder',
        icon: SlidersHorizontal,
        href: '/produkt-freifelder',
        permission: 'PRODUCT_READ',
      },
      // The structural values: renamable and hideable, but never added to or deleted.
      { label: 'Feste Werte', icon: Lock, href: '/feste-werte', permission: MASTER_DATA },
      { label: 'Mandanten', icon: Building2, href: '/mandanten', permission: 'TENANT_READ' },
      { label: 'Benutzer', icon: UserCog, href: '/benutzer', permission: 'USER_READ' },
      { label: 'Rollen', icon: ShieldCheck, href: '/rollen', permission: 'USER_READ' },
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
