import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, Package, Tags, Truck, Users } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Spinner } from '../components/Spinner'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../auth/useAuth'
import { NoTenantNotice } from '../layout/RequireTenant'
import { useTenantId } from '../layout/useTenantId'
import { api } from '../lib/api'
import { formatAmount, formatCount, formatDate, formatLongDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery } from '../lib/paging'
import type { DocumentSummary, Page, Partner, PriceGroup } from '../lib/types'
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
 * @returns the query, whose data carries `totalElements`
 */
function useCount(tenantId: number | null, allowed: boolean, path: string, query: string) {
  return useQuery({
    queryKey: [path, tenantId, query],
    queryFn: () => api.get<Page<unknown>>(`/api/tenants/${tenantId}/${path}?${query}`),
    enabled: tenantId !== null && allowed,
  })
}

/** A module tile of the overview. */
type ModuleTile = {
  label: string
  icon: typeof Users
  /** Background of the icon square, one of the module colours. */
  tone: string
  permission: string
  href: string
  detail: (data: DashboardData) => string
}

type DashboardData = {
  customers: number
  suppliers: number
  products: number
  priceGroups: number
  openOrders: number
}

const TILES: ModuleTile[] = [
  {
    label: 'Kunden',
    icon: Users,
    tone: 'bg-module-kunden',
    permission: 'PARTNER_READ',
    href: '/kunden',
    detail: (data) => `${formatCount(data.customers)} aktiv`,
  },
  {
    label: 'Lieferanten',
    icon: Truck,
    tone: 'bg-module-lieferscheine',
    permission: 'PARTNER_READ',
    href: '/lieferanten',
    detail: (data) => `${formatCount(data.suppliers)} aktiv`,
  },
  {
    label: 'Aufträge',
    icon: ClipboardList,
    tone: 'bg-module-offerten',
    permission: 'ORDER_READ',
    href: '/auftraege',
    detail: (data) => `${formatCount(data.openOrders)} Entwürfe`,
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
]

/**
 * The overview after signing in.
 *
 * <p>Every tile leads somewhere and counts something the backend actually answers. A module
 * without a controller has no tile: a number nobody computed is worse than no tile at all.
 */
export function DashboardPage() {
  const { can } = useAuth()
  const tenantId = useTenantId()

  // A tile shows one number, so it asks for one row and reads the total off the page. The
  // unpaged version loaded every partner, product and document of the tenant to count them,
  // and the page grew with the data.
  const customers = useCount(tenantId, can('PARTNER_READ'), 'partners',
    listQuery({ role: 'customer', activeOnly: true, size: 1 }))
  const suppliers = useCount(tenantId, can('PARTNER_READ'), 'partners',
    listQuery({ role: 'supplier', activeOnly: true, size: 1 }))
  const productCount = useCount(tenantId, can('PRODUCT_READ'), 'products',
    listQuery({ activeOnly: true, size: 1 }))
  const openOrders = useCount(tenantId, can('ORDER_READ'), 'orders',
    listQuery({ status: ['DRAFT'], size: 1 }))

  const priceGroups = useQuery({
    queryKey: ['price-groups', tenantId],
    queryFn: () => api.get<PriceGroup[]>(`/api/tenants/${tenantId}/price-groups`),
    enabled: tenantId !== null && can('PRODUCT_READ'),
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
    queryKey: ['orders', tenantId, recentOrdersQuery],
    queryFn: () =>
      api.get<Page<DocumentSummary>>(`/api/tenants/${tenantId}/orders?${recentOrdersQuery}`),
    enabled: tenantId !== null && can('ORDER_READ'),
  })

  const data: DashboardData = {
    customers: customers.data?.totalElements ?? 0,
    suppliers: suppliers.data?.totalElements ?? 0,
    products: productCount.data?.totalElements ?? 0,
    priceGroups: priceGroups.data?.length ?? 0,
    openOrders: openOrders.data?.totalElements ?? 0,
  }

  const loading =
    customers.isPending ||
    suppliers.isPending ||
    productCount.isPending ||
    priceGroups.isPending ||
    openOrders.isPending
  const tiles = TILES.filter((tile) => can(tile.permission))

  return (
    <>
      <PageHeader title="Übersicht" subtitle={formatLongDate(new Date())} />

      {tenantId === null ? (
        <NoTenantNotice />
      ) : (
        <div className="px-8 pb-12">
          <section aria-busy={loading}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {tiles.map((tile, index) => (
                <motion.div
                  key={tile.label}
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
                      className={`mx-auto grid h-14 w-14 place-items-center rounded-[var(--radius-lg)] text-white ${tile.tone}`}
                    >
                      <tile.icon size={22} aria-hidden />
                    </span>
                    <h2 className="mt-4 text-[15px] font-semibold tracking-[-0.2px]">
                      {tile.label}
                    </h2>
                    <p className="mt-1 text-[13px] text-text-secondary">
                      {loading ? <Spinner size={12} /> : tile.detail(data)}
                    </p>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
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

/** The newest orders, so an unfinished draft is one click away. */
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
