import {
  ArrowDownToLine,
  ArrowLeftRight,
  Ban,
  Banknote,
  BellRing,
  MailWarning,
  ListOrdered,
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
  FileText,
  FileType2,
  Globe,
  Eraser,
  HandCoins,
  Hash,
  Landmark,
  Languages,
  ListChecks,
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
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  Tags,
  TriangleAlert,
  Truck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
} from '../lib/accounting'
import { basicDataFor } from '../lib/basicData'
import { STOCK_AS_OF_PATH } from '../lib/inventory'
import { SECURITY_PATH } from '../lib/loginPolicy'
import { MODULE_PATH, MODULE_RIGHTS, type LicensedModuleCode } from '../lib/modules'
import { OPEN_ITEM_PATH, OPEN_ITEM_RIGHTS, WRITE_OFF_RUN_PATH } from '../lib/openItem'
import { CUSTOMER_CREDIT_PATH, CUSTOMER_CREDIT_RIGHTS } from '../lib/customerCredit'
import {
  BANKING_MODULE,
  BANKING_RIGHTS,
  BANK_ACCOUNT_PATH,
  BANK_STATEMENT_PATH,
  BANK_TRANSACTION_PATH,
} from '../lib/banking'
import { MATCHING_RIGHTS, MATCH_RULE_PATH } from '../lib/matching'
import { CLEARING_PATH, CLEARING_RIGHTS } from '../lib/clearing'
import { PAYMENT_RECEIPT_PATH, PAYMENT_RECEIPT_RIGHTS } from '../lib/paymentReceipt'
import {
  MAIL_TEMPLATE_PATH,
  OUTBOX_ACCOUNT_PATH,
  OUTBOX_MODULE,
  OUTBOX_PATH,
  OUTBOX_RIGHTS,
} from '../lib/outbox'
import {
  DUNNING_LEVELS_PATH,
  DUNNING_MODULE,
  DUNNING_RIGHTS,
  DUNNING_SETTINGS_PATH,
  DUNNING_TEXTS_PATH,
  DUNNING_BLOCKS_PATH,
  DUNNING_NOTICES_PATH,
  DUNNING_WORKLIST_PATH,
} from '../lib/dunning'
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
 *
 * <p>Defined in `lib/modules.ts` and only named again here: the sidebar was the first place
 * that needed the list, the masks are the second, and one of the two would drift (ADR-0032).
 */
export type NavModule = LicensedModuleCode

/**
 * Which counter an entry shows beside its label.
 *
 * <p>A closed list, so an entry cannot name a source that does not exist. The test in
 * `navigation.test.ts` holds it against the sources the shell knows (ADR-0043).
 */
export type NavCounterKey = 'CLEARING'

/** One navigation entry: a screen the sidebar links to. */
export type NavEntry = {
  label: string
  icon: LucideIcon
  href: string
  /** Left out for entries everyone may open, such as the overview. */
  permission?: string
  /** Set where the entry belongs to a module the tenant may have switched off. */
  module?: NavModule
  /**
   * Set where the entry carries a number beside its label.
   *
   * <p>The most reliable of the three ways somebody is told about unassigned money, because
   * it is still there the next morning (ADR-0043).
   */
  counter?: NavCounterKey
  /**
   * Set where the screen decides something for the whole installation.
   *
   * <p>Not a permission, and deliberately so: every right in this system can be granted to a
   * role of a single tenant, and one tenant's administrator must not switch a setting the
   * other tenants live with (backend ADR-0090).
   */
  superuser?: boolean
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
      // Straight after the invoice, and before the two roofs that ask about a state: in the
      // order a sale runs through them, what is offered, ordered, delivered, billed and then
      // **paid**. «Was ist noch offen» only becomes answerable once the money is recorded.
      //
      // No module switch — the receipt hangs on `document` and there is nothing to switch
      // off, the same reason the folder below carries none (backend ADR-0103).
      //
      // A folder with one child today: the statement import and the clarification basket
      // belong under the same roof and become registers of this one. A flat row now would
      // mean rebuilding the menu twice and moving it the second time, after people learnt
      // where it was (ADR-0037).
      {
        label: 'Zahlungen',
        icon: Banknote,
        children: [
          {
            label: 'Zahlungseingänge',
            icon: Banknote,
            href: PAYMENT_RECEIPT_PATH,
            permission: PAYMENT_RECEIPT_RIGHTS.read,
          },
          // INVOICE_READ, not a right of its own: the credit balance is the other side of
          // the open items, and whoever may see the debtor list must see the liability
          // side — otherwise they read half the truth (backend ADR-0104).
          {
            label: 'Guthaben',
            icon: HandCoins,
            href: CUSTOMER_CREDIT_PATH,
            permission: CUSTOMER_CREDIT_RIGHTS.read,
          },
        ],
      },
      // Straight after the invoice: «was ist noch offen» is the next question after «was
      // haben wir geschrieben», and it is asked every day. Without a module switch — the
      // open item hangs on `document` and there is nothing to switch off (backend ADR-0091).
      //
      // A folder rather than two rows, and the collective run keeps its own screen: it is a
      // piece of work, not a detail of the list. What it gets is a roof — the folder is the
      // register strip above both screens, so neither is harder to find than before
      // (ADR-0031). No permission on the head: each child carries its own right.
      {
        label: 'Offene Posten',
        icon: Wallet,
        children: [
          {
            label: 'Offene Posten',
            icon: Wallet,
            href: OPEN_ITEM_PATH,
            permission: OPEN_ITEM_RIGHTS.read,
          },
          // INVOICE_READ, not the run right: reading the proposal is a read — only booking
          // it needs INVOICE_WRITE_OFF_RUN, and the screen asks for that at its button.
          {
            label: 'Kleindifferenzen',
            icon: Eraser,
            href: WRITE_OFF_RUN_PATH,
            permission: OPEN_ITEM_RIGHTS.read,
          },
        ],
      },
      // Right after the open items: a bank statement is where the answer to «ist das
      // bezahlt» comes from. Here and not under Moduleinstellungen — feeding statements in
      // is daily work.
      //
      // NO MODULE ON THE FOLDER, and the switch sits on the account master data alone. An
      // imported statement is a booking voucher with a ten-year retention, and a switch must
      // not hide it (backend ADR-0107) — the same reading as the issued reminders below.
      {
        label: 'Bank',
        icon: Landmark,
        permission: BANKING_RIGHTS.read,
        children: [
          {
            label: 'Bankauszüge',
            icon: Landmark,
            href: BANK_STATEMENT_PATH,
            permission: BANKING_RIGHTS.read,
          },
          {
            label: 'Bankposten',
            icon: ArrowDownToLine,
            href: BANK_TRANSACTION_PATH,
            permission: BANKING_RIGHTS.read,
          },
          // Under the module switch, and with the number beside it: whoever imported a
          // statement on Friday has to see on Monday that 29 payments are still waiting.
          {
            label: 'Klärung',
            icon: ListChecks,
            href: CLEARING_PATH,
            permission: CLEARING_RIGHTS.read,
            module: BANKING_MODULE,
            counter: 'CLEARING',
          },
          // Under the switch, unlike the two above: which accounts we receive statements
          // for is a setting, not correspondence that has to stay readable.
          {
            label: 'Bankkonten',
            icon: CreditCard,
            href: BANK_ACCOUNT_PATH,
            permission: BANKING_RIGHTS.importFile,
            module: BANKING_MODULE,
          },
          // Beside the accounts, because both answer «wie kommt eine Zahlung an ihre
          // Rechnung»: the accounts say which statements are accepted, the rules say what
          // is made of them. Under the module switch — a rule without statements decides
          // nothing (backend ADR-0108).
          {
            label: 'Zuordnungsregeln',
            icon: ListChecks,
            href: MATCH_RULE_PATH,
            permission: MATCHING_RIGHTS.read,
            module: BANKING_MODULE,
          },
        ],
      },
      // After the invoice, because that is where it follows on: what was billed and not
      // paid. Here and not under Moduleinstellungen — chasing money is daily work, the
      // setup of the dunning is not (backend ADR-0096). The setup itself stays over there;
      // this folder holds the three screens somebody works in (ADR-0033).
      //
      // NO MODULE ON THE FOLDER, and the switch sits on the children instead. What went out
      // is business correspondence with a ten-year retention, and a switch must not hide it
      // (backend ADR-0092) — so «Mahnungen» comes first and is what the folder head opens.
      // A tenant without the dunning keeps exactly that one register.
      {
        label: 'Mahnungen',
        icon: MailWarning,
        permission: DUNNING_RIGHTS.read,
        children: [
          {
            label: 'Mahnungen',
            icon: MailWarning,
            href: DUNNING_NOTICES_PATH,
            permission: DUNNING_RIGHTS.read,
          },
          {
            label: 'Mahnvorschlag',
            icon: BellRing,
            href: DUNNING_WORKLIST_PATH,
            permission: DUNNING_RIGHTS.read,
            module: DUNNING_MODULE,
          },
          // Who is deliberately not being chased. Under the module switch, unlike the
          // issued reminders: a stop is a setting of the dunning, not correspondence that
          // has to stay readable for ten years.
          {
            label: 'Mahnstopps',
            icon: Ban,
            href: DUNNING_BLOCKS_PATH,
            permission: DUNNING_RIGHTS.read,
            module: DUNNING_MODULE,
          },
        ],
      },
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
      // The article, its price, and the terms it is paid on — in that order, because that is
      // the order they come into being. «Verkaufskonditionen» is gone as a level of its own:
      // two clicks behind a word that stands on no screen is not in the menu any more
      // (ADR-0034). No permission on the head; the children carry theirs, so a session with
      // only MASTERDATA_READ still finds the payment terms here.
      {
        label: 'Produkte',
        icon: Package,
        children: [
          { label: 'Produkte', icon: Package, href: '/produkte', permission: 'PRODUCT_READ' },
          {
            label: 'Preisgruppen',
            icon: Tags,
            href: '/preisgruppen',
            permission: 'PRODUCT_READ',
          },
          // Prices over the whole catalogue rather than one product at a time: the way a
          // price round is actually worked through (see ADR-0059 of the backend). After the
          // price groups, because it is what fills them.
          {
            label: 'Schnellerfassung',
            icon: TableProperties,
            href: '/preise-erfassen',
            permission: 'PRODUCT_READ',
          },
          // Last: what is agreed with a buyer once there is a price — when they pay.
          {
            label: 'Zahlungskonditionen',
            icon: HandCoins,
            href: '/zahlungskonditionen',
            permission: MASTER_DATA,
          },
        ],
      },
    ],
  },
  {
    // Values more than one module reads. What only one module reads sits one group lower.
    title: 'Systemeinstellungen',
    entries: [
      // Every value the tenant maintains, in one row. «Weitere Werte» is gone: it could not
      // answer why the languages sat one fold deeper than the currencies, and both are set
      // up once and then left alone.
      //
      // Nothing becomes harder to find — each list keeps its name in the menu, its own
      // address and its own symbol in the folded rail (ADR-0035). The permission on the head
      // says whom the folder belongs to; the children are filtered one by one.
      {
        label: 'Werte',
        icon: ListChecks,
        permission: MASTER_DATA,
        children: [
          listEntry('zahlungsarten', CreditCard),
          listEntry('einheiten', Ruler),
          listEntry('waehrungen', Coins),
          listEntry('sprachen', Languages),
          listEntry('laender', Globe),
          listEntry('rechtsformen', Scale),
          listEntry('anreden', UserRound),
          // The structural values: renamable and hideable, but never added to or deleted.
          { label: 'Feste Werte', icon: Lock, href: '/feste-werte', permission: MASTER_DATA },
          // Not a maintained list: the rates are federal, carry no tenant and are read only —
          // which is why this one runs on PRODUCT_READ. It belongs here all the same: it and
          // «Feste Werte» point at each other, and a rate is a value like any other.
          {
            label: 'MWST-Sätze',
            icon: Percent,
            href: '/mehrwertsteuer',
            permission: 'PRODUCT_READ',
          },
        ],
      },
      // The firm, and the server its post goes out over. The mail account is an operating
      // setting of the tenant, like its address — not a value a module reads (backend
      // ADR-0082).
      //
      // THE MODULE SWITCH STAYS ON THE CHILD. On the folder it would take «Mandanten» with
      // it, and a tenant that does not send mail would lose its master data (ADR-0036).
      {
        label: 'Mandant',
        icon: Building2,
        permission: 'TENANT_READ',
        children: [
          {
            label: 'Mandanten',
            icon: Building2,
            href: '/mandanten',
            permission: 'TENANT_READ',
          },
          {
            label: 'Postausgang',
            icon: Mail,
            href: OUTBOX_ACCOUNT_PATH,
            permission: OUTBOX_RIGHTS.read,
            module: OUTBOX_MODULE,
          },
        ],
      },
      // Beside «Mandant» and not under Moduleinstellungen: the sorting rule of ADR-0011 is
      // «how many modules read the value» — the module switch is read by every one of them.
      // It carries no `module` field of its own, on purpose: a screen that hides itself once
      // somebody switches everything off leaves no way back but psql (ADR-0018).
      //
      // AND IT STAYS FLAT, for the same reason. A folder may carry a module, and then
      // `allowed` throws the whole folder away — the one screen that governs the switches
      // would go down with one of them. Its place between «Mandant» and «Zugang» is kept:
      // `flattenNav` replaces a folder by its children where it stands (ADR-0036).
      { label: 'Module', icon: Blocks, href: MODULE_PATH, permission: MODULE_RIGHTS.read },
      // Who gets in, with what, and how. NO PERMISSION ON THE HEAD: «Sicherheit» belongs to
      // no tenant and hangs on the superuser flag alone, so a right here would either let a
      // rightless session through to the other two or shut a superuser out of their own
      // screen (backend ADR-0090, ADR-0036).
      {
        label: 'Zugang',
        icon: UserCog,
        children: [
          { label: 'Benutzer', icon: UserCog, href: '/benutzer', permission: 'USER_READ' },
          { label: 'Rollen', icon: ShieldCheck, href: '/rollen', permission: 'USER_READ' },
          // The only entry in the group that belongs to no tenant: it decides how the whole
          // installation logs in. Shown to superusers alone — everybody else could read the
          // state and change nothing, and a screen with no button on it is a dead end.
          {
            label: 'Sicherheit',
            icon: ShieldAlert,
            href: SECURITY_PATH,
            superuser: true,
          },
        ],
      },
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
          listEntry('mahnstopp-gruende', Ban),
        ],
      },
      {
        // What becomes of the documents. Its own folder for the same reason as the dunning
        // below: the bookkeeping is a module of its own and vanishes with its switch.
        //
        // THE SWITCH SITS ON THE HEAD AND ON THE CHILD, unlike the dunning: nothing here has
        // to survive the switch. The archive entry that does is the one of #94, and there is
        // nothing posted yet it could show (backend ADR-0119).
        //
        // A folder with a single child today, and no group «Buchhaltung» anywhere: a group
        // whose entries point at nothing would be a promise this delivery does not keep. It
        // comes once there is something to post and a journal to read it back in.
        //
        // The entry is called «Zustand» and will be called «Einstellungen» once the fiscal
        // year gives it something to set. The address stays as it is — a label is cheap to
        // change, an address people have learnt is not (ADR-0037 read it the same way).
        label: 'Buchhaltung',
        icon: BookOpen,
        module: ACCOUNTING_MODULE,
        children: [
          {
            label: 'Zustand',
            icon: BookOpen,
            href: ACCOUNTING_SETTINGS_PATH,
            permission: ACCOUNTING_RIGHTS.read,
            module: ACCOUNTING_MODULE,
          },
        ],
      },
      {
        // What a tenant chases with. Its own folder rather than a line under «Belege»: the
        // dunning is a module of its own and vanishes with its switch, while the Belegarten
        // beside it do not (backend ADR-0092).
        label: 'Mahnwesen',
        icon: BellRing,
        module: DUNNING_MODULE,
        children: [
          {
            label: 'Einstellungen',
            icon: BellRing,
            href: DUNNING_SETTINGS_PATH,
            permission: DUNNING_RIGHTS.read,
            module: DUNNING_MODULE,
          },
          // Below the settings, because a level only means something once the run around it
          // is set up.
          {
            label: 'Mahnstufen',
            icon: ListOrdered,
            href: DUNNING_LEVELS_PATH,
            permission: DUNNING_RIGHTS.read,
            module: DUNNING_MODULE,
          },
          // Directly below the levels: a text belongs to a level, and the mask opens on one.
          {
            label: 'Mahntexte',
            icon: FileText,
            href: DUNNING_TEXTS_PATH,
            permission: DUNNING_RIGHTS.read,
            module: DUNNING_MODULE,
          },
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
  superuser = false,
): NavGroup[] {
  // Both have to hold: the entry is not superuser-only, or this session is one. Folders carry
  // no such flag — nothing behind a folder belongs to the installation rather than a tenant.
  const mayOpen = (entry: NavEntry) =>
    (entry.superuser !== true || superuser) && (!entry.permission || can(entry.permission))
  const allowed = (node: NavNode): NavNode | null => {
    if (node.module !== undefined && !runs(node.module)) return null
    if (!isFolder(node)) return mayOpen(node) ? node : null
    const children = node.children.filter(
      (child) => (child.module === undefined || runs(child.module)) && mayOpen(child),
    )
    return children.length === 0 ? null : { ...node, children }
  }
  return NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.map(allowed).filter((entry) => entry !== null),
  })).filter((group) => group.entries.length > 0)
}

/**
 * The folder one screen sits in, filtered for this session.
 *
 * <p><b>The register strip of a screen is its folder.</b> A folder is no route of its own —
 * its children are, and they are the screens that belong together. Deriving the strip from
 * the menu means it can never disagree with the menu, and bundling a screen into a folder
 * stops making it harder to find (ADR-0031).
 *
 * <p>Compared <b>exactly</b>, not with `startsWith` the way the sidebar folds: `/belegarten`
 * carries the strip, `/belegarten/42` does not. A full mask of one record is not one of the
 * siblings; it is what the sibling led to.
 *
 * <p>Filtered through {@link visibleNavGroups}, so the strip shows exactly the screens the
 * sidebar shows — one predicate, not a second copy of it.
 *
 * @param pathname  the address on display
 * @param can       answers whether the session holds a permission
 * @param runs      answers whether this tenant runs a switchable module
 * @param superuser whether the session belongs to a superuser
 * @returns the folder holding that address, or `null` for a screen that stands on its own
 */
export function folderFor(
  pathname: string,
  can: (permission: string) => boolean,
  runs: (module: NavModule) => boolean,
  superuser = false,
): NavFolder | null {
  for (const group of visibleNavGroups(can, runs, superuser)) {
    for (const node of group.entries) {
      if (!isFolder(node)) continue
      if (node.children.some((child) => child.href === pathname)) return node
    }
  }
  return null
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
