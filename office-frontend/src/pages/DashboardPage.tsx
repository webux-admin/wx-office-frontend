import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ClipboardList,
  FileText,
  Package,
  PackageCheck,
  ReceiptText,
  Tags,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../auth/useAuth'
import type { NavModule } from '../layout/navigation'
import { NoTenantNotice } from '../layout/RequireTenant'
import { useTenantId } from '../layout/useTenantId'
import { api } from '../lib/api'
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateTime,
  formatLongDate,
} from '../lib/format'
import { INVENTORY_RIGHTS } from '../lib/inventory'
import { runsModule } from '../lib/modules'
import { originState } from '../lib/origin'
import { emptyPage, listQuery } from '../lib/paging'
import {
  OFFER_KIND,
  ORDER_KIND,
  SALES_DOCUMENT_KINDS,
  dueOfferRemindersKey,
  salesDocumentListKey,
  type SalesDocumentKind,
} from '../lib/salesDocument'
import type {
  DocumentCategory,
  DocumentSummary,
  DueOfferReminder,
  Page,
  Partner,
  PriceGroup,
} from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'

/**
 * What a mask opened from here returns to.
 *
 * <p>Without it, saving a record reached from the overview would drop the user into its list,
 * which is not where they were.
 */
const ORIGIN = originState('/', 'Übersicht')

/**
 * Asks a paged list for one row, to read the total off it.
 *
 * @param tenantId the tenant, null while none is chosen
 * @param allowed whether the signed in user may read that list at all
 * @param path the list, as its path segment
 * @param query the filters plus `size=1`
 * @param key where to file the answer; left out, the path names it. A tile whose number a
 *            mask has to be able to mark stale hands in the key that mask invalidates —
 *            otherwise the overview keeps counting what was true before the save.
 * @returns the query, whose data carries `totalElements`
 */
function useCount(tenantId: number | null, allowed: boolean, path: string, query: string,
                  key?: unknown[]) {
  return useQuery({
    queryKey: key ?? [path, tenantId, query],
    queryFn: () => api.get<Page<unknown>>(`/api/tenants/${tenantId}/${path}?${query}`),
    enabled: tenantId !== null && allowed,
  })
}

/** A module tile of the overview: what it is called, where it leads, what colour it wears. */
type ModuleTile = {
  label: string
  icon: typeof Users
  /** Background of the icon square, one of the module colours. */
  tone: string
  permission: string
  href: string
  /**
   * Set where the tile belongs to a module the tenant may have switched off.
   *
   * <p>Two sources, as in the sidebar: the permission says who may, the switch says whether
   * the tenant runs the module at all (backend ADR-0060).
   */
  module?: NavModule
}

/** A tile whose number comes out of the counts the overview fetches for all of them at once. */
type CountedTile = ModuleTile & { detail: (data: DashboardData) => string }

/** A tile of the sale, which asks for the drafts of its own kind. */
type SalesTile = ModuleTile & { kind: SalesDocumentKind }

type DashboardData = {
  customers: number
  suppliers: number
  products: number
  priceGroups: number
  shortages: number
}

const TILES: CountedTile[] = [
  {
    label: 'Kunden',
    icon: Users,
    tone: 'bg-module-kunden',
    permission: 'PARTNER_READ',
    href: '/kunden',
    detail: (data) => `${formatCount(data.customers)} aktiv`,
  },
  {
    // Not the Lieferschein colour any more: that one now belongs to the tile of the same name,
    // and two squares in one row wearing it would read as one thing split in two.
    label: 'Lieferanten',
    icon: Truck,
    tone: 'bg-module-zahlungen',
    permission: 'PARTNER_READ',
    href: '/lieferanten',
    detail: (data) => `${formatCount(data.suppliers)} aktiv`,
  },
  {
    label: 'Produkte',
    icon: Package,
    tone: 'bg-module-produkte',
    permission: 'PRODUCT_READ',
    href: '/produkte',
    detail: (data) => `${formatCount(data.products)} aktiv`,
  },
  {
    label: 'Preisgruppen',
    icon: Tags,
    tone: 'bg-module-buchhaltung',
    permission: 'PRODUCT_READ',
    href: '/preisgruppen',
    detail: (data) => `${formatCount(data.priceGroups)} Gruppen`,
  },
  {
    // The tile names the module and leads to its entrance; the number is a signal, not the
    // destination. Warning instead of blocking only works while somebody looks at it, and
    // this is where they look.
    label: 'Lager',
    icon: Warehouse,
    tone: 'bg-module-lager',
    permission: INVENTORY_RIGHTS.read,
    href: '/bestand',
    module: 'INVENTORY',
    detail: (data) =>
      data.shortages === 0
        ? 'Bestand gedeckt'
        : `${formatCount(data.shortages)} in Unterdeckung`,
  },
]

/**
 * The icon and the colour of each kind of document.
 *
 * <p>Everything else on such a tile — its name, its address and its right — comes from
 * {@link SALES_DOCUMENT_KINDS}, so a tile cannot lead somewhere the router does not go.
 *
 * <p>Three of the four have a colour named after them in `index.css`. The Auftrag has none and
 * takes the one nothing else claims, rather than a second copy of a neighbour's.
 */
const SALES_LOOKS: Partial<Record<DocumentCategory, { icon: typeof Users; tone: string }>> = {
  OFFER: { icon: FileText, tone: 'bg-module-offerten' },
  ORDER: { icon: ClipboardList, tone: 'bg-module-system' },
  DELIVERY_NOTE: { icon: PackageCheck, tone: 'bg-module-lieferscheine' },
  INVOICE: { icon: ReceiptText, tone: 'bg-module-rechnungen' },
}

/** One tile per kind of document, in the order a sale runs through them. */
const SALES_TILES: SalesTile[] = SALES_DOCUMENT_KINDS.map((kind) => ({
  label: kind.plural,
  // A kind added to the table without a look of its own still gets a tile rather than none.
  icon: SALES_LOOKS[kind.category]?.icon ?? FileText,
  tone: SALES_LOOKS[kind.category]?.tone ?? 'bg-module-system',
  permission: kind.rights.read,
  href: kind.path,
  kind,
}))

/** What a document tile counts: one row, to read the number of drafts off the page. */
const DRAFTS = listQuery({ status: ['DRAFT'], size: 1 })

/**
 * What the inventory tile counts: one row of the shortfall list.
 *
 * <p>No figure endpoint of its own — the number is the total of a page, and a second way of
 * counting would be a second answer (backend ADR-0063).
 */
const SHORTAGES = listQuery({ size: 1 })


/**
 * The overview after signing in.
 *
 * <p>Every tile leads somewhere and counts something the backend actually answers. A module
 * without a controller has no tile: a number nobody computed is worse than no tile at all.
 */
export function DashboardPage() {
  const { user, can } = useAuth()
  const tenantId = useTenantId()

  // Which switchable modules this tenant runs. The list travels with the session, exactly as
  // the sidebar reads it, so a tenant without an inventory gets no inventory tile.
  const runs = (module: NavModule) => runsModule(user?.tenants, user?.activeTenantId, module)
  const readsPartners = can('PARTNER_READ')
  const readsProducts = can('PRODUCT_READ')
  const countsShortages = runs('INVENTORY') && can(INVENTORY_RIGHTS.read)

  // A tile shows one number, so it asks for one row and reads the total off the page. The
  // unpaged version loaded every partner, product and document of the tenant to count them,
  // and the page grew with the data.
  const customers = useCount(tenantId, readsPartners, 'partners',
    listQuery({ role: 'customer', activeOnly: true, size: 1 }))
  const suppliers = useCount(tenantId, readsPartners, 'partners',
    listQuery({ role: 'supplier', activeOnly: true, size: 1 }))
  const productCount = useCount(tenantId, readsProducts, 'products',
    listQuery({ activeOnly: true, size: 1 }))

  const shortages = useCount(tenantId, countsShortages, 'inventory/stock/shortages', SHORTAGES)

  const priceGroups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
    enabled: tenantId !== null && readsProducts,
  })

  // "Last entered" is now asked for rather than guessed from the order rows happened to
  // arrive in.
  const recentPartnersQuery = listQuery({ activeOnly: true, sort: 'createdAt,desc', size: 6 })
  const recentPartners = useQuery({
    queryKey: ['partners', tenantId, recentPartnersQuery],
    queryFn: () =>
      api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${recentPartnersQuery}`),
    enabled: tenantId !== null && can('PARTNER_READ'),
  })

  const recentOrdersQuery = listQuery({ sort: 'documentDate,desc', size: 6 })
  const recentOrders = useQuery({
    queryKey: salesDocumentListKey(ORDER_KIND, tenantId, recentOrdersQuery),
    queryFn: () =>
      api.get<Page<DocumentSummary>>(`/api/tenants/${tenantId}/orders?${recentOrdersQuery}`),
    enabled: tenantId !== null && can('ORDER_READ'),
  })

  // The due follow-up reminders of the signed-in user; the backend narrows to their own.
  const dueReminders = useQuery({
    queryKey: dueOfferRemindersKey(tenantId),
    queryFn: () =>
      api.get<DueOfferReminder[]>(`/api/tenants/${tenantId}/offers/reminders/due`),
    enabled: tenantId !== null && can(OFFER_KIND.rights.read),
  })

  const data: DashboardData = {
    customers: customers.data?.totalElements ?? 0,
    suppliers: suppliers.data?.totalElements ?? 0,
    products: productCount.data?.totalElements ?? 0,
    priceGroups: priceGroups.data?.length ?? 0,
    shortages: shortages.data?.totalElements ?? 0,
  }

  // A disabled query stays pending for good, so a count only weighs on the loading state
  // while it is actually being asked for. Without that, the tile of one module would spin
  // for ever because the counts of another module are switched off.
  const loading =
    (readsPartners && (customers.isPending || suppliers.isPending)) ||
    (readsProducts && (productCount.isPending || priceGroups.isPending)) ||
    (countsShortages && shortages.isPending)
  const tiles = TILES.filter(
    (tile) => can(tile.permission) && (tile.module === undefined || runs(tile.module)),
  )
  const salesTiles = SALES_TILES.filter((tile) => can(tile.permission))

  return (
    <>
      <PageHeader title="Übersicht" subtitle={formatLongDate(new Date())} />

      {tenantId === null ? (
        <NoTenantNotice />
      ) : (
        <div className="px-8 pb-12">
          <section aria-busy={loading}>
            {/* Four across, so the sale stands in one row and the master data under it. */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {salesTiles.map((tile, index) => (
                <SalesDocumentTile
                  key={tile.kind.category}
                  tile={tile}
                  tenantId={tenantId}
                  index={index}
                />
              ))}
              {tiles.map((tile, index) => (
                <TileCard
                  key={tile.label}
                  tile={tile}
                  index={salesTiles.length + index}
                  detail={loading ? <Spinner size={12} /> : tile.detail(data)}
                />
              ))}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <DueReminders
                reminders={dueReminders.data ?? []}
                loading={dueReminders.isPending}
              />
              <RecentPartners
                partners={(recentPartners.data ?? emptyPage<Partner>()).content}
                loading={recentPartners.isPending}
              />
              <RecentOrders
                tenantId={tenantId}
                orders={(recentOrders.data ?? emptyPage<DocumentSummary>()).content}
                loading={recentOrders.isPending}
              />
            </div>
          </section>
        </div>
      )}
    </>
  )
}

/**
 * The visible half of a tile: the coloured square, the name and the one line under it.
 *
 * <p>The place in the grid staggers the tiles as they come in, and the line underneath is
 * handed over rather than computed, because two sorts of tile count in two ways.
 */
function TileCard({
  tile,
  index,
  detail,
}: {
  tile: ModuleTile
  index: number
  detail: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
    >
      <Link
        to={tile.href}
        className="block h-full rounded-[var(--radius-lg)] border border-line-subtle bg-surface p-6 text-center transition-shadow hover:shadow-card"
      >
        <span
          className={`mx-auto grid h-14 w-14 place-items-center rounded-[var(--radius-lg)] text-on-accent ${tile.tone}`}
        >
          <tile.icon size={22} aria-hidden />
        </span>
        <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.2px]">{tile.label}</h2>
        <p className="mt-1 text-[13px] text-text-secondary">{detail}</p>
      </Link>
    </motion.div>
  )
}

/**
 * One tile of the sale, with the drafts of its kind on it.
 *
 * <p>A component of its own, because the number belongs to one kind and a hook may not be
 * called in a loop. Four `useCount` calls in the overview would say the same thing four times
 * and would have to be written out again the day a fifth kind gets a mask.
 */
function SalesDocumentTile({
  tile,
  tenantId,
  index,
}: {
  tile: SalesTile
  tenantId: number
  index: number
}) {
  const { can } = useAuth()
  const drafts = useCount(tenantId, can(tile.permission), tile.kind.resource, DRAFTS,
    salesDocumentListKey(tile.kind, tenantId, DRAFTS))

  return (
    <TileCard
      tile={tile}
      index={index}
      detail={
        drafts.isPending ? (
          <Spinner size={12} />
        ) : (
          `${formatCount(drafts.data?.totalElements ?? 0)} Entwürfe`
        )
      }
    />
  )
}

/**
 * The follow-up reminders of the signed-in user that are due.
 *
 * <p>Only their own: a reminder is a personal note to call, not a work queue of the team.
 * Every row is already due — that is what the endpoint answers — so the moment stands in the
 * danger tone. The row leads straight onto the follow-up register of its offer.
 */
function DueReminders({
  reminders,
  loading,
}: {
  reminders: DueOfferReminder[]
  loading: boolean
}) {
  if (loading || reminders.length === 0) return null

  return (
    <section className="border-t border-line-subtle pt-6">
      <h2 className="text-overline text-text-tertiary">Nachfassen</h2>
      <ul className="mt-3 divide-y divide-line-subtle">
        {reminders.map((reminder) => (
          <li key={reminder.reminderId}>
            <Link
              to={`${OFFER_KIND.path}/${reminder.documentId}`}
              state={{ ...ORIGIN, tab: 'nachfassen' }}
              className="flex items-center gap-4 py-2.5 transition-colors hover:text-accent-text"
            >
              <span className="w-[104px] shrink-0 font-mono text-[12px] text-text-tertiary">
                {reminder.documentNumber ?? 'Entwurf'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {reminder.partnerName ?? '-'}
                {reminder.note && (
                  <span className="text-text-secondary"> · {reminder.note}</span>
                )}
              </span>
              <span className="shrink-0 text-[12px] text-danger">
                {formatDateTime(reminder.dueAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The partners entered last — asked for by createdAt, not guessed from the row order. */
function RecentPartners({ partners, loading }: { partners: Partner[]; loading: boolean }) {
  if (loading || partners.length === 0) return null

  return (
    <section className="border-t border-line-subtle pt-6">
      <h2 className="text-overline text-text-tertiary">Zuletzt erfasst</h2>
      <ul className="mt-3 divide-y divide-line-subtle">
        {partners.map((partner) => (
            <li key={partner.id}>
              <Link
                to={`${partner.isCustomer ? '/kunden' : '/lieferanten'}/${partner.id}`}
                state={ORIGIN}
                className="flex items-center gap-4 py-2.5 transition-colors hover:text-accent-text"
              >
                <span className="w-[72px] shrink-0 font-mono text-[12px] text-text-tertiary">
                  {partner.partnerNumber ?? '-'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{partner.name}</span>
                <span className="shrink-0 text-[12px] text-text-secondary">
                  {[partner.isCustomer && 'Kunde', partner.isSupplier && 'Lieferant']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}

/**
 * The newest orders, so an unfinished draft is one click away.
 *
 * <p>Orders and nothing else, although there are four kinds of document now: every kind is a
 * list of its own, and one list across all four would be four requests for six rows. The
 * heading says which kind it is, and the tile above leads to the rest.
 */
function RecentOrders({
  tenantId,
  orders,
  loading,
}: {
  tenantId: number
  orders: DocumentSummary[]
  loading: boolean
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  if (loading || orders.length === 0) return null

  return (
    <section className="border-t border-line-subtle pt-6">
      <h2 className="text-overline text-text-tertiary">Letzte Aufträge</h2>
      <ul className="mt-3 divide-y divide-line-subtle">
        {orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/auftraege/${order.id}`}
                state={ORIGIN}
                className="flex items-center gap-4 py-2.5 transition-colors hover:text-accent-text"
              >
                <span className="w-[104px] shrink-0 font-mono text-[12px] text-text-tertiary">
                  {order.documentNumber ?? 'Entwurf'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {order.partnerName ?? formatDate(order.documentDate)}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums">
                  {formatAmount(order.totalGross)}
                </span>
                <Badge tone={order.status === 'CANCELLED' ? 'danger' : 'muted'}>
                  {statusLabel(order.status)}
                </Badge>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}
